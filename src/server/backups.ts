import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  accounts,
  activityLogs,
  dailyClosings,
  exchangeRates,
  monthlyBackups,
  supportTickets,
  transactions,
  users,
} from '../db/schema.ts';
import { formatAED, getDubaiDateString } from '../lib/money.ts';
import { logActivity } from './activityLog.ts';
import { broadcastRealtimeEvent } from './realtime.ts';
import { getSystemSettings } from './settings.ts';

export type BackupDownloadFormat = 'xlsx' | 'json' | 'pdf';

export interface MonthBounds {
  month: string; // YYYY-MM
  year: number;
  monthNumber: number;
  daysInMonth: number;
  periodStart: string; // YYYY-MM-01
  periodEnd: string; // YYYY-MM-DD
  label: string; // e.g., November 2026
}

export interface DubaiMonthEndStatus {
  currentDate: string; // YYYY-MM-DD
  currentMonth: string; // YYYY-MM
  periodStart: string;
  periodEnd: string;
  daysInMonth: number;
  dayOfMonth: number;
  daysRemainingInMonth: number;
  isMonthEndToday: boolean;
  isNearMonthEnd: boolean; // <= 3 days remaining
  timezone: string;
}

export interface MonthlyBackupAccountRow {
  id: number;
  name: string;
  accountNumber: string;
  baseCurrency: string;
  status: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  initialOpeningBalanceAed: string;
  monthOpeningBalanceAed: string;
  monthlyCreditsAed: string;
  monthlyDebitsAed: string;
  monthEndBalanceAed: string;
  currentLiveBalanceAed: string;
  monthlyEntryCount: number;
}

export interface MonthlyBackupTransactionRow {
  id: number;
  date: string;
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: string;
  originalAmount: string;
  originalCurrency: string;
  amountAed: string;
  exchangeRate: string;
  convertedAmountInr: string;
  rateDate: string;
  rateSource: string;
  runningBalanceAed: string;
  status: string;
  reversalOfId: number | null;
  editReason: string | null;
  description: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
}

export interface MonthlyBackupDailyClosingRow {
  id: number;
  date: string;
  status: string;
  totalAdditionsAed: string;
  totalDeductionsAed: string;
  closingBalanceAed: string;
  totalAdditionsInr: string;
  totalDeductionsInr: string;
  closingBalanceInr: string;
  appliedRate: string;
  closedByName: string | null;
  closedAt: string | null;
  reopenReason: string | null;
}

export interface MonthlyBackupExchangeRateRow {
  id: number;
  effectiveDate: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  source: string;
  setByName: string;
  notes: string | null;
  createdAt: string;
}

