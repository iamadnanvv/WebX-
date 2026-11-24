import express from 'express';
import http from 'node:http';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';

import { db } from './src/db/index.ts';
import {
  accounts,
  activityLogs,
  dailyClosings,
  supportMessages,
  supportTickets,
  transactions,
  users,
} from './src/db/schema.ts';
import {
  AuthRequest,
  bootstrapFirstAdmin,
  ensurePreconfiguredAccounts,
  getOrCreateFirebaseUser,
  hasAnyAdminUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  signSessionToken,
  verifyPassword,
} from './src/server/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { logActivity } from './src/server/activityLog.ts';
import { getSystemSettings, upsertSettings } from './src/server/settings.ts';
import {
  RateUnavailableError,
  getEffectiveRateForDate,
  listExchangeRates,
  setManualExchangeRate,
  startExchangeRateScheduler,
} from './src/server/exchangeRates.ts';
import {
  closeDailyLedger,
  createLedgerTransaction,
  editLedgerTransaction,
  getDailySummaryForDate,
  recalculateAccountBalances,
  recalculateAllAccountBalances,
  reopenDailyLedger,
  reverseLedgerTransaction,
} from './src/server/ledger.ts';
import {
  generateExcelReport,
  generatePdfReport,
  ReportCurrencyView,
  ReportPayload,
} from './src/server/reports.ts';
import {
  createOrRefreshMonthlyBackup,
  generateMonthlyBackupExcel,
  generateMonthlyBackupJson,
  generateMonthlyBackupPdf,
  getMonthlyBackupPayloadForUser,
  isValidMonthString,
  listMonthlyBackupOverview,
  startMonthlyBackupScheduler,
  type BackupDownloadFormat,
} from './src/server/backups.ts';
import { broadcastRealtimeEvent, initRealtimeServer } from './src/server/realtime.ts';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_SERVICES,
  SUPPORT_STATUSES,
} from './src/lib/supportCatalog.ts';
import {
  dispatchSupportReplyEmail,
  dispatchSupportTicketEmail,
  generateTicketNumber,
  getConfiguredSupportEmail,
  isSmtpConfigured,
} from './src/server/support.ts';
import {
  ClosedDayError,
  getDubaiDateDaysAgo,
  getDubaiDateString,
  round2,
} from './src/lib/money.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

class BadRequestError extends Error {}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timezone: 'Asia/Dubai' });
});

// ============================================================================
// FIRST-RUN BOOTSTRAP & AUTHENTICATION ROUTES
// ============================================================================

app.get('/api/auth/bootstrap-status', async (_req, res) => {
  try {
    const adminExists = await hasAnyAdminUser();
    res.json({ needsAdminSetup: !adminExists });
  } catch (error) {
    console.error('Bootstrap status check failed:', error);
    res.status(500).json({ error: 'Unable to check workspace status' });
  }
});

const bootstrapSchema = z.object({
  name: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

app.post('/api/auth/bootstrap', async (req, res) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid setup payload' });
    return;
  }

  try {
    const adminUser = await bootstrapFirstAdmin(parsed.data);
    const token = signSessionToken(adminUser);

    await logActivity({
      userId: adminUser.id,
      action: 'BOOTSTRAP_ADMIN',
      entity: 'User',
      entityId: adminUser.id,
      afterSnapshot: { email: adminUser.email, role: adminUser.role },
      reason: 'Initial workspace administrator account claimed',
    });

    res.status(201).json({ token, user: adminUser });
  } catch (error: any) {
    if (error?.message?.includes('already configured')) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error?.code === '23505') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('Admin bootstrap failed:', error);
    res.status(500).json({ error: 'Failed to initialize administrator account' });
  }
});

const loginSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials payload' });
    return;
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
      return;
    }

    const authUser = {
      id: user.id,
      uid: user.uid,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN' | 'STAFF',
      status: user.status as 'ACTIVE' | 'DISABLED',
    };

    const token = signSessionToken(authUser);
    await logActivity({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      afterSnapshot: { method: 'CREDENTIALS', email: user.email, role: user.role },
    });

    res.json({ token, user: authUser });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Authentication service error' });
  }
});

app.post('/api/auth/firebase-sync', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Firebase ID token' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      res.status(400).json({ error: 'Google account email is required' });
      return;
    }
    const dbUser = await getOrCreateFirebaseUser(decoded.uid, decoded.email, decoded.name);
    if (dbUser.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
      return;
    }

    await logActivity({
      userId: dbUser.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: dbUser.id,
      afterSnapshot: { method: 'GOOGLE_OAUTH', email: dbUser.email, role: dbUser.role },
    });

    res.json({ user: dbUser });
  } catch (error) {
    console.error('Firebase sync failed:', error);
    res.status(401).json({ error: 'Invalid or expired Google Sign-In token' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [sysSettings, rateInfo] = await Promise.all([
      getSystemSettings(),
      getEffectiveRateForDate(getDubaiDateString(), { userId: req.user?.id }),
    ]);
    res.json({
      user: req.user,
      settings: sysSettings,
      rateInfo,
    });
  } catch (error) {
    console.error('Failed to load session context:', error);
    res.status(500).json({ error: 'Failed to load user workspace context' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res) => {
  try {
    await logActivity({
      userId: req.user!.id,
      action: 'LOGOUT',
      entity: 'User',
      entityId: req.user!.id,
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ============================================================================
// EXCHANGE RATES (STAFF READ + ADMIN MANAGE)
// ============================================================================

app.get('/api/rates/current', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rawDate = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
      return;
    }
    const dateParam = rawDate || undefined;
    const rateInfo = await getEffectiveRateForDate(dateParam, { userId: req.user?.id });
    const history = await listExchangeRates(14);
    res.json({ rateInfo, history });
  } catch (error) {
    console.error('Failed to load exchange rate:', error);
    res.status(500).json({ error: 'Failed to load exchange rate' });
  }
});

app.get('/api/admin/rates', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const [current, history, sysSettings] = await Promise.all([
      getEffectiveRateForDate(getDubaiDateString()),
      listExchangeRates(90),
      getSystemSettings(),
    ]);
    const userRows = await db.select({ id: users.id, name: users.name }).from(users);
    const userMap = new Map(userRows.map((u) => [u.id, u.name]));

    res.json({
      current,
      mode: sysSettings.rateRefreshMode,
      markup: sysSettings.rateMarkup,
      history: history.map((r) => ({
        ...r,
        setByName: r.setById ? userMap.get(r.setById) ?? 'Admin' : 'System API',
      })),
    });
  } catch (error) {
    console.error('Failed to list exchange rates:', error);
    res.status(500).json({ error: 'Failed to load exchange rates' });
  }
});

app.post('/api/admin/rates/refresh', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const rateInfo = await getEffectiveRateForDate(getDubaiDateString(), {
      forceRefresh: true,
      userId: req.user!.id,
    });
    res.json({ rateInfo });
  } catch (error) {
    console.error('Failed to refresh exchange rate:', error);
    res.status(500).json({ error: 'Failed to refresh live exchange rate' });
  }
});

const rateOverrideSchema = z.object({
  rate: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Rate must be positive'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  notes: z.string().max(300).optional(),
});

app.post('/api/admin/rates/override', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = rateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid rate override' });
    return;
  }

  try {
    const closingRows = await db
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, parsed.data.effectiveDate))
      .limit(1);
    if (closingRows[0]?.status === 'CLOSED') {
      res.status(409).json({
        error: `Date ${parsed.data.effectiveDate} is closed. Reopen the day before modifying its exchange rate.`,
      });
      return;
    }

    const created = await setManualExchangeRate({
      rate: parsed.data.rate,
      effectiveDate: parsed.data.effectiveDate,
      userId: req.user!.id,
      notes: parsed.data.notes,
    });
    const current = await getEffectiveRateForDate(parsed.data.effectiveDate);
    res.status(201).json({ override: created, current });
  } catch (error) {
    console.error('Failed to set manual rate override:', error);
    res.status(500).json({ error: 'Failed to set manual rate override' });
  }
});

// ============================================================================
// STAFF & ADMIN DASHBOARDS
// ============================================================================

