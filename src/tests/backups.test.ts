import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  computeSnapshotChecksum,
  generateMonthlyBackupExcel,
  generateMonthlyBackupJson,
  generateMonthlyBackupPdf,
  getDubaiMonthEndStatus,
  getMonthBounds,
  isValidMonthString,
  sanitizeSpreadsheetText,
  type MonthlyBackupSnapshot,
} from '../server/backups.ts';

function buildFixtureSnapshot(): MonthlyBackupSnapshot {
  return {
    schemaVersion: '1.0',
    month: '2026-11',
    monthLabel: 'November 2026',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    timezone: 'Asia/Dubai',
    totals: {
      accountCount: 1,
      transactionCount: 2,
      activeTransactionCount: 2,
      reversedTransactionCount: 0,
      dailyClosingCount: 1,
      exchangeRateCount: 1,
      supportTicketCount: 1,
      activityLogCount: 4,
      totalCreditsAed: '1000.00',
      totalDebitsAed: '250.00',
      netMovementAed: '750.00',
      totalCreditsInr: '23000.00',
      totalDebitsInr: '5750.00',
      netMovementInr: '17250.00',
      closingBalanceAed: '1750.00',
    },
    settingsSnapshot: {
      defaultCurrency: 'AED',
      reportingCurrency: 'INR',
      rateRefreshMode: 'AUTO',
      rateRefreshSchedule: '09:00',
      rateMarkup: '0',
      timezone: 'Asia/Dubai',
    },
    accounts: [
      {
        id: 1,
        name: 'Primary Operations LLC',
        accountNumber: 'ACC-1001',
        baseCurrency: 'AED',
        status: 'ACTIVE',
        contactEmail: 'ops@example.com',
        contactPhone: '+971500000001',
        contactAddress: 'Dubai, UAE',
        initialOpeningBalanceAed: '1000.00',
        monthOpeningBalanceAed: '1000.00',
        monthlyCreditsAed: '1000.00',
        monthlyDebitsAed: '250.00',
        monthEndBalanceAed: '1750.00',
        currentLiveBalanceAed: '1750.00',
        monthlyEntryCount: 2,
      },
    ],
    transactions: [
      {
        id: 10,
        date: '2026-11-10',
        accountId: 1,
        accountNumber: 'ACC-1001',
        accountName: 'Primary Operations LLC',
        type: 'CREDIT',
        originalAmount: '1000.00',
        originalCurrency: 'AED',
        amountAed: '1000.00',
        exchangeRate: '23.000000',
        convertedAmountInr: '23000.00',
        rateDate: '2026-11-10',
        rateSource: 'MANUAL',
        runningBalanceAed: '2000.00',
        status: 'ACTIVE',
        reversalOfId: null,
        editReason: null,
        description: '=CMD("neutralized formula test")',
        createdById: 2,
        createdByName: 'Staff Member',
        createdAt: '2026-11-10T08:00:00.000Z',
      },
      {
        id: 11,
        date: '2026-11-24',
        accountId: 1,
        accountNumber: 'ACC-1001',
        accountName: 'Primary Operations LLC',
        type: 'DEBIT',
        originalAmount: '250.00',
        originalCurrency: 'AED',
        amountAed: '250.00',
        exchangeRate: '23.000000',
        convertedAmountInr: '5750.00',
        rateDate: '2026-11-24',
        rateSource: 'MANUAL',
        runningBalanceAed: '1750.00',
        status: 'ACTIVE',
        reversalOfId: null,
        editReason: null,
        description: 'Vendor settlement',
        createdById: 2,
        createdByName: 'Staff Member',
        createdAt: '2026-11-24T09:00:00.000Z',
      },
    ],
    dailyClosings: [
      {
        id: 1,
        date: '2026-11-24',
        status: 'CLOSED',
        totalAdditionsAed: '1000.00',
        totalDeductionsAed: '250.00',
        closingBalanceAed: '1750.00',
        totalAdditionsInr: '23000.00',
        totalDeductionsInr: '5750.00',
        closingBalanceInr: '40250.00',
        appliedRate: '23.000000',
        closedByName: 'Admin User',
        closedAt: '2026-11-24T17:00:00.000Z',
        reopenReason: null,
      },
    ],
    exchangeRates: [
      {
        id: 1,
        effectiveDate: '2026-11-24',
        fromCurrency: 'AED',
        toCurrency: 'INR',
        rate: '23.000000',
        source: 'MANUAL',
        setByName: 'Admin User',
        notes: 'Month-end rate',
        createdAt: '2026-11-24T06:00:00.000Z',
      },
    ],
    supportTickets: [
      {
        id: 1,
        ticketNumber: 'WEBX-2026-0001',
        category: 'TECHNICAL_SUPPORT',
        priority: 'NORMAL',
        status: 'RESOLVED',
        requesterUserId: 2,
        requesterName: 'Staff Member',
        requesterEmail: 'staff@webx.local',
        subject: 'Backup verification check',
        routedToEmail: 'adwebcomicllp@gmail.com',
        emailDeliveryStatus: 'READY_FOR_DISPATCH',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T10:30:00.000Z',
      },
    ],
  };
}