export interface MonthlyBackupSupportRow {
  id: number;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  requesterUserId: number | null;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  routedToEmail: string;
  emailDeliveryStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBackupSnapshot {
  schemaVersion: string;
  month: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  totals: {
    accountCount: number;
    transactionCount: number;
    activeTransactionCount: number;
    reversedTransactionCount: number;
    dailyClosingCount: number;
    exchangeRateCount: number;
    supportTicketCount: number;
    activityLogCount: number;
    totalCreditsAed: string;
    totalDebitsAed: string;
    netMovementAed: string;
    totalCreditsInr: string;
    totalDebitsInr: string;
    netMovementInr: string;
    closingBalanceAed: string;
  };
  settingsSnapshot: {
    defaultCurrency: string;
    reportingCurrency: string;
    rateRefreshMode: string;
    rateRefreshSchedule: string;
    rateMarkup: string;
    timezone: string;
  };
  accounts: MonthlyBackupAccountRow[];
  transactions: MonthlyBackupTransactionRow[];
  dailyClosings: MonthlyBackupDailyClosingRow[];
  exchangeRates: MonthlyBackupExchangeRateRow[];
  supportTickets: MonthlyBackupSupportRow[];
}

export interface MonthlyBackupArchiveSummary {
  id: number;
  month: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  generationType: string;
  accountCount: number;
  transactionCount: number;
  dailyClosingCount: number;
  exchangeRateCount: number;
  supportTicketCount: number;
  totalCreditsAed: string;
  totalDebitsAed: string;
  totalCreditsInr: string;
  totalDebitsInr: string;
  closingBalanceAed: string;
  sha256Checksum: string;
  generatedById: number | null;
  generatedByName: string;
  createdAt: string;
  updatedAt: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function isValidMonthString(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function getDaysInMonth(year: number, monthNumber: number): number {
  if (monthNumber === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if (monthNumber === 4 || monthNumber === 6 || monthNumber === 9 || monthNumber === 11) {
    return 30;
  }
  return 31;
}

export function getMonthBounds(month: string): MonthBounds {
  if (!isValidMonthString(month)) {
    throw new Error(`Invalid month format "${month}" (expected YYYY-MM)`);
  }
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNumber = Number(monthStr);
  const daysInMonth = getDaysInMonth(year, monthNumber);
  const paddedDay = String(daysInMonth).padStart(2, '0');
  return {
    month,
    year,
    monthNumber,
    daysInMonth,
    periodStart: `${month}-01`,
    periodEnd: `${month}-${paddedDay}`,
    label: `${MONTH_NAMES[monthNumber - 1]} ${year}`,
  };
}

export function getDubaiMonthEndStatus(now: Date = new Date()): DubaiMonthEndStatus {
  const currentDate = getDubaiDateString(now, 'Asia/Dubai');
  const currentMonth = currentDate.slice(0, 7);
  const dayOfMonth = Number(currentDate.slice(8, 10));
  const bounds = getMonthBounds(currentMonth);
  const daysRemainingInMonth = Math.max(0, bounds.daysInMonth - dayOfMonth);
  return {
    currentDate,
    currentMonth,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    daysInMonth: bounds.daysInMonth,
    dayOfMonth,
    daysRemainingInMonth,
    isMonthEndToday: daysRemainingInMonth === 0,
    isNearMonthEnd: daysRemainingInMonth <= 3,
    timezone: 'Asia/Dubai',
  };
}

/**
 * Neutralizes leading formula characters in spreadsheet text fields so exported workbooks
 * never evaluate untrusted descriptions or user names as formulas.
 */
export function sanitizeSpreadsheetText(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function computeSnapshotChecksum(snapshot: MonthlyBackupSnapshot): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(snapshot));
  return hash.digest('hex');
}

function formatPdfInr(value: string | number | Decimal): string {
  const dec = new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dec.abs().toNumber());
  return dec.isNegative() ? `-Rs. ${absFormatted}` : `Rs. ${absFormatted}`;
}

/**
 * Queries Cloud SQL PostgreSQL to construct a complete, deterministic snapshot for `month` (YYYY-MM).
 */
export async function buildMonthlyBackupSnapshot(month: string): Promise<MonthlyBackupSnapshot> {
  const bounds = getMonthBounds(month);

  const [
    allAccounts,
    allUsers,
    txUpToEnd,
    closingRows,
    rateRows,
    ticketRows,
    activityCountRow,
    sysSettings,
  ] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.id)),
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select()
      .from(transactions)
      .where(lte(transactions.date, bounds.periodEnd))
      .orderBy(asc(transactions.date), asc(transactions.id)),
    db
      .select()
      .from(dailyClosings)
      .where(
        and(
          gte(dailyClosings.date, bounds.periodStart),
          lte(dailyClosings.date, bounds.periodEnd)
        )
      )
      .orderBy(asc(dailyClosings.date)),
    db
      .select()
      .from(exchangeRates)
      .where(
        and(
          gte(exchangeRates.effectiveDate, bounds.periodStart),
          lte(exchangeRates.effectiveDate, bounds.periodEnd)
        )
      )
      .orderBy(asc(exchangeRates.effectiveDate), asc(exchangeRates.id)),
    db
      .select({
        id: supportTickets.id,
        ticketNumber: supportTickets.ticketNumber,
        category: supportTickets.category,
        priority: supportTickets.priority,
        status: supportTickets.status,
        requesterUserId: supportTickets.requesterUserId,
        requesterName: supportTickets.requesterName,
        requesterEmail: supportTickets.requesterEmail,
        subject: supportTickets.subject,
        routedToEmail: supportTickets.routedToEmail,
        emailDeliveryStatus: supportTickets.emailDeliveryStatus,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .orderBy(asc(supportTickets.createdAt), asc(supportTickets.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(
        sql`to_char(${activityLogs.timestamp} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM') = ${month}`
      ),
    getSystemSettings(),
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
  const accMap = new Map(allAccounts.map((a) => [a.id, a]));

  const monthlyTickets = ticketRows.filter((t) => {
    const dubaiDate = getDubaiDateString(new Date(t.createdAt), 'Asia/Dubai');
    return dubaiDate >= bounds.periodStart && dubaiDate <= bounds.periodEnd;
  });

  // Per-account opening/closing accumulation strictly up to bounds.periodEnd
  const accountStats = new Map<
    number,
    {
      preMonthNetAed: Decimal;
      monthCreditsAed: Decimal;
      monthDebitsAed: Decimal;
      entryCount: number;
    }
  >();

  for (const acc of allAccounts) {
    accountStats.set(acc.id, {
      preMonthNetAed: new Decimal(0),
      monthCreditsAed: new Decimal(0),
      monthDebitsAed: new Decimal(0),
      entryCount: 0,
    });
  }

  let totalCreditsAed = new Decimal(0);
  let totalDebitsAed = new Decimal(0);
  let totalCreditsInr = new Decimal(0);
  let totalDebitsInr = new Decimal(0);
  let activeTransactionCount = 0;
  let reversedTransactionCount = 0;

  const monthlyTxRows: MonthlyBackupTransactionRow[] = [];

  for (const tx of txUpToEnd) {
    const stat = accountStats.get(tx.accountId);
    const amtAed = new Decimal(tx.amount);
    if (tx.date < bounds.periodStart) {
      if (stat) {
        stat.preMonthNetAed =
          tx.type === 'CREDIT'
            ? stat.preMonthNetAed.plus(amtAed)
            : stat.preMonthNetAed.minus(amtAed);
      }
      continue;
    }

    // Transaction is inside [periodStart, periodEnd]
    if (stat) {
      stat.entryCount += 1;
      if (tx.type === 'CREDIT') {
        stat.monthCreditsAed = stat.monthCreditsAed.plus(amtAed);
      } else {
        stat.monthDebitsAed = stat.monthDebitsAed.plus(amtAed);
      }
    }

    if (tx.type === 'CREDIT') {
      totalCreditsAed = totalCreditsAed.plus(amtAed);
      totalCreditsInr = totalCreditsInr.plus(tx.convertedAmountInr);
    } else {
      totalDebitsAed = totalDebitsAed.plus(amtAed);
      totalDebitsInr = totalDebitsInr.plus(tx.convertedAmountInr);
    }

    if (tx.status === 'REVERSED') {
      reversedTransactionCount += 1;
    } else {
      activeTransactionCount += 1;
    }

    const acc = accMap.get(tx.accountId);
    monthlyTxRows.push({
      id: tx.id,
      date: tx.date,
      accountId: tx.accountId,
      accountNumber: acc?.accountNumber ?? '',
      accountName: acc?.name ?? `Account #${tx.accountId}`,
      type: tx.type,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency,
      amountAed: tx.amount,
      exchangeRate: tx.exchangeRate,
      convertedAmountInr: tx.convertedAmountInr,
      rateDate: tx.rateDate,
      rateSource: tx.rateSource,
      runningBalanceAed: tx.runningBalance,
      status: tx.status,
      reversalOfId: tx.reversalOfId ?? null,
      editReason: tx.editReason ?? null,
      description: tx.description,
      createdById: tx.createdById,
      createdByName: userMap.get(tx.createdById) ?? 'System',
      createdAt: new Date(tx.createdAt).toISOString(),
    });
  }

  let totalClosingBalanceAed = new Decimal(0);
  const accountBackupRows: MonthlyBackupAccountRow[] = allAccounts.map((acc) => {
    const stat = accountStats.get(acc.id)!;
    const initialOpen = new Decimal(acc.openingBalance);
    const monthOpening = initialOpen
      .plus(stat.preMonthNetAed)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const monthEnd = monthOpening
      .plus(stat.monthCreditsAed)
      .minus(stat.monthDebitsAed)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalClosingBalanceAed = totalClosingBalanceAed.plus(monthEnd);

    return {
      id: acc.id,
      name: acc.name,
      accountNumber: acc.accountNumber,
      baseCurrency: acc.baseCurrency,
      status: acc.status,
      contactEmail: acc.contactEmail ?? null,
      contactPhone: acc.contactPhone ?? null,
      contactAddress: acc.contactAddress ?? null,
      initialOpeningBalanceAed: initialOpen.toFixed(2),
      monthOpeningBalanceAed: monthOpening.toFixed(2),
      monthlyCreditsAed: stat.monthCreditsAed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      monthlyDebitsAed: stat.monthDebitsAed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      monthEndBalanceAed: monthEnd.toFixed(2),
      currentLiveBalanceAed: acc.currentBalance,
      monthlyEntryCount: stat.entryCount,
    };
  });

  const closingBackupRows: MonthlyBackupDailyClosingRow[] = closingRows.map((c) => ({
    id: c.id,
    date: c.date,
    status: c.status,
    totalAdditionsAed: c.totalAdditions,
    totalDeductionsAed: c.totalDeductions,
    closingBalanceAed: c.closingBalance,
    totalAdditionsInr: c.totalAdditionsInr,
    totalDeductionsInr: c.totalDeductionsInr,
    closingBalanceInr: c.closingBalanceInr,
    appliedRate: c.appliedRate,
    closedByName: c.closedById ? userMap.get(c.closedById) ?? 'Admin' : null,
    closedAt: c.closedAt ? new Date(c.closedAt).toISOString() : null,
    reopenReason: c.reopenReason ?? null,
  }));

  const rateBackupRows: MonthlyBackupExchangeRateRow[] = rateRows.map((r) => ({
    id: r.id,
    effectiveDate: r.effectiveDate,
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: r.rate,
    source: r.source,
    setByName: r.setById ? userMap.get(r.setById) ?? 'Admin' : 'System API',
    notes: r.notes ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
  }));

  const supportBackupRows: MonthlyBackupSupportRow[] = monthlyTickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    category: t.category,
    priority: t.priority,
    status: t.status,
    requesterUserId: t.requesterUserId ?? null,
    requesterName: t.requesterName,
    requesterEmail: t.requesterEmail,
    subject: t.subject,
    routedToEmail: t.routedToEmail,
    emailDeliveryStatus: t.emailDeliveryStatus,
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
  }));

  return {
    schemaVersion: '1.0',
    month: bounds.month,
    monthLabel: bounds.label,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    timezone: sysSettings.timezone || 'Asia/Dubai',
    totals: {
      accountCount: accountBackupRows.length,
      transactionCount: monthlyTxRows.length,
      activeTransactionCount,
      reversedTransactionCount,
      dailyClosingCount: closingBackupRows.length,
      exchangeRateCount: rateBackupRows.length,
      supportTicketCount: supportBackupRows.length,
      activityLogCount: Number(activityCountRow[0]?.count ?? 0),
      totalCreditsAed: totalCreditsAed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      totalDebitsAed: totalDebitsAed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      netMovementAed: totalCreditsAed
        .minus(totalDebitsAed)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2),
      totalCreditsInr: totalCreditsInr.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      totalDebitsInr: totalDebitsInr.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      netMovementInr: totalCreditsInr
        .minus(totalDebitsInr)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2),
      closingBalanceAed: totalClosingBalanceAed
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2),
    },
    settingsSnapshot: {
      defaultCurrency: sysSettings.defaultCurrency,
      reportingCurrency: sysSettings.reportingCurrency,
      rateRefreshMode: sysSettings.rateRefreshMode,
      rateRefreshSchedule: sysSettings.rateRefreshSchedule,
      rateMarkup: sysSettings.rateMarkup,
      timezone: sysSettings.timezone,
    },
    accounts: accountBackupRows,
    transactions: monthlyTxRows,
    dailyClosings: closingBackupRows,
    exchangeRates: rateBackupRows,
    supportTickets: supportBackupRows,
  };
}