function computeInrFromRate(aedAmount: Decimal, rateStr: string | null): string | null {
  if (!rateStr) return null;
  return aedAmount.mul(new Decimal(rateStr)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

app.get('/api/dashboard/staff', requireAuth, async (req: AuthRequest, res) => {
  try {
    const todayStr = getDubaiDateString();
    const [allAccounts, todayTxs, recentTxs, rateInfo, allUsers, todayClosing] = await Promise.all([
      db.select().from(accounts).orderBy(asc(accounts.name)),
      db.select().from(transactions).where(eq(transactions.date, todayStr)),
      db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.id)).limit(10),
      getEffectiveRateForDate(todayStr, { userId: req.user?.id }),
      db.select({ id: users.id, name: users.name }).from(users),
      db.select().from(dailyClosings).where(eq(dailyClosings.date, todayStr)).limit(1),
    ]);

    const accMap = new Map(allAccounts.map((a) => [a.id, a]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

    let totalBalanceAed = new Decimal(0);
    for (const acc of allAccounts) {
      totalBalanceAed = totalBalanceAed.plus(acc.currentBalance);
    }
    const totalBalanceInr = computeInrFromRate(totalBalanceAed, rateInfo.rate);

    let todayCreditsAed = new Decimal(0);
    let todayDebitsAed = new Decimal(0);
    let todayCreditsInr = new Decimal(0);
    let todayDebitsInr = new Decimal(0);
    for (const t of todayTxs) {
      if (t.type === 'CREDIT') {
        todayCreditsAed = todayCreditsAed.plus(t.amount);
        todayCreditsInr = todayCreditsInr.plus(t.convertedAmountInr);
      } else {
        todayDebitsAed = todayDebitsAed.plus(t.amount);
        todayDebitsInr = todayDebitsInr.plus(t.convertedAmountInr);
      }
    }

    const sevenDaysAgo = getDubaiDateDaysAgo(6);
    const weekTxs = await db
      .select()
      .from(transactions)
      .where(gte(transactions.date, sevenDaysAgo))
      .orderBy(asc(transactions.date));

    const trendMap = new Map<
      string,
      { date: string; creditsAed: number; debitsAed: number; creditsInr: number; debitsInr: number }
    >();
    for (let i = 6; i >= 0; i--) {
      const d = getDubaiDateDaysAgo(i);
      trendMap.set(d, { date: d, creditsAed: 0, debitsAed: 0, creditsInr: 0, debitsInr: 0 });
    }
    for (const t of weekTxs) {
      const bucket = trendMap.get(t.date);
      if (bucket) {
        if (t.type === 'CREDIT') {
          bucket.creditsAed = Number(new Decimal(bucket.creditsAed).plus(t.amount).toFixed(2));
          bucket.creditsInr = Number(
            new Decimal(bucket.creditsInr).plus(t.convertedAmountInr).toFixed(2)
          );
        } else {
          bucket.debitsAed = Number(new Decimal(bucket.debitsAed).plus(t.amount).toFixed(2));
          bucket.debitsInr = Number(
            new Decimal(bucket.debitsInr).plus(t.convertedAmountInr).toFixed(2)
          );
        }
      }
    }

    res.json({
      todayDate: todayStr,
      todayStatus: todayClosing[0]?.status || 'OPEN',
      totalBalanceAed: totalBalanceAed.toFixed(2),
      totalBalanceInr,
      accountCount: allAccounts.length,
      activeAccountCount: allAccounts.filter((a) => a.status === 'ACTIVE').length,
      entriesTodayCount: todayTxs.length,
      todayCreditsAed: todayCreditsAed.toFixed(2),
      todayDebitsAed: todayDebitsAed.toFixed(2),
      todayCreditsInr: todayCreditsInr.toFixed(2),
      todayDebitsInr: todayDebitsInr.toFixed(2),
      rateInfo,
      trend: Array.from(trendMap.values()),
      recentTransactions: recentTxs.map((t) => ({
        ...t,
        accountName: accMap.get(t.accountId)?.name ?? 'Unknown',
        accountNumber: accMap.get(t.accountId)?.accountNumber ?? '',
        createdByName: userMap.get(t.createdById) ?? 'System',
      })),
    });
  } catch (error) {
    console.error('Staff dashboard error:', error);
    res.status(500).json({ error: 'Failed to load staff dashboard metrics' });
  }
});

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const todayStr = getDubaiDateString();
    const [allAccounts, allTxs, allUsers, closings, rateInfo] = await Promise.all([
      db.select().from(accounts).orderBy(desc(accounts.currentBalance)),
      db.select().from(transactions),
      db.select().from(users).orderBy(asc(users.name)),
      db.select().from(dailyClosings).orderBy(desc(dailyClosings.date)).limit(10),
      getEffectiveRateForDate(todayStr),
    ]);

    let totalBalanceAed = new Decimal(0);
    for (const acc of allAccounts) {
      totalBalanceAed = totalBalanceAed.plus(acc.currentBalance);
    }

    const staffStatsMap = new Map<
      number,
      {
        userId: number;
        name: string;
        email: string;
        role: string;
        status: string;
        entryCount: number;
        todayCount: number;
        totalVolumeAed: Decimal;
        totalVolumeInr: Decimal;
      }
    >();

    for (const u of allUsers) {
      staffStatsMap.set(u.id, {
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        entryCount: 0,
        todayCount: 0,
        totalVolumeAed: new Decimal(0),
        totalVolumeInr: new Decimal(0),
      });
    }

    let reversedCount = 0;
    for (const t of allTxs) {
      if (t.status === 'REVERSED') reversedCount += 1;
      const stat = staffStatsMap.get(t.createdById);
      if (stat) {
        stat.entryCount += 1;
        if (t.date === todayStr) stat.todayCount += 1;
        stat.totalVolumeAed = stat.totalVolumeAed.plus(t.amount);
        stat.totalVolumeInr = stat.totalVolumeInr.plus(t.convertedAmountInr);
      }
    }

    res.json({
      todayDate: todayStr,
      totalBalanceAed: totalBalanceAed.toFixed(2),
      totalBalanceInr: computeInrFromRate(totalBalanceAed, rateInfo.rate),
      totalAccounts: allAccounts.length,
      totalTransactions: allTxs.length,
      reversedCount,
      rateInfo,
      topAccounts: allAccounts.slice(0, 6).map((a) => ({
        ...a,
        balanceInr: computeInrFromRate(new Decimal(a.currentBalance), rateInfo.rate),
      })),
      staffPerformance: Array.from(staffStatsMap.values()).map((s) => ({
        ...s,
        totalVolumeAed: s.totalVolumeAed.toFixed(2),
        totalVolumeInr: s.totalVolumeInr.toFixed(2),
      })),
      recentClosings: closings,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

// ============================================================================
// ACCOUNTS & ACCOUNT LEDGERS
// ============================================================================

app.get('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const [allAccounts, rateInfo, txCounts] = await Promise.all([
      db.select().from(accounts).orderBy(asc(accounts.accountNumber)),
      getEffectiveRateForDate(getDubaiDateString()),
      db
        .select({
          accountId: transactions.accountId,
          count: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .groupBy(transactions.accountId),
    ]);

    const countMap = new Map(txCounts.map((c) => [c.accountId, c.count]));
    const filtered = allAccounts
      .filter((a) => {
        if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
        if (!search) return true;
        return (
          a.name.toLowerCase().includes(search) ||
          a.accountNumber.toLowerCase().includes(search) ||
          (a.contactEmail || '').toLowerCase().includes(search) ||
          (a.contactPhone || '').toLowerCase().includes(search)
        );
      })
      .map((a) => ({
        ...a,
        currentBalanceInr: computeInrFromRate(new Decimal(a.currentBalance), rateInfo.rate),
        openingBalanceInr: computeInrFromRate(new Decimal(a.openingBalance), rateInfo.rate),
        transactionCount: countMap.get(a.id) ?? 0,
      }));

    res.json({ accounts: filtered, rateInfo });
  } catch (error) {
    console.error('Failed to list accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.get('/api/accounts/:id/ledger', requireAuth, async (req: AuthRequest, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    const [accRows, entries, rateInfo, allUsers] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
      db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, accountId))
        .orderBy(asc(transactions.date), asc(transactions.id)),
      getEffectiveRateForDate(getDubaiDateString()),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);

    const account = accRows[0];
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    let totalCreditsAed = new Decimal(0);
    let totalDebitsAed = new Decimal(0);
    let totalCreditsInr = new Decimal(0);
    let totalDebitsInr = new Decimal(0);

    for (const e of entries) {
      if (e.type === 'CREDIT') {
        totalCreditsAed = totalCreditsAed.plus(e.amount);
        totalCreditsInr = totalCreditsInr.plus(e.convertedAmountInr);
      } else {
        totalDebitsAed = totalDebitsAed.plus(e.amount);
        totalDebitsInr = totalDebitsInr.plus(e.convertedAmountInr);
      }
    }

    res.json({
      account: {
        ...account,
        currentBalanceInr: computeInrFromRate(new Decimal(account.currentBalance), rateInfo.rate),
      },
      rateInfo,
      summary: {
        openingBalanceAed: account.openingBalance,
        openingBalanceInr: computeInrFromRate(new Decimal(account.openingBalance), rateInfo.rate),
        totalCreditsAed: totalCreditsAed.toFixed(2),
        totalDebitsAed: totalDebitsAed.toFixed(2),
        totalCreditsInr: totalCreditsInr.toFixed(2),
        totalDebitsInr: totalDebitsInr.toFixed(2),
        closingBalanceAed: account.currentBalance,
        closingBalanceInr: computeInrFromRate(new Decimal(account.currentBalance), rateInfo.rate),
      },
      entries: entries.map((e) => ({
        ...e,
        createdByName: userMap.get(e.createdById) ?? 'System',
        runningBalanceInr: computeInrFromRate(new Decimal(e.runningBalance), rateInfo.rate),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch account ledger:', error);
    res.status(500).json({ error: 'Failed to load account ledger' });
  }
});

const createAccountSchema = z.object({
  name: z.string().min(2, 'Account holder name is required').max(120),
  accountNumber: z.string().min(3, 'Account number is required').max(40),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional().or(z.literal('')),
  contactAddress: z.string().max(240).optional().or(z.literal('')),
  baseCurrency: z.literal('AED').default('AED'),
  openingBalance: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Opening balance must be >= 0')
    .default('0.00'),
});

app.post('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
  const sysSettings = await getSystemSettings();
  if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanAddAccounts) {
    res.status(403).json({
      error: 'Forbidden: Only Administrators can create accounts under current settings.',
    });
    return;
  }

  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid account data' });
    return;
  }

  try {
    const cleanOpening = round2(parsed.data.openingBalance);
    const inserted = await db
      .insert(accounts)
      .values({
        name: parsed.data.name.trim(),
        accountNumber: parsed.data.accountNumber.trim().toUpperCase(),
        contactEmail: parsed.data.contactEmail?.trim() || null,
        contactPhone: parsed.data.contactPhone?.trim() || null,
        contactAddress: parsed.data.contactAddress?.trim() || null,
        baseCurrency: parsed.data.baseCurrency,
        openingBalance: cleanOpening,
        currentBalance: cleanOpening,
        status: 'ACTIVE',
      })
      .returning();

    await logActivity({
      userId: req.user!.id,
      action: 'CREATE_ACCOUNT',
      entity: 'Account',
      entityId: inserted[0].id,
      afterSnapshot: inserted[0],
    });

    broadcastRealtimeEvent('accounts:updated', { entityId: inserted[0].id });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.status(201).json({ account: inserted[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'An account with that account number already exists.' });
      return;
    }
    console.error('Failed to create account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

const updateAccountSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional().or(z.literal('')),
  contactAddress: z.string().max(240).optional().or(z.literal('')),
  openingBalance: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Opening balance must be >= 0')
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

app.patch('/api/admin/accounts/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
    return;
  }

  try {
    const existingRows = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({
          name: parsed.data.name?.trim() ?? existing.name,
          contactEmail:
            parsed.data.contactEmail !== undefined
              ? parsed.data.contactEmail.trim() || null
              : existing.contactEmail,
          contactPhone:
            parsed.data.contactPhone !== undefined
              ? parsed.data.contactPhone.trim() || null
              : existing.contactPhone,
          contactAddress:
            parsed.data.contactAddress !== undefined
              ? parsed.data.contactAddress.trim() || null
              : existing.contactAddress,
          openingBalance:
            parsed.data.openingBalance !== undefined
              ? round2(parsed.data.openingBalance)
              : existing.openingBalance,
          status: parsed.data.status ?? existing.status,
        })
        .where(eq(accounts.id, accountId));

      await recalculateAccountBalances(tx, accountId);

      const updatedRows = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);
      await logActivity(
        {
          userId: req.user!.id,
          action: 'UPDATE_ACCOUNT',
          entity: 'Account',
          entityId: accountId,
          beforeSnapshot: existing,
          afterSnapshot: updatedRows[0],
        },
        tx
      );
    });

    const refreshed = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    broadcastRealtimeEvent('accounts:updated', { entityId: accountId });
    broadcastRealtimeEvent('ledger:updated', { entityId: accountId });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });
    res.json({ account: refreshed[0] });
  } catch (error) {
    console.error('Failed to update account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ============================================================================
// TRANSACTIONS (STAFF ENTRY & HISTORY + ADMIN AUDIT, EDIT, REVERSAL)
// ============================================================================

app.get('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestedPage = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(100, parsePositiveInt(req.query.pageSize, 20));
    const accountId = parseOptionalPositiveInt(req.query.accountId);
    const type =
      typeof req.query.type === 'string' && req.query.type !== 'ALL' ? req.query.type : null;
    const status =
      typeof req.query.status === 'string' && req.query.status !== 'ALL' ? req.query.status : null;
    const rawStart =
      typeof req.query.startDate === 'string' && req.query.startDate.trim()
        ? req.query.startDate.trim()
        : null;
    const rawEnd =
      typeof req.query.endDate === 'string' && req.query.endDate.trim()
        ? req.query.endDate.trim()
        : null;

    if (rawStart && !/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      res.status(400).json({ error: 'Invalid start date format (expected YYYY-MM-DD)' });
      return;
    }
    if (rawEnd && !/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
      res.status(400).json({ error: 'Invalid end date format (expected YYYY-MM-DD)' });
      return;
    }
    if (rawStart && rawEnd && rawStart > rawEnd) {
      res.status(400).json({ error: 'Start date cannot be after end date' });
      return;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const [allAccounts, allUsers, closings] = await Promise.all([
      db.select().from(accounts),
      db.select({ id: users.id, name: users.name }).from(users),
      db.select().from(dailyClosings),
    ]);

    const accMap = new Map(allAccounts.map((a) => [a.id, a]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const closedSet = new Set(closings.filter((c) => c.status === 'CLOSED').map((c) => c.date));

    const conditions = [];
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    if (type) conditions.push(eq(transactions.type, type));
    if (status) conditions.push(eq(transactions.status, status));
    if (rawStart) conditions.push(gte(transactions.date, rawStart));
    if (rawEnd) conditions.push(lte(transactions.date, rawEnd));

    const queryRows =
      conditions.length > 0
        ? await db
            .select()
            .from(transactions)
            .where(and(...conditions))
            .orderBy(desc(transactions.date), desc(transactions.id))
        : await db
            .select()
            .from(transactions)
            .orderBy(desc(transactions.date), desc(transactions.id));

    const enriched = queryRows
      .map((t) => ({
        ...t,
        accountName: accMap.get(t.accountId)?.name ?? 'Unknown',
        accountNumber: accMap.get(t.accountId)?.accountNumber ?? '',
        createdByName: userMap.get(t.createdById) ?? 'System',
        isDayClosed: closedSet.has(t.date),
      }))
      .filter((t) => {
        if (!search) return true;
        const normalizedIdSearch = search.startsWith('#') ? search.slice(1) : search;
        return (
          t.description.toLowerCase().includes(search) ||
          t.accountName.toLowerCase().includes(search) ||
          t.accountNumber.toLowerCase().includes(search) ||
          t.createdByName.toLowerCase().includes(search) ||
          (normalizedIdSearch.length > 0 && String(t.id).includes(normalizedIdSearch))
        );
      });

    const total = enriched.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const paged = enriched.slice(offset, offset + pageSize);

    res.json({
      transactions: paged,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to list transactions:', error);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

const createTxSchema = z.object({
  accountId: z.coerce.number().int().positive('Please select a valid account'),
  type: z.enum(['CREDIT', 'DEBIT']),
  originalAmount: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Amount must be greater than zero'),
  originalCurrency: z.enum(['AED', 'INR']).default('AED'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().min(3, 'Description must be at least 3 characters').max(400),
});

app.post('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
  const parsed = createTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid entry payload' });
    return;
  }

  try {
    const result = await createLedgerTransaction({
      ...parsed.data,
      createdById: req.user!.id,
    });
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof ClosedDayError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof RateUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    console.error('Failed to create transaction:', error);
    res.status(400).json({ error: error?.message || 'Failed to record entry' });
  }
});

const editTxSchema = z.object({
  reason: z.string().min(3, 'An audit reason is required to edit an entry').max(400),
  accountId: z.coerce.number().int().positive().optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  originalAmount: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Amount must be > 0')
    .optional(),
  originalCurrency: z.enum(['AED', 'INR']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(3).max(400).optional(),
  recalculateRate: z.boolean().optional(),
});

app.patch('/api/admin/transactions/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const txId = Number(req.params.id);
  if (!Number.isInteger(txId) || txId <= 0) {
    res.status(400).json({ error: 'Invalid transaction ID' });
    return;
  }

  const parsed = editTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid edit payload' });
    return;
  }

  try {
    const updated = await editLedgerTransaction({
      transactionId: txId,
      adminUserId: req.user!.id,
      ...parsed.data,
    });
    res.json({ transaction: updated });
  } catch (error: any) {
    if (error instanceof ClosedDayError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof RateUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    console.error('Failed to edit transaction:', error);
    res.status(400).json({ error: error?.message || 'Failed to edit transaction' });
  }
});

const reverseTxSchema = z.object({
  reason: z.string().min(3, 'A reason is required to reverse a transaction').max(400),
  reversalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

app.post(
  '/api/admin/transactions/:id/reverse',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const txId = Number(req.params.id);
    if (!Number.isInteger(txId) || txId <= 0) {
      res.status(400).json({ error: 'Invalid transaction ID' });
      return;
    }

    const parsed = reverseTxSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Reason is required' });
      return;
    }

    try {
      const result = await reverseLedgerTransaction({
        transactionId: txId,
        adminUserId: req.user!.id,
        reason: parsed.data.reason,
        reversalDate: parsed.data.reversalDate,
      });
      res.json(result);
    } catch (error: any) {
      if (error instanceof ClosedDayError) {
        res.status(409).json({ error: error.message });
        return;
      }
      console.error('Failed to reverse transaction:', error);
      res.status(400).json({ error: error?.message || 'Failed to reverse transaction' });
    }
  }
);

// ============================================================================
// DAILY LEDGER & ADMIN DAILY CLOSING
// ============================================================================

app.get('/api/daily-ledger', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dateStr =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getDubaiDateString();

    const [summary, allAccounts, allUsers, recentClosings] = await Promise.all([
      getDailySummaryForDate(dateStr),
      db.select().from(accounts),
      db.select({ id: users.id, name: users.name }).from(users),
      db.select().from(dailyClosings).orderBy(desc(dailyClosings.date)).limit(14),
    ]);

    const accMap = new Map(allAccounts.map((a) => [a.id, a]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

    res.json({
      summary: {
        ...summary,
        closedByName: summary.closedById ? userMap.get(summary.closedById) ?? 'Admin' : null,
        entries: summary.entries.map((e) => ({
          ...e,
          accountName: accMap.get(e.accountId)?.name ?? 'Unknown',
          accountNumber: accMap.get(e.accountId)?.accountNumber ?? '',
          createdByName: userMap.get(e.createdById) ?? 'System',
        })),
      },
      recentClosings: recentClosings.map((c) => ({
        ...c,
        closedByName: c.closedById ? userMap.get(c.closedById) ?? 'Admin' : null,
      })),
    });
  } catch (error) {
    console.error('Failed to load daily ledger:', error);
    res.status(500).json({ error: 'Failed to load daily ledger' });
  }
});

const closeDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

app.post('/api/admin/daily-closing/close', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = closeDaySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid closing date' });
    return;
  }
  const dateStr = parsed.data.date || getDubaiDateString();

  try {
    const closing = await closeDailyLedger({
      date: dateStr,
      adminUserId: req.user!.id,
    });
    res.json({ closing });
  } catch (error: any) {
    if (error instanceof ClosedDayError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof RateUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    console.error('Failed to finalize daily closing:', error);
    res.status(400).json({ error: error?.message || 'Failed to close day' });
  }
});

app.post('/api/admin/daily-closing/reopen', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(3, 'A reason is required to reopen a closed day').max(400),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reopen request' });
    return;
  }

  try {
    const closing = await reopenDailyLedger({
      date: parsed.data.date,
      adminUserId: req.user!.id,
      reason: parsed.data.reason,
    });
    res.json({ closing });
  } catch (error: any) {
    console.error('Failed to reopen closed day:', error);
    res.status(400).json({ error: error?.message || 'Failed to reopen day' });
  }
});

// ============================================================================
// ADMIN: BALANCE RECALCULATION, STAFF MANAGEMENT, ACTIVITY LOGS, SETTINGS
// ============================================================================

app.post('/api/admin/balances/recalculate', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const results = await recalculateAllAccountBalances(req.user!.id);
    res.json({
      results,
      discrepanciesFixed: results.filter((r) => r.changed).length,
    });
  } catch (error) {
    console.error('Balance recalculation failed:', error);
    res.status(500).json({ error: 'Balance recalculation failed' });
  }
});

app.get('/api/admin/staff', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const [allUsers, counts] = await Promise.all([
      db
        .select({
          id: users.id,
          uid: users.uid,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.id)),
      db
        .select({
          userId: transactions.createdById,
          count: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .groupBy(transactions.createdById),
    ]);

    const countMap = new Map(counts.map((c) => [c.userId, c.count]));
    res.json({
      users: allUsers.map((u) => ({
        ...u,
        transactionCount: countMap.get(u.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error('Failed to load staff users:', error);
    res.status(500).json({ error: 'Failed to load staff directory' });
  }
});

const createStaffSchema = z.object({
  name: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
});

app.post('/api/admin/staff', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user payload' });
    return;
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const uid = `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inserted = await db
      .insert(users)
      .values({
        uid,
        name: parsed.data.name.trim(),
        email,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        status: 'ACTIVE',
      })
      .returning({
        id: users.id,
        uid: users.uid,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      });

    await logActivity({
      userId: req.user!.id,
      action: 'CREATE_STAFF',
      entity: 'User',
      entityId: inserted[0].id,
      afterSnapshot: inserted[0],
    });

    broadcastRealtimeEvent('staff:updated', { entityId: inserted[0].id, adminOnly: true });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.status(201).json({ user: inserted[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'A user with that email already exists.' });
      return;
    }
    console.error('Failed to create staff user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

const updateStaffSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128).optional(),
});

app.patch('/api/admin/staff/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
    return;
  }

  try {
    const existingRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetId === req.user!.id && parsed.data.status === 'DISABLED') {
      res.status(400).json({ error: 'You cannot disable your own active administrator account.' });
      return;
    }
    if (targetId === req.user!.id && parsed.data.role && parsed.data.role !== 'ADMIN') {
      res.status(400).json({ error: 'You cannot remove Administrator privileges from your own account.' });
      return;
    }

    const updateValues: Partial<typeof users.$inferInsert> = {};
    if (parsed.data.name) updateValues.name = parsed.data.name.trim();
    if (parsed.data.role) updateValues.role = parsed.data.role;
    if (parsed.data.status) updateValues.status = parsed.data.status;
    if (parsed.data.newPassword) updateValues.passwordHash = hashPassword(parsed.data.newPassword);

    if (Object.keys(updateValues).length === 0) {
      res.status(400).json({
        error: 'At least one field (name, role, status, or newPassword) is required.',
      });
      return;
    }

    const updated = await db
      .update(users)
      .set(updateValues)
      .where(eq(users.id, targetId))
      .returning({
        id: users.id,
        uid: users.uid,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      });

    await logActivity({
      userId: req.user!.id,
      action: parsed.data.newPassword ? 'RESET_PASSWORD' : 'UPDATE_STAFF',
      entity: 'User',
      entityId: targetId,
      beforeSnapshot: {
        id: existing.id,
        name: existing.name,
        role: existing.role,
        status: existing.status,
      },
      afterSnapshot: {
        ...updated[0],
        passwordReset: Boolean(parsed.data.newPassword),
      },
    });

    broadcastRealtimeEvent('staff:updated', { entityId: targetId, adminOnly: true });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.json({ user: updated[0] });
  } catch (error) {
    console.error('Failed to update staff user:', error);
    res.status(500).json({ error: 'Failed to update staff user' });
  }
});

app.get('/api/admin/activity-logs', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const actionFilter =
      typeof req.query.action === 'string' && req.query.action !== 'ALL' ? req.query.action : null;
    const entityFilter =
      typeof req.query.entity === 'string' && req.query.entity !== 'ALL' ? req.query.entity : null;
    const userIdFilter = parseOptionalPositiveInt(req.query.userId);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const requestedPage = parsePositiveInt(req.query.page, 1);
    const pageSize = 25;

    const allUsers = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const conditions = [];
    if (actionFilter) conditions.push(eq(activityLogs.action, actionFilter));
    if (entityFilter) conditions.push(eq(activityLogs.entity, entityFilter));
    if (userIdFilter) conditions.push(eq(activityLogs.userId, userIdFilter));

    if (search) {
      const pattern = `%${search}%`;
      const normalizedId = search.startsWith('#') ? search.slice(1) : search;
      const matchingUserIds = allUsers
        .filter(
          (u) =>
            u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
        )
        .map((u) => u.id);

      const searchParts = [
        ilike(activityLogs.action, pattern),
        ilike(activityLogs.entity, pattern),
        ilike(activityLogs.entityId, pattern),
        ilike(activityLogs.reason, pattern),
      ];
      if (normalizedId && normalizedId !== search) {
        searchParts.push(ilike(activityLogs.entityId, `%${normalizedId}%`));
      }
      if (matchingUserIds.length > 0) {
        searchParts.push(inArray(activityLogs.userId, matchingUserIds));
      }
      conditions.push(or(...searchParts)!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(whereClause);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const logs = await db
      .select()
      .from(activityLogs)
      .where(whereClause)
      .orderBy(desc(activityLogs.timestamp), desc(activityLogs.id))
      .limit(pageSize)
      .offset(offset);

    res.json({
      logs: logs.map((l) => ({
        ...l,
        userName: l.userId ? userMap.get(l.userId)?.name ?? 'Unknown' : 'System',
        userEmail: l.userId ? userMap.get(l.userId)?.email ?? '' : '',
        userRole: l.userId ? userMap.get(l.userId)?.role ?? '' : 'SYSTEM',
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    res.status(500).json({ error: 'Failed to load activity logs' });
  }
});

app.get('/api/admin/settings', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const sysSettings = await getSystemSettings();
    res.json({ settings: sysSettings });
  } catch (error) {
    console.error('Failed to read settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

const settingsPatchSchema = z.object({
  defaultCurrency: z.enum(['AED', 'INR']).optional(),
  reportingCurrency: z.enum(['INR', 'AED']).optional(),
  rateRefreshMode: z.enum(['AUTO', 'MANUAL']).optional(),
  rateRefreshSchedule: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  rateMarkup: z
    .string()
    .refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= -20 && Number(v) <= 20,
      'Markup must be between -20% and +20%'
    )
    .optional(),
  timezone: z
    .string()
    .min(2)
    .max(60)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA timezone (e.g. Asia/Dubai)')
    .optional(),
  staffCanViewReports: z.boolean().optional(),
  staffCanExport: z.boolean().optional(),
  staffCanAddAccounts: z.boolean().optional(),
  staffCanDownloadBackups: z.boolean().optional(),
});

app.patch('/api/admin/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings payload' });
    return;
  }

  try {
    const before = await getSystemSettings();
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updates[k] = String(v);
    }
    const after = await upsertSettings(updates);

    await logActivity({
      userId: req.user!.id,
      action: 'UPDATE_SETTINGS',
      entity: 'Setting',
      entityId: 'system',
      beforeSnapshot: before,
      afterSnapshot: after,
      reason: 'Administrator updated system currency & permission settings',
    });

    broadcastRealtimeEvent('settings:updated', { entityId: 'system' });
    broadcastRealtimeEvent('rates:updated', { entityId: 'markup' });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.json({ settings: after });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================================================
// REPORTS (DATA, PDF, EXCEL)
// ============================================================================

async function buildReportPayload(req: AuthRequest): Promise<ReportPayload> {
  const startDate =
    typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
      ? req.query.startDate
      : getDubaiDateDaysAgo(30);
  const endDate =
    typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
      ? req.query.endDate
      : getDubaiDateString();
  if (startDate > endDate) {
    throw new BadRequestError('Start date cannot be after end date');
  }
  const accountId = parseOptionalPositiveInt(req.query.accountId);
  const type =
    typeof req.query.type === 'string' && req.query.type !== 'ALL' ? req.query.type : null;
  const reportMode: NonNullable<ReportPayload['reportMode']> =
    req.query.reportMode === 'DAILY' ||
    req.query.reportMode === 'MONTHLY' ||
    req.query.reportMode === 'ACCOUNT'
      ? req.query.reportMode
      : 'DETAILED';
  const currencyView: ReportCurrencyView =
    req.query.currencyView === 'AED' || req.query.currencyView === 'INR'
      ? req.query.currencyView
      : 'BOTH';
  const includeRateVariance = req.query.includeRateVariance === 'true';

  const conditions = [gte(transactions.date, startDate), lte(transactions.date, endDate)];
  if (accountId) {
    conditions.push(eq(transactions.accountId, accountId));
  }
  if (type) {
    conditions.push(eq(transactions.type, type));
  }

  const [txRows, allAccounts, allUsers, currentRate] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(asc(transactions.date), asc(transactions.id)),
    db.select().from(accounts),
    db.select({ id: users.id, name: users.name }).from(users),
    getEffectiveRateForDate(getDubaiDateString()),
  ]);

  const accMap = new Map(allAccounts.map((a) => [a.id, a]));
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  let totalCreditsAed = new Decimal(0);
  let totalDebitsAed = new Decimal(0);
  let totalCreditsInr = new Decimal(0);
  let totalDebitsInr = new Decimal(0);

  const groupAccumulators = new Map<
    string,
    {
      label: string;
      entryCount: number;
      creditsAed: Decimal;
      debitsAed: Decimal;
      creditsInr: Decimal;
      debitsInr: Decimal;
    }
  >();

  const rows = txRows.map((t) => {
    if (t.type === 'CREDIT') {
      totalCreditsAed = totalCreditsAed.plus(t.amount);
      totalCreditsInr = totalCreditsInr.plus(t.convertedAmountInr);
    } else {
      totalDebitsAed = totalDebitsAed.plus(t.amount);
      totalDebitsInr = totalDebitsInr.plus(t.convertedAmountInr);
    }
    const acc = accMap.get(t.accountId);

    if (reportMode !== 'DETAILED') {
      const key =
        reportMode === 'DAILY'
          ? t.date
          : reportMode === 'MONTHLY'
            ? t.date.slice(0, 7)
            : String(t.accountId);
      const label =
        reportMode === 'DAILY'
          ? t.date
          : reportMode === 'MONTHLY'
            ? t.date.slice(0, 7)
            : acc
              ? `${acc.accountNumber} — ${acc.name}`
              : `Account #${t.accountId}`;

      let bucket = groupAccumulators.get(key);
      if (!bucket) {
        bucket = {
          label,
          entryCount: 0,
          creditsAed: new Decimal(0),
          debitsAed: new Decimal(0),
          creditsInr: new Decimal(0),
          debitsInr: new Decimal(0),
        };
        groupAccumulators.set(key, bucket);
      }
      bucket.entryCount += 1;
      if (t.type === 'CREDIT') {
        bucket.creditsAed = bucket.creditsAed.plus(t.amount);
        bucket.creditsInr = bucket.creditsInr.plus(t.convertedAmountInr);
      } else {
        bucket.debitsAed = bucket.debitsAed.plus(t.amount);
        bucket.debitsInr = bucket.debitsInr.plus(t.convertedAmountInr);
      }
    }

    return {
      id: t.id,
      date: t.date,
      accountName: acc?.name ?? 'Unknown',
      accountNumber: acc?.accountNumber ?? '',
      type: t.type,
      originalAmount: t.originalAmount,
      originalCurrency: t.originalCurrency,
      amount: t.amount,
      exchangeRate: t.exchangeRate,
      convertedAmountInr: t.convertedAmountInr,
      rateDate: t.rateDate,
      rateSource: t.rateSource,
      runningBalance: t.runningBalance,
      status: t.status,
      description: t.description,
      createdByName: userMap.get(t.createdById) ?? 'System',
    };
  });

  const summaryGroups: ReportPayload['summaryGroups'] =
    reportMode === 'DETAILED'
      ? undefined
      : Array.from(groupAccumulators.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, g]) => ({
            key,
            label: g.label,
            entryCount: g.entryCount,
            creditsAed: g.creditsAed.toFixed(2),
            debitsAed: g.debitsAed.toFixed(2),
            netAed: g.creditsAed.minus(g.debitsAed).toFixed(2),
            creditsInr: g.creditsInr.toFixed(2),
            debitsInr: g.debitsInr.toFixed(2),
            netInr: g.creditsInr.minus(g.debitsInr).toFixed(2),
          }));

  const accLabel =
    accountId && accMap.get(accountId)
      ? `Account: ${accMap.get(accountId)!.name} (${accMap.get(accountId)!.accountNumber})`
      : 'All Active Accounts';

  return {
    title:
      reportMode === 'MONTHLY'
        ? 'Monthly Bookkeeping Ledger Statement'
        : reportMode === 'ACCOUNT'
          ? 'Account-Wise Ledger Statement'
          : reportMode === 'DAILY'
            ? 'Daily Ledger Statement'
            : 'Ledger Transactions Report',
    subtitle: accLabel,
    dateRangeLabel: `${startDate} to ${endDate}`,
    reportMode,
    currencyView,
    includeRateVariance,
    currentReferenceRate: currentRate.rate ?? undefined,
    summaryGroups,
    rows,
    totals: {
      totalCreditsAed: totalCreditsAed.toFixed(2),
      totalDebitsAed: totalDebitsAed.toFixed(2),
      netAed: totalCreditsAed.minus(totalDebitsAed).toFixed(2),
      totalCreditsInr: totalCreditsInr.toFixed(2),
      totalDebitsInr: totalDebitsInr.toFixed(2),
      netInr: totalCreditsInr.minus(totalDebitsInr).toFixed(2),
    },
  };
}

app.get('/api/reports/data', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanViewReports) {
      res.status(403).json({ error: 'Report access is disabled for staff accounts.' });
      return;
    }

    const report = await buildReportPayload(req);
    res.json({ report });
  } catch (error: any) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to generate report data:', error);
    res.status(500).json({ error: 'Failed to load report data' });
  }
});