describe('Monthly Data Backups & Durability Engine', () => {
  it('computes month bounds accurately including leap-year February', () => {
    expect(isValidMonthString('2024-02')).toBe(true);
    expect(isValidMonthString('2026-13')).toBe(false);
    expect(isValidMonthString('bad')).toBe(false);

    expect(getMonthBounds('2024-02')).toMatchObject({
      periodStart: '2024-02-01',
      periodEnd: '2024-02-29',
      daysInMonth: 29,
      label: 'February 2024',
    });

    expect(getMonthBounds('2025-02')).toMatchObject({
      periodStart: '2025-02-01',
      periodEnd: '2025-02-28',
      daysInMonth: 28,
    });

    expect(getMonthBounds('2026-11')).toMatchObject({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      daysInMonth: 30,
      label: 'November 2026',
    });
  });

  it('detects Dubai GST month-end status cleanly', () => {
    const endOfNov = new Date('2026-11-30T10:00:00+04:00');
    const st = getDubaiMonthEndStatus(endOfNov);
    expect(st.currentMonth).toBe('2026-11');
    expect(st.daysRemainingInMonth).toBe(0);
    expect(st.isMonthEndToday).toBe(true);
    expect(st.isNearMonthEnd).toBe(true);

    const midMonth = new Date('2026-11-10T10:00:00+04:00');
    const stMid = getDubaiMonthEndStatus(midMonth);
    expect(stMid.isMonthEndToday).toBe(false);
    expect(stMid.isNearMonthEnd).toBe(false);
    expect(stMid.daysRemainingInMonth).toBe(20);
  });

  it('neutralizes spreadsheet formula prefixes and generates deterministic SHA-256 checksums', () => {
    expect(sanitizeSpreadsheetText('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeSpreadsheetText('+100')).toBe("'+100");
    expect(sanitizeSpreadsheetText('@cmd')).toBe("'@cmd");
    expect(sanitizeSpreadsheetText('Normal ledger description')).toBe('Normal ledger description');

    const snapshot = buildFixtureSnapshot();
    const sum1 = computeSnapshotChecksum(snapshot);
    const sum2 = computeSnapshotChecksum(snapshot);
    expect(sum1).toHaveLength(64);
    expect(sum1).toBe(sum2);
  });

  it('exports valid 6-sheet Excel, JSON, and PDF monthly backup files', async () => {
    const snapshot = buildFixtureSnapshot();
    const checksum = computeSnapshotChecksum(snapshot);

    const xlsxBuf = await generateMonthlyBackupExcel(snapshot, checksum);
    expect(xlsxBuf.subarray(0, 2).toString('utf8')).toBe('PK');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuf as any);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Backup Manifest',
      'Account Balances',
      'Monthly Transactions',
      'Daily Closings',
      'Exchange Rates',
      'Support Summary',
    ]);
    const txSheet = wb.getWorksheet('Monthly Transactions')!;
    expect(txSheet.getRow(2).getCell(16).value).toBe('\'=CMD("neutralized formula test")');

    const jsonBuf = generateMonthlyBackupJson(snapshot, checksum);
    const parsed = JSON.parse(jsonBuf.toString('utf8'));
    expect(parsed.sha256Checksum).toBe(checksum);
    expect(parsed.backup.transactions).toHaveLength(2);

    const pdfBuf = await generateMonthlyBackupPdf(snapshot, checksum);
    expect(pdfBuf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