/**
 * Generates or refreshes a persisted monthly backup snapshot in PostgreSQL `monthly_backups`.
 * Completed prior months are stored as SNAPSHOT_LOCKED unless an Admin explicitly passes forceRebuild=true.
 */
export async function createOrRefreshMonthlyBackup(params: {
  month: string;
  userId?: number | null;
  generationType?: 'AUTO_MONTH_END' | 'MANUAL';
  forceRebuild?: boolean;
}): Promise<{
  record: typeof monthlyBackups.$inferSelect;
  snapshot: MonthlyBackupSnapshot;
  wasLockedPreserved: boolean;
}> {
  const { month, userId = null, generationType = 'MANUAL', forceRebuild = false } = params;
  const bounds = getMonthBounds(month);
  const currentMonth = getDubaiMonthEndStatus().currentMonth;
  const isCompletedPastMonth = month < currentMonth;
  const targetStatus = isCompletedPastMonth ? 'SNAPSHOT_LOCKED' : 'AVAILABLE';

  const snapshot = await buildMonthlyBackupSnapshot(month);
  const checksum = computeSnapshotChecksum(snapshot);
  const lockKey = 910000 + bounds.year * 100 + bounds.monthNumber;

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const existingRows = await tx
      .select()
      .from(monthlyBackups)
      .where(eq(monthlyBackups.month, month))
      .limit(1);
    const existing = existingRows[0];

    if (existing && existing.status === 'SNAPSHOT_LOCKED' && !forceRebuild) {
      return {
        record: existing,
        snapshot: existing.snapshotData as MonthlyBackupSnapshot,
        wasLockedPreserved: true,
      };
    }

    const values = {
      month: bounds.month,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      status: targetStatus,
      generationType,
      accountCount: snapshot.totals.accountCount,
      transactionCount: snapshot.totals.transactionCount,
      dailyClosingCount: snapshot.totals.dailyClosingCount,
      exchangeRateCount: snapshot.totals.exchangeRateCount,
      supportTicketCount: snapshot.totals.supportTicketCount,
      totalCreditsAed: snapshot.totals.totalCreditsAed,
      totalDebitsAed: snapshot.totals.totalDebitsAed,
      totalCreditsInr: snapshot.totals.totalCreditsInr,
      totalDebitsInr: snapshot.totals.totalDebitsInr,
      closingBalanceAed: snapshot.totals.closingBalanceAed,
      sha256Checksum: checksum,
      snapshotData: snapshot,
      generatedById: userId,
      updatedAt: new Date(),
    };

    const savedRows = existing
      ? await tx
          .update(monthlyBackups)
          .set(values)
          .where(eq(monthlyBackups.id, existing.id))
          .returning()
      : await tx.insert(monthlyBackups).values(values).returning();

    const saved = savedRows[0];

    await logActivity(
      {
        userId,
        action: existing ? 'REFRESH_MONTHLY_BACKUP' : 'GENERATE_MONTHLY_BACKUP',
        entity: 'MonthlyBackup',
        entityId: bounds.month,
        beforeSnapshot: existing
          ? {
              status: existing.status,
              sha256Checksum: existing.sha256Checksum,
              transactionCount: existing.transactionCount,
            }
          : null,
        afterSnapshot: {
          status: saved.status,
          generationType: saved.generationType,
          sha256Checksum: saved.sha256Checksum,
          transactionCount: saved.transactionCount,
          accountCount: saved.accountCount,
        },
        reason:
          generationType === 'AUTO_MONTH_END'
            ? `Automatic month-end snapshot persisted for ${bounds.label}`
            : `Monthly backup archive generated for ${bounds.label}`,
      },
      tx
    );

    return {
      record: saved,
      snapshot,
      wasLockedPreserved: false,
    };
  });

  if (!outcome.wasLockedPreserved) {
    broadcastRealtimeEvent('backups:updated', { entityId: bounds.month });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });
  }

  return outcome;
}