app.get('/api/reports/export/pdf', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanExport) {
      res.status(403).json({ error: 'Report exports are disabled for staff accounts.' });
      return;
    }

    const report = await buildReportPayload(req);
    const pdfBuffer = await generatePdfReport(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="webx-ledger-${report.dateRangeLabel.replace(/\s+/g, '-')}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to export PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

app.get('/api/reports/export/excel', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanExport) {
      res.status(403).json({ error: 'Report exports are disabled for staff accounts.' });
      return;
    }

    const report = await buildReportPayload(req);
    const xlsxBuffer = await generateExcelReport(report);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="webx-ledger-${report.dateRangeLabel.replace(/\s+/g, '-')}.xlsx"`
    );
    res.send(xlsxBuffer);
  } catch (error: any) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to export Excel:', error);
    res.status(500).json({ error: 'Failed to generate Excel workbook' });
  }
});

// ============================================================================
// MONTHLY DATA BACKUPS & END-OF-MONTH ARCHIVES
// ============================================================================

app.get('/api/backups/monthly', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanDownloadBackups) {
      res.status(403).json({
        error: 'Monthly backup downloads are currently disabled for staff accounts.',
      });
      return;
    }

    const overview = await listMonthlyBackupOverview();
    res.json(overview);
  } catch (error) {
    console.error('Failed to list monthly backups:', error);
    res.status(500).json({ error: 'Failed to load monthly backup archives' });
  }
});

const generateBackupSchema = z.object({
  month: z
    .string()
    .trim()
    .refine((m) => isValidMonthString(m), 'Month must use YYYY-MM format'),
  forceRebuild: z.boolean().optional(),
});

app.post('/api/backups/monthly/generate', requireAuth, async (req: AuthRequest, res) => {
  const parsed = generateBackupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid backup month' });
    return;
  }

  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanDownloadBackups) {
      res.status(403).json({
        error: 'Monthly backup downloads are currently disabled for staff accounts.',
      });
      return;
    }

    if (parsed.data.forceRebuild && req.user!.role !== 'ADMIN') {
      res.status(403).json({
        error: 'Only Administrators can rebuild a locked historical monthly archive.',
      });
      return;
    }

    const result = await createOrRefreshMonthlyBackup({
      month: parsed.data.month,
      userId: req.user!.id,
      generationType: 'MANUAL',
      forceRebuild: Boolean(parsed.data.forceRebuild && req.user!.role === 'ADMIN'),
    });

    res.status(201).json({
      archive: {
        id: result.record.id,
        month: result.record.month,
        monthLabel: result.snapshot.monthLabel,
        periodStart: result.record.periodStart,
        periodEnd: result.record.periodEnd,
        status: result.record.status,
        generationType: result.record.generationType,
        accountCount: result.record.accountCount,
        transactionCount: result.record.transactionCount,
        dailyClosingCount: result.record.dailyClosingCount,
        exchangeRateCount: result.record.exchangeRateCount,
        supportTicketCount: result.record.supportTicketCount,
        totalCreditsAed: result.record.totalCreditsAed,
        totalDebitsAed: result.record.totalDebitsAed,
        totalCreditsInr: result.record.totalCreditsInr,
        totalDebitsInr: result.record.totalDebitsInr,
        closingBalanceAed: result.record.closingBalanceAed,
        sha256Checksum: result.record.sha256Checksum,
        createdAt: result.record.createdAt,
        updatedAt: result.record.updatedAt,
      },
      wasLockedPreserved: result.wasLockedPreserved,
    });
  } catch (error: any) {
    console.error('Failed to generate monthly backup:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate monthly backup archive' });
  }
});

app.get('/api/backups/monthly/:month/download', requireAuth, async (req: AuthRequest, res) => {
  const month = String(req.params.month || '').trim();
  if (!isValidMonthString(month)) {
    res.status(400).json({ error: 'Invalid backup month (expected YYYY-MM)' });
    return;
  }

  const rawFormat = String(req.query.format || 'xlsx').toLowerCase();
  if (rawFormat !== 'xlsx' && rawFormat !== 'json' && rawFormat !== 'pdf') {
    res.status(400).json({ error: 'Unsupported format (expected xlsx, json, or pdf)' });
    return;
  }
  const format: BackupDownloadFormat = rawFormat;

  try {
    const sysSettings = await getSystemSettings();
    if (req.user!.role !== 'ADMIN' && !sysSettings.staffCanDownloadBackups) {
      res.status(403).json({
        error: 'Monthly backup downloads are currently disabled for staff accounts.',
      });
      return;
    }

    const { snapshot, checksum } = await getMonthlyBackupPayloadForUser({
      month,
      user: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      },
    });

    let buffer: Buffer;
    let contentType: string;
    if (format === 'json') {
      buffer = generateMonthlyBackupJson(snapshot, checksum);
      contentType = 'application/json; charset=utf-8';
    } else if (format === 'pdf') {
      buffer = await generateMonthlyBackupPdf(snapshot, checksum);
      contentType = 'application/pdf';
    } else {
      buffer = await generateMonthlyBackupExcel(snapshot, checksum);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    await logActivity({
      userId: req.user!.id,
      action: 'DOWNLOAD_MONTHLY_BACKUP',
      entity: 'MonthlyBackup',
      entityId: month,
      afterSnapshot: {
        month,
        format,
        sha256Checksum: checksum,
        transactionCount: snapshot.totals.transactionCount,
      },
      reason: `Downloaded ${month} monthly backup (${format.toUpperCase()})`,
    });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Backup-Checksum', checksum);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="webx-monthly-backup-${month}.${format}"`
    );
    res.send(buffer);
  } catch (error: any) {
    console.error('Failed to download monthly backup:', error);
    res.status(500).json({ error: error?.message || 'Failed to prepare monthly backup download' });
  }
});

// ============================================================================
// SUPPORT DESK & TICKET ROUTING (adwebcomicllp@gmail.com)
// ============================================================================

const publicSupportRateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkPublicSupportRateLimit(ipKey: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 12;

  if (publicSupportRateLimiter.size > 500) {
    for (const [key, entry] of publicSupportRateLimiter.entries()) {
      if (now > entry.resetAt) {
        publicSupportRateLimiter.delete(key);
      }
    }
  }

  const current = publicSupportRateLimiter.get(ipKey);
  if (!current || now > current.resetAt) {
    publicSupportRateLimiter.set(ipKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  return true;
}

const createSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  priority: z.enum(SUPPORT_PRIORITIES).default('NORMAL'),
  requesterName: z.string().trim().min(2, 'Your name is required').max(100),
  requesterEmail: z.string().trim().email('A valid email address is required').max(160),
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(180),
  description: z.string().trim().min(10, 'Please provide at least 10 characters of detail').max(4000),
  detailReference: z.string().trim().max(240).optional(),
});

app.get('/api/support/config', (_req, res) => {
  res.json({
    supportEmail: getConfiguredSupportEmail(),
    emailRelayConfigured: isSmtpConfigured(),
    services: SUPPORT_SERVICES,
  });
});

app.post('/api/support/public', async (req, res) => {
  const ipKey = req.ip || 'unknown';
  if (!checkPublicSupportRateLimit(ipKey)) {
    res.status(429).json({
      error: `Too many support requests from this address. Please email ${getConfiguredSupportEmail()} directly or try again shortly.`,
    });
    return;
  }

  const parsed = createSupportTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid support request' });
    return;
  }

  try {
    const ticketNumber = generateTicketNumber();
    const metadataObj = parsed.data.detailReference
      ? { detailReference: parsed.data.detailReference, origin: 'PRE_LOGIN_PORTAL' }
      : { origin: 'PRE_LOGIN_PORTAL' };

    const dispatch = await dispatchSupportTicketEmail({
      ticketNumber,
      category: parsed.data.category,
      priority: parsed.data.priority,
      requesterName: parsed.data.requesterName,
      requesterEmail: parsed.data.requesterEmail.toLowerCase(),
      requesterRole: 'EXTERNAL',
      subject: parsed.data.subject,
      description: parsed.data.description,
      metadata: metadataObj,
    });

    const ticket = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(supportTickets)
        .values({
          ticketNumber,
          category: parsed.data.category,
          priority: parsed.data.priority,
          status: 'OPEN',
          requesterUserId: null,
          requesterName: parsed.data.requesterName,
          requesterEmail: parsed.data.requesterEmail.toLowerCase(),
          subject: parsed.data.subject,
          description: parsed.data.description,
          metadata: metadataObj,
          routedToEmail: dispatch.routedToEmail,
          emailDeliveryStatus: dispatch.emailDeliveryStatus,
          emailMessageId: dispatch.emailMessageId,
        })
        .returning();

      await tx.insert(supportMessages).values({
        ticketId: inserted.id,
        senderUserId: null,
        senderName: parsed.data.requesterName,
        senderRole: 'EXTERNAL',
        message: parsed.data.description,
      });

      await logActivity(
        {
          userId: null,
          action: 'CREATE_PUBLIC_SUPPORT_TICKET',
          entity: 'SupportTicket',
          entityId: inserted.ticketNumber,
          afterSnapshot: {
            category: inserted.category,
            priority: inserted.priority,
            requesterEmail: inserted.requesterEmail,
            routedToEmail: inserted.routedToEmail,
            emailDeliveryStatus: inserted.emailDeliveryStatus,
          },
          reason: `Pre-login support request (${inserted.category}) routed to ${inserted.routedToEmail}`,
        },
        tx
      );

      return inserted;
    });

    broadcastRealtimeEvent('support:updated', { entityId: ticket.id, adminOnly: true });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.status(201).json({
      ticket,
      mailtoUrl: dispatch.mailtoUrl,
      deliveryNote: dispatch.deliveryNote,
    });
  } catch (error) {
    console.error('Failed to submit public support ticket:', error);
    res.status(500).json({ error: 'Unable to submit support request right now' });
  }
});