/**
 * Lists archived monthly snapshots (without large JSON blobs) plus all months present in ledger data.
 */
export async function listMonthlyBackupOverview(): Promise<{
  monthEndStatus: DubaiMonthEndStatus;
  archives: MonthlyBackupArchiveSummary[];
  availableMonths: string[];
}> {
  const monthEndStatus = getDubaiMonthEndStatus();

  const [archiveRows, allUsers, txMonths, closingMonths] = await Promise.all([
    db
      .select({
        id: monthlyBackups.id,
        month: monthlyBackups.month,
        periodStart: monthlyBackups.periodStart,
        periodEnd: monthlyBackups.periodEnd,
        status: monthlyBackups.status,
        generationType: monthlyBackups.generationType,
        accountCount: monthlyBackups.accountCount,
        transactionCount: monthlyBackups.transactionCount,
        dailyClosingCount: monthlyBackups.dailyClosingCount,
        exchangeRateCount: monthlyBackups.exchangeRateCount,
        supportTicketCount: monthlyBackups.supportTicketCount,
        totalCreditsAed: monthlyBackups.totalCreditsAed,
        totalDebitsAed: monthlyBackups.totalDebitsAed,
        totalCreditsInr: monthlyBackups.totalCreditsInr,
        totalDebitsInr: monthlyBackups.totalDebitsInr,
        closingBalanceAed: monthlyBackups.closingBalanceAed,
        sha256Checksum: monthlyBackups.sha256Checksum,
        generatedById: monthlyBackups.generatedById,
        createdAt: monthlyBackups.createdAt,
        updatedAt: monthlyBackups.updatedAt,
      })
      .from(monthlyBackups)
      .orderBy(desc(monthlyBackups.month)),
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .selectDistinct({ month: sql<string>`substring(${transactions.date} from 1 for 7)` })
      .from(transactions),
    db
      .selectDistinct({ month: sql<string>`substring(${dailyClosings.date} from 1 for 7)` })
      .from(dailyClosings),
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
  const monthSet = new Set<string>([monthEndStatus.currentMonth]);

  for (const r of archiveRows) {
    if (isValidMonthString(r.month)) monthSet.add(r.month);
  }
  for (const r of txMonths) {
    if (r.month && isValidMonthString(r.month)) monthSet.add(r.month);
  }
  for (const r of closingMonths) {
    if (r.month && isValidMonthString(r.month)) monthSet.add(r.month);
  }

  const archives: MonthlyBackupArchiveSummary[] = archiveRows.map((a) => ({
    id: a.id,
    month: a.month,
    monthLabel: getMonthBounds(a.month).label,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    status: a.status,
    generationType: a.generationType,
    accountCount: a.accountCount,
    transactionCount: a.transactionCount,
    dailyClosingCount: a.dailyClosingCount,
    exchangeRateCount: a.exchangeRateCount,
    supportTicketCount: a.supportTicketCount,
    totalCreditsAed: a.totalCreditsAed,
    totalDebitsAed: a.totalDebitsAed,
    totalCreditsInr: a.totalCreditsInr,
    totalDebitsInr: a.totalDebitsInr,
    closingBalanceAed: a.closingBalanceAed,
    sha256Checksum: a.sha256Checksum,
    generatedById: a.generatedById ?? null,
    generatedByName: a.generatedById ? userMap.get(a.generatedById) ?? 'User' : 'Auto Month-End',
    createdAt: new Date(a.createdAt).toISOString(),
    updatedAt: new Date(a.updatedAt).toISOString(),
  }));

  const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  return {
    monthEndStatus,
    archives,
    availableMonths,
  };
}

/**
 * Retrieves an existing monthly archive or materializes it on demand, scoping support tickets
 * so STAFF users only see their own tickets while receiving the complete ledger dataset.
 */
export async function getMonthlyBackupPayloadForUser(params: {
  month: string;
  user: { id: number; email: string; role: 'ADMIN' | 'STAFF' };
}): Promise<{
  record: typeof monthlyBackups.$inferSelect;
  snapshot: MonthlyBackupSnapshot;
  checksum: string;
}> {
  const { month, user } = params;
  const currentMonth = getDubaiMonthEndStatus().currentMonth;

  let record: typeof monthlyBackups.$inferSelect | undefined;
  if (month < currentMonth) {
    const existing = await db
      .select()
      .from(monthlyBackups)
      .where(eq(monthlyBackups.month, month))
      .limit(1);
    record = existing[0];
  }

  let snapshot: MonthlyBackupSnapshot;
  if (record) {
    snapshot = record.snapshotData as MonthlyBackupSnapshot;
  } else {
    const created = await createOrRefreshMonthlyBackup({
      month,
      userId: user.id,
      generationType: 'MANUAL',
    });
    record = created.record;
    snapshot = created.snapshot;
  }

  const scopedSupportTickets =
    user.role === 'ADMIN'
      ? snapshot.supportTickets
      : snapshot.supportTickets.filter(
          (t) =>
            t.requesterUserId === user.id ||
            t.requesterEmail.toLowerCase() === user.email.toLowerCase()
        );

  const scopedSnapshot: MonthlyBackupSnapshot = {
    ...snapshot,
    supportTickets: scopedSupportTickets,
  };

  return {
    record,
    snapshot: scopedSnapshot,
    checksum: record.sha256Checksum,
  };
}

export async function generateMonthlyBackupExcel(
  snapshot: MonthlyBackupSnapshot,
  checksum: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WebX Bookkeeping Backup Engine';
  workbook.created = new Date();

  // 1. Backup Manifest Sheet
  const manifestSheet = workbook.addWorksheet('Backup Manifest', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  manifestSheet.mergeCells('A1:D1');
  manifestSheet.getCell('A1').value = `WebX Monthly Data Backup — ${snapshot.monthLabel} (${snapshot.month})`;
  manifestSheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FF1E3A8A' } };

  manifestSheet.mergeCells('A2:D2');
  manifestSheet.getCell('A2').value = `Period: ${snapshot.periodStart} to ${snapshot.periodEnd} | Timezone: ${snapshot.timezone} | SHA-256: ${checksum}`;
  manifestSheet.getCell('A2').font = { size: 9, color: { argb: 'FF475569' } };

  const manifestRows: Array<[string, string | number]> = [
    ['Archive Month', snapshot.month],
    ['Month Label', snapshot.monthLabel],
    ['Period Start (GST)', snapshot.periodStart],
    ['Period End (GST)', snapshot.periodEnd],
    ['Timezone', snapshot.timezone],
    ['SHA-256 Integrity Checksum', checksum],
    ['Schema Version', snapshot.schemaVersion],
    ['Accounts Included', snapshot.totals.accountCount],
    ['Monthly Transactions', snapshot.totals.transactionCount],
    ['Active Entries', snapshot.totals.activeTransactionCount],
    ['Reversed Entries', snapshot.totals.reversedTransactionCount],
    ['Daily Closing Records', snapshot.totals.dailyClosingCount],
    ['Exchange Rate Snapshots', snapshot.totals.exchangeRateCount],
    ['Support Tickets Included', snapshot.supportTickets.length],
    ['Audit Activity Logs in Period', snapshot.totals.activityLogCount],
    ['Total Monthly Credits (AED)', Number(snapshot.totals.totalCreditsAed)],
    ['Total Monthly Debits (AED)', Number(snapshot.totals.totalDebitsAed)],
    ['Net Monthly Movement (AED)', Number(snapshot.totals.netMovementAed)],
    ['Total Monthly Credits (INR)', Number(snapshot.totals.totalCreditsInr)],
    ['Total Monthly Debits (INR)', Number(snapshot.totals.totalDebitsInr)],
    ['Net Monthly Movement (INR)', Number(snapshot.totals.netMovementInr)],
    ['Combined Month-End Balance (AED)', Number(snapshot.totals.closingBalanceAed)],
    ['Default Working Currency', snapshot.settingsSnapshot.defaultCurrency],
    ['Reporting Currency', snapshot.settingsSnapshot.reportingCurrency],
    ['Rate Refresh Mode', snapshot.settingsSnapshot.rateRefreshMode],
  ];

  const mHead = manifestSheet.getRow(4);
  mHead.values = ['Manifest Property', 'Recorded Value'];
  mHead.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });

  manifestRows.forEach(([k, v]) => {
    const r = manifestSheet.addRow([k, typeof v === 'string' ? sanitizeSpreadsheetText(v) : v]);
    r.getCell(1).font = { bold: true, color: { argb: 'FF334155' }, size: 10 };
    if (typeof v === 'number') {
      r.getCell(2).numFmt = Number.isInteger(v) ? '#,##0' : '#,##0.00';
    }
  });
  manifestSheet.getColumn(1).width = 34;
  manifestSheet.getColumn(2).width = 72;

  // 2. Account Balances Sheet
  const accSheet = workbook.addWorksheet('Account Balances', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const accHeader = accSheet.addRow([
    'Account ID',
    'Account Number',
    'Account Holder',
    'Base Currency',
    'Status',
    'Month Opening (AED)',
    'Monthly Credits (AED)',
    'Monthly Debits (AED)',
    'Month-End Balance (AED)',
    'Entries in Month',
    'Contact Email',
    'Contact Phone',
    'Contact Address',
  ]);
  accHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });
  snapshot.accounts.forEach((a) => {
    const row = accSheet.addRow([
      a.id,
      sanitizeSpreadsheetText(a.accountNumber),
      sanitizeSpreadsheetText(a.name),
      a.baseCurrency,
      a.status,
      Number(a.monthOpeningBalanceAed),
      Number(a.monthlyCreditsAed),
      Number(a.monthlyDebitsAed),
      Number(a.monthEndBalanceAed),
      a.monthlyEntryCount,
      sanitizeSpreadsheetText(a.contactEmail),
      sanitizeSpreadsheetText(a.contactPhone),
      sanitizeSpreadsheetText(a.contactAddress),
    ]);
    [6, 7, 8, 9].forEach((idx) => {
      row.getCell(idx).numFmt = '#,##0.00';
    });
  });
  [12, 18, 28, 14, 12, 20, 20, 20, 22, 16, 26, 18, 32].forEach((w, i) => {
    accSheet.getColumn(i + 1).width = w;
  });

  // 3. Monthly Transactions Sheet
  const txSheet = workbook.addWorksheet('Monthly Transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const txHeader = txSheet.addRow([
    'Tx ID',
    'Date (GST)',
    'Account Number',
    'Account Name',
    'Type',
    'Original Amount',
    'Original Currency',
    'AED Amount',
    'FX Rate (1 AED = INR)',
    'INR Equivalent',
    'Rate Date',
    'Rate Source',
    'Running Balance (AED)',
    'Status',
    'Reversal Of ID',
    'Description',
    'Edit Reason',
    'Created By',
    'Created At (UTC)',
  ]);
  txHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });
  snapshot.transactions.forEach((t) => {
    const row = txSheet.addRow([
      t.id,
      t.date,
      sanitizeSpreadsheetText(t.accountNumber),
      sanitizeSpreadsheetText(t.accountName),
      t.type,
      Number(t.originalAmount),
      t.originalCurrency,
      Number(t.amountAed),
      Number(t.exchangeRate),
      Number(t.convertedAmountInr),
      t.rateDate,
      t.rateSource,
      Number(t.runningBalanceAed),
      t.status,
      t.reversalOfId ?? '',
      sanitizeSpreadsheetText(t.description),
      sanitizeSpreadsheetText(t.editReason),
      sanitizeSpreadsheetText(t.createdByName),
      t.createdAt,
    ]);
    [6, 8, 10, 13].forEach((idx) => {
      row.getCell(idx).numFmt = '#,##0.00';
    });
    row.getCell(9).numFmt = '0.000000';
  });
  [10, 13, 16, 24, 10, 15, 16, 15, 18, 16, 13, 12, 18, 12, 14, 38, 28, 20, 24].forEach(
    (w, i) => {
      txSheet.getColumn(i + 1).width = w;
    }
  );

  // 4. Daily Closings Sheet
  const closeSheet = workbook.addWorksheet('Daily Closings', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const closeHeader = closeSheet.addRow([
    'ID',
    'Date (GST)',
    'Status',
    'Additions (AED)',
    'Deductions (AED)',
    'Closing Balance (AED)',
    'Additions (INR)',
    'Deductions (INR)',
    'Closing Balance (INR)',
    'Applied FX Rate',
    'Closed By',
    'Closed At (UTC)',
    'Reopen Reason',
  ]);
  closeHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });
  snapshot.dailyClosings.forEach((c) => {
    const row = closeSheet.addRow([
      c.id,
      c.date,
      c.status,
      Number(c.totalAdditionsAed),
      Number(c.totalDeductionsAed),
      Number(c.closingBalanceAed),
      Number(c.totalAdditionsInr),
      Number(c.totalDeductionsInr),
      Number(c.closingBalanceInr),
      Number(c.appliedRate),
      sanitizeSpreadsheetText(c.closedByName),
      c.closedAt ?? '',
      sanitizeSpreadsheetText(c.reopenReason),
    ]);
    [4, 5, 6, 7, 8, 9].forEach((idx) => {
      row.getCell(idx).numFmt = '#,##0.00';
    });
    row.getCell(10).numFmt = '0.000000';
  });
  [10, 14, 12, 16, 16, 20, 16, 16, 20, 15, 18, 24, 30].forEach((w, i) => {
    closeSheet.getColumn(i + 1).width = w;
  });

  // 5. Exchange Rates Sheet
  const rateSheet = workbook.addWorksheet('Exchange Rates', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const rateHeader = rateSheet.addRow([
    'ID',
    'Effective Date (GST)',
    'Pair',
    'Rate (1 AED = INR)',
    'Source',
    'Set By',
    'Notes',
    'Recorded At (UTC)',
  ]);
  rateHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });
  snapshot.exchangeRates.forEach((r) => {
    const row = rateSheet.addRow([
      r.id,
      r.effectiveDate,
      `${r.fromCurrency}->${r.toCurrency}`,
      Number(r.rate),
      r.source,
      sanitizeSpreadsheetText(r.setByName),
      sanitizeSpreadsheetText(r.notes),
      r.createdAt,
    ]);
    row.getCell(4).numFmt = '0.000000';
  });
  [10, 18, 14, 18, 12, 20, 34, 24].forEach((w, i) => {
    rateSheet.getColumn(i + 1).width = w;
  });

  // 6. Support Summary Sheet
  const supportSheet = workbook.addWorksheet('Support Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const supportHeader = supportSheet.addRow([
    'Ticket #',
    'Category',
    'Priority',
    'Status',
    'Requester Name',
    'Requester Email',
    'Subject',
    'Routed To',
    'Delivery Status',
    'Created At (UTC)',
  ]);
  supportHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    c.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
  });
  snapshot.supportTickets.forEach((s) => {
    supportSheet.addRow([
      s.ticketNumber,
      s.category,
      s.priority,
      s.status,
      sanitizeSpreadsheetText(s.requesterName),
      sanitizeSpreadsheetText(s.requesterEmail),
      sanitizeSpreadsheetText(s.subject),
      s.routedToEmail,
      s.emailDeliveryStatus,
      s.createdAt,
    ]);
  });
  [18, 22, 12, 14, 22, 28, 36, 26, 22, 24].forEach((w, i) => {
    supportSheet.getColumn(i + 1).width = w;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function generateMonthlyBackupJson(
  snapshot: MonthlyBackupSnapshot,
  checksum: string
): Buffer {
  const payload = {
    exportedBy: 'WebX Bookkeeping Platform',
    integrityAlgorithm: 'SHA-256',
    sha256Checksum: checksum,
    exportedAtUtc: new Date().toISOString(),
    backup: snapshot,
  };
  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
}

export async function generateMonthlyBackupPdf(
  snapshot: MonthlyBackupSnapshot,
  checksum: string
): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fillColor('#1E3A8A')
      .fontSize(17)
      .text(`WebX — Monthly Data Backup Statement (${snapshot.monthLabel})`, { align: 'left' });
    doc.moveDown(0.2);
    doc
      .fillColor('#475569')
      .fontSize(9)
      .text(
        `Archive Period: ${snapshot.periodStart} to ${snapshot.periodEnd}  |  Timezone: ${snapshot.timezone}  |  SHA-256: ${checksum}`
      );
    doc.moveDown(0.5);

    // Totals & Integrity Box
    doc.rect(36, doc.y, 770, 44).fillAndStroke('#EFF6FF', '#BFDBFE');
    const boxTop = doc.y + 8;
    doc
      .fillColor('#0F172A')
      .fontSize(9.5)
      .text(
        `Credits: ${formatAED(snapshot.totals.totalCreditsAed)} (${formatPdfInr(snapshot.totals.totalCreditsInr)})   |   Debits: ${formatAED(snapshot.totals.totalDebitsAed)} (${formatPdfInr(snapshot.totals.totalDebitsInr)})   |   Closing Bal: ${formatAED(snapshot.totals.closingBalanceAed)}`,
        46,
        boxTop
      );
    doc
      .fillColor('#475569')
      .fontSize(8.5)
      .text(
        `Accounts: ${snapshot.totals.accountCount}  |  Entries: ${snapshot.totals.transactionCount} (Active: ${snapshot.totals.activeTransactionCount}, Reversed: ${snapshot.totals.reversedTransactionCount})  |  Daily Closings: ${snapshot.totals.dailyClosingCount}  |  FX Rates: ${snapshot.totals.exchangeRateCount}`,
        46,
        boxTop + 16
      );
    doc.y = boxTop + 44;

    // Account Month-End Balances Table
    doc.fillColor('#1E3A8A').fontSize(11).text('Account Month-End Summary', 36, doc.y);
    doc.moveDown(0.3);

    const accCols = [
      'Account #',
      'Account Holder',
      'Status',
      'Month Open (AED)',
      'Credits (AED)',
      'Debits (AED)',
      'Month-End (AED)',
      'Entries',
    ];
    const accWidths = [95, 195, 65, 95, 95, 95, 85, 45];

    const drawAccHeader = (yPos: number) => {
      doc.rect(36, yPos, 770, 20).fill('#DBEAFE');
      let x = 40;
      doc.fillColor('#1E3A8A').fontSize(8);
      accCols.forEach((h, i) => {
        doc.text(h, x, yPos + 6, { width: accWidths[i] - 4, ellipsis: true });
        x += accWidths[i];
      });
      return yPos + 22;
    };

    let y = drawAccHeader(doc.y);
    if (snapshot.accounts.length === 0) {
      doc.fillColor('#64748B').fontSize(9).text('No ledger accounts recorded for this month.', 40, y + 6);
      y += 24;
    } else {
      snapshot.accounts.forEach((a, idx) => {
        if (y > 530) {
          doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
          y = drawAccHeader(36);
        }
        if (idx % 2 === 1) {
          doc.rect(36, y - 2, 770, 19).fill('#F8FAFC');
        }
        let x = 40;
        const vals = [
          a.accountNumber,
          a.name,
          a.status,
          formatAED(a.monthOpeningBalanceAed),
          formatAED(a.monthlyCreditsAed),
          formatAED(a.monthlyDebitsAed),
          formatAED(a.monthEndBalanceAed),
          String(a.monthlyEntryCount),
        ];
        vals.forEach((val, i) => {
          doc.fillColor('#0F172A').fontSize(8).text(val, x, y + 3, {
            width: accWidths[i] - 4,
            ellipsis: true,
          });
          x += accWidths[i];
        });
        y += 20;
      });
    }

    // Daily Closings Register (if any)
    if (snapshot.dailyClosings.length > 0) {
      if (y > 460) {
        doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
        y = 36;
      } else {
        y += 14;
      }
      doc.fillColor('#1E3A8A').fontSize(11).text('Daily Closings Register', 36, y);
      y += 16;

      const cCols = ['Date (GST)', 'Status', 'Additions (AED)', 'Deductions (AED)', 'Closing (AED)', 'Closing (INR)', 'FX Rate', 'Closed By'];
      const cWidths = [85, 70, 105, 105, 110, 115, 70, 110];
      const drawCloseHeader = (yPos: number) => {
        doc.rect(36, yPos, 770, 20).fill('#DBEAFE');
        let cx = 40;
        doc.fillColor('#1E3A8A').fontSize(8);
        cCols.forEach((h, i) => {
          doc.text(h, cx, yPos + 6, { width: cWidths[i] - 4, ellipsis: true });
          cx += cWidths[i];
        });
        return yPos + 22;
      };
      y = drawCloseHeader(y);
      snapshot.dailyClosings.forEach((c, idx) => {
        if (y > 530) {
          doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
          y = drawCloseHeader(36);
        }
        if (idx % 2 === 1) {
          doc.rect(36, y - 2, 770, 19).fill('#F8FAFC');
        }
        let cx = 40;
        const vals = [
          c.date,
          c.status,
          formatAED(c.totalAdditionsAed),
          formatAED(c.totalDeductionsAed),
          formatAED(c.closingBalanceAed),
          formatPdfInr(c.closingBalanceInr),
          Number(c.appliedRate).toFixed(2),
          c.closedByName || '—',
        ];
        vals.forEach((val, i) => {
          doc.fillColor('#0F172A').fontSize(8).text(val, cx, y + 3, {
            width: cWidths[i] - 4,
            ellipsis: true,
          });
          cx += cWidths[i];
        });
        y += 20;
      });
    }

    doc.end();
  });
}