app.get('/api/support/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const categoryFilter =
      typeof req.query.category === 'string' && req.query.category !== 'ALL'
        ? req.query.category
        : null;
    const statusFilter =
      typeof req.query.status === 'string' && req.query.status !== 'ALL'
        ? req.query.status
        : null;
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const conditions = [];
    if (req.user!.role !== 'ADMIN') {
      conditions.push(
        or(
          eq(supportTickets.requesterUserId, req.user!.id),
          sql`LOWER(${supportTickets.requesterEmail}) = LOWER(${req.user!.email})`
        )!
      );
    }
    if (categoryFilter) {
      conditions.push(eq(supportTickets.category, categoryFilter));
    }
    if (statusFilter) {
      conditions.push(eq(supportTickets.status, statusFilter));
    }

    const [rows, adminUsers] = await Promise.all([
      conditions.length > 0
        ? db
            .select()
            .from(supportTickets)
            .where(and(...conditions))
            .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
        : db
            .select()
            .from(supportTickets)
            .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id)),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);

    const userMap = new Map(adminUsers.map((u) => [u.id, u.name]));

    const filtered = rows
      .filter((t) => {
        if (!search) return true;
        return (
          t.ticketNumber.toLowerCase().includes(search) ||
          t.subject.toLowerCase().includes(search) ||
          t.requesterName.toLowerCase().includes(search) ||
          t.requesterEmail.toLowerCase().includes(search) ||
          t.description.toLowerCase().includes(search)
        );
      })
      .map((t) => ({
        ...t,
        assignedAdminName: t.assignedAdminId ? userMap.get(t.assignedAdminId) ?? 'Admin' : null,
      }));

    res.json({
      supportEmail: getConfiguredSupportEmail(),
      emailRelayConfigured: isSmtpConfigured(),
      tickets: filtered,
      summary: {
        total: rows.length,
        open: rows.filter((t) => t.status === 'OPEN').length,
        inProgress: rows.filter((t) => t.status === 'IN_PROGRESS').length,
        resolved: rows.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
        urgentOrHigh: rows.filter(
          (t) =>
            (t.priority === 'URGENT' || t.priority === 'HIGH') &&
            t.status !== 'RESOLVED' &&
            t.status !== 'CLOSED'
        ).length,
      },
    });
  } catch (error) {
    console.error('Failed to load support tickets:', error);
    res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

const authSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  priority: z.enum(SUPPORT_PRIORITIES).default('NORMAL'),
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(180),
  description: z.string().trim().min(10, 'Please provide at least 10 characters of detail').max(4000),
  detailReference: z.string().trim().max(240).optional(),
});

app.post('/api/support/tickets', requireAuth, async (req: AuthRequest, res) => {
  const parsed = authSupportTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid support ticket' });
    return;
  }

  try {
    const ticketNumber = generateTicketNumber();
    const metadataObj = {
      ...(parsed.data.detailReference ? { detailReference: parsed.data.detailReference } : {}),
      origin: `${req.user!.role}_WORKSPACE`,
    };

    const dispatch = await dispatchSupportTicketEmail({
      ticketNumber,
      category: parsed.data.category,
      priority: parsed.data.priority,
      requesterName: req.user!.name,
      requesterEmail: req.user!.email,
      requesterRole: req.user!.role,
      subject: parsed.data.subject,
      description: parsed.data.description,
      metadata: metadataObj,
    });

    const ticket = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(supportTickets)
        .values({
          ticketNumber,
          category: parsed.data.category,
          priority: parsed.data.priority,
          status: 'OPEN',
          requesterUserId: req.user!.id,
          requesterName: req.user!.name,
          requesterEmail: req.user!.email,
          subject: parsed.data.subject,
          description: parsed.data.description,
          metadata: metadataObj,
          routedToEmail: dispatch.routedToEmail,
          emailDeliveryStatus: dispatch.emailDeliveryStatus,
          emailMessageId: dispatch.emailMessageId,
        })
        .returning();

      await tx.insert(supportMessages).values({
        ticketId: inserted.id,
        senderUserId: req.user!.id,
        senderName: req.user!.name,
        senderRole: req.user!.role,
        message: parsed.data.description,
      });

      await logActivity(
        {
          userId: req.user!.id,
          action: 'CREATE_SUPPORT_TICKET',
          entity: 'SupportTicket',
          entityId: inserted.ticketNumber,
          afterSnapshot: {
            category: inserted.category,
            priority: inserted.priority,
            routedToEmail: inserted.routedToEmail,
            emailDeliveryStatus: inserted.emailDeliveryStatus,
          },
          reason: `Support ticket submitted (${inserted.category}) -> ${inserted.routedToEmail}`,
        },
        tx
      );

      return inserted;
    });

    broadcastRealtimeEvent('support:updated', { entityId: ticket.id });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.status(201).json({
      ticket,
      mailtoUrl: dispatch.mailtoUrl,
      deliveryNote: dispatch.deliveryNote,
    });
  } catch (error) {
    console.error('Failed to create support ticket:', error);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

app.get('/api/support/tickets/:id', requireAuth, async (req: AuthRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }

  try {
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId));

    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found' });
      return;
    }

    if (
      req.user!.role !== 'ADMIN' &&
      ticket.requesterUserId !== req.user!.id &&
      ticket.requesterEmail.toLowerCase() !== req.user!.email.toLowerCase()
    ) {
      res.status(403).json({ error: 'You do not have access to this support ticket' });
      return;
    }

    const messages = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, ticket.id))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));

    res.json({ ticket, messages });
  } catch (error) {
    console.error('Failed to fetch ticket detail:', error);
    res.status(500).json({ error: 'Failed to load support ticket detail' });
  }
});