/**
 * Ensures every completed past month with ledger/closing/rate activity has an immutable
 * AUTO_MONTH_END snapshot persisted in PostgreSQL, and on the last day of the active Dubai month
 * ensures a fresh month-end archive is ready for staff download.
 */
export async function runAutomaticMonthEndBackups(): Promise<void> {
  try {
    const status = getDubaiMonthEndStatus();
    const [txMonths, closingMonths, existingLocked] = await Promise.all([
      db
        .selectDistinct({ month: sql<string>`substring(${transactions.date} from 1 for 7)` })
        .from(transactions),
      db
        .selectDistinct({ month: sql<string>`substring(${dailyClosings.date} from 1 for 7)` })
        .from(dailyClosings),
      db
        .select({ month: monthlyBackups.month, status: monthlyBackups.status })
        .from(monthlyBackups),
    ]);

    const lockedSet = new Set(
      existingLocked.filter((r) => r.status === 'SNAPSHOT_LOCKED').map((r) => r.month)
    );
    const candidateMonths = new Set<string>();
    for (const r of txMonths) {
      if (r.month && isValidMonthString(r.month) && r.month < status.currentMonth) {
        candidateMonths.add(r.month);
      }
    }
    for (const r of closingMonths) {
      if (r.month && isValidMonthString(r.month) && r.month < status.currentMonth) {
        candidateMonths.add(r.month);
      }
    }

    for (const pastMonth of Array.from(candidateMonths).sort()) {
      if (!lockedSet.has(pastMonth)) {
        await createOrRefreshMonthlyBackup({
          month: pastMonth,
          userId: null,
          generationType: 'AUTO_MONTH_END',
        });
      }
    }

    // On the last day of the Dubai month, automatically keep the current month-end snapshot fresh
    if (status.isMonthEndToday) {
      const [{ txCount }] = await db
        .select({ txCount: sql<number>`count(*)::int` })
        .from(transactions)
        .where(
          and(
            gte(transactions.date, status.periodStart),
            lte(transactions.date, status.periodEnd)
          )
        );
      if (txCount > 0) {
        await createOrRefreshMonthlyBackup({
          month: status.currentMonth,
          userId: null,
          generationType: 'AUTO_MONTH_END',
        });
      }
    }
  } catch (error) {
    console.error('Automatic month-end backup pass failed:', error);
  }
}

let backupSchedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startMonthlyBackupScheduler(): void {
  if (backupSchedulerTimer) return;
  // Run once shortly after startup (non-blocking) and then hourly
  setTimeout(() => {
    void runAutomaticMonthEndBackups();
  }, 4000);
  backupSchedulerTimer = setInterval(() => {
    void runAutomaticMonthEndBackups();
  }, 60 * 60 * 1000);
}