const supportReplySchema = z.object({
  message: z.string().trim().min(2, 'Reply message cannot be empty').max(4000),
});

app.post('/api/support/tickets/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }

  const parsed = supportReplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reply' });
    return;
  }

  try {
    const txOutcome = await db.transaction(async (tx) => {
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .for('update');

      if (!ticket) {
        return { ok: false as const, errorStatus: 404 as const, errorMessage: 'Support ticket not found' };
      }

      if (
        req.user!.role !== 'ADMIN' &&
        ticket.requesterUserId !== req.user!.id &&
        ticket.requesterEmail.toLowerCase() !== req.user!.email.toLowerCase()
      ) {
        return {
          ok: false as const,
          errorStatus: 403 as const,
          errorMessage: 'You do not have access to reply to this ticket',
        };
      }

      const [reply] = await tx
        .insert(supportMessages)
        .values({
          ticketId: ticket.id,
          senderUserId: req.user!.id,
          senderName: req.user!.name,
          senderRole: req.user!.role,
          message: parsed.data.message,
        })
        .returning();

      const nextStatus =
        req.user!.role === 'ADMIN' && ticket.status === 'OPEN'
          ? 'IN_PROGRESS'
          : ticket.status;

      await tx
        .update(supportTickets)
        .set({
          status: nextStatus,
          assignedAdminId:
            req.user!.role === 'ADMIN' && !ticket.assignedAdminId
              ? req.user!.id
              : ticket.assignedAdminId,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticket.id));

      await logActivity(
        {
          userId: req.user!.id,
          action: 'REPLY_SUPPORT_TICKET',
          entity: 'SupportTicket',
          entityId: ticket.ticketNumber,
          afterSnapshot: { senderRole: req.user!.role, nextStatus },
        },
        tx
      );

      return { ok: true as const, ticket, reply };
    });

    if (!txOutcome.ok) {
      res.status(txOutcome.errorStatus).json({ error: txOutcome.errorMessage });
      return;
    }

    await dispatchSupportReplyEmail({
      ticketNumber: txOutcome.ticket.ticketNumber,
      category: txOutcome.ticket.category as any,
      subject: txOutcome.ticket.subject,
      senderName: req.user!.name,
      senderEmail: req.user!.email,
      senderRole: req.user!.role,
      message: parsed.data.message,
    });

    broadcastRealtimeEvent('support:updated', { entityId: txOutcome.ticket.id });
    broadcastRealtimeEvent('activity:updated', { adminOnly: true });

    res.status(201).json({ message: txOutcome.reply });
  } catch (error) {
    console.error('Failed to add support reply:', error);
    res.status(500).json({ error: 'Failed to post support reply' });
  }
});

const adminUpdateTicketSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  resolutionNotes: z.string().trim().max(1500).optional(),
  assignToMe: z.boolean().optional(),
});

app.patch(
  '/api/admin/support/tickets/:id',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket ID' });
      return;
    }

    const parsed = adminUpdateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
      return;
    }
    if (
      parsed.data.status === undefined &&
      parsed.data.priority === undefined &&
      parsed.data.resolutionNotes === undefined &&
      !parsed.data.assignToMe
    ) {
      res.status(400).json({ error: 'At least one update field is required.' });
      return;
    }

    try {
      const updated = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, ticketId))
          .for('update');

        if (!before) {
          return null;
        }

        const [saved] = await tx
          .update(supportTickets)
          .set({
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
            ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
            ...(parsed.data.resolutionNotes !== undefined
              ? { resolutionNotes: parsed.data.resolutionNotes || null }
              : {}),
            ...(parsed.data.assignToMe ? { assignedAdminId: req.user!.id } : {}),
            updatedAt: new Date(),
          })
          .where(eq(supportTickets.id, ticketId))
          .returning();

        await logActivity(
          {
            userId: req.user!.id,
            action: 'UPDATE_SUPPORT_TICKET',
            entity: 'SupportTicket',
            entityId: saved.ticketNumber,
            beforeSnapshot: {
              status: before.status,
              priority: before.priority,
              resolutionNotes: before.resolutionNotes,
            },
            afterSnapshot: {
              status: saved.status,
              priority: saved.priority,
              resolutionNotes: saved.resolutionNotes,
            },
            reason: parsed.data.resolutionNotes || `Updated ticket status to ${saved.status}`,
          },
          tx
        );

        return saved;
      });

      if (!updated) {
        res.status(404).json({ error: 'Support ticket not found' });
        return;
      }

      broadcastRealtimeEvent('support:updated', { entityId: updated.id });
      broadcastRealtimeEvent('activity:updated', { adminOnly: true });

      res.json({ ticket: updated });
    } catch (error) {
      console.error('Failed to update support ticket:', error);
      res.status(500).json({ error: 'Failed to update support ticket' });
    }
  }
);

// ============================================================================
// SERVER STARTUP (HTTP + WEBSOCKETS + VITE MIDDLEWARE / STATIC DIST)
// ============================================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  try {
    await ensurePreconfiguredAccounts();
  } catch (err) {
    console.error('Failed to ensure preconfigured accounts:', err);
  }

  const httpServer = http.createServer(app);
  initRealtimeServer(httpServer);

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`WebX server & WebSocket hub listening on http://0.0.0.0:${port}`);
    startExchangeRateScheduler();
    startMonthlyBackupScheduler();
  });
}

startServer();
