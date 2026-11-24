import Decimal from 'decimal.js';
import { asc, eq, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { accounts, dailyClosings, transactions } from '../db/schema.ts';
import {
  ClosedDayError,
  CurrencyCode,
  TransactionType,
  assertDayNotClosed,
  computeRunningBalances,
  convertTransactionAmounts,
  getDubaiDateString,
  round2,
  round6,
} from '../lib/money.ts';
import { logActivity } from './activityLog.ts';
import { RateUnavailableError, getEffectiveRateForDate } from './exchangeRates.ts';
import { broadcastRealtimeEvent } from './realtime.ts';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

export async function recalculateAccountBalances(
  executor: DbExecutor,
  accountId: number
): Promise<string> {
  const accRows = await executor
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const account = accRows[0];
  if (!account) {
    throw new Error(`Account ${accountId} not found.`);
  }

  const txRows = await executor
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date), asc(transactions.id));

  const computed = computeRunningBalances(account.openingBalance, txRows);

  for (const item of computed.entries) {
    const existing = txRows.find((t) => t.id === item.id);
    if (existing && existing.runningBalance !== item.runningBalance) {
      await executor
        .update(transactions)
        .set({ runningBalance: item.runningBalance })
        .where(eq(transactions.id, item.id));
    }
  }

  await executor
    .update(accounts)
    .set({ currentBalance: computed.finalBalance })
    .where(eq(accounts.id, accountId));

  return computed.finalBalance;
}

export async function createLedgerTransaction(params: {
  accountId: number;
  type: TransactionType;
  originalAmount: string;
  originalCurrency: CurrencyCode;
  date: string;
  description: string;
  createdById: number;
}) {
  const rateInfo = await getEffectiveRateForDate(params.date, {
    userId: params.createdById,
  });
  if (!rateInfo.rateAvailable || !rateInfo.rate) {
    throw new RateUnavailableError(rateInfo.warningMessage);
  }
  const resolvedRate = rateInfo.rate;

  const result = await db.transaction(async (tx) => {
    const closedRows = await tx
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, params.date))
      .limit(1);
    assertDayNotClosed(closedRows[0]?.status, params.date);

    const accRows = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .for('update')
      .limit(1);
    const account = accRows[0];
    if (!account) {
      throw new Error('Selected account not found.');
    }
    if (account.status !== 'ACTIVE') {
      throw new Error('Cannot log entries against an inactive account.');
    }

    const converted = convertTransactionAmounts({
      originalAmount: params.originalAmount,
      originalCurrency: params.originalCurrency,
      exchangeRate: resolvedRate,
      baseCurrency: (account.baseCurrency as CurrencyCode) || 'AED',
    });

    const inserted = await tx
      .insert(transactions)
      .values({
        accountId: params.accountId,
        type: params.type,
        amount: converted.amountInBase,
        originalAmount: converted.originalAmount,
        originalCurrency: converted.originalCurrency,
        exchangeRate: converted.exchangeRate,
        convertedAmountInr: converted.convertedAmountInr,
        rateDate: rateInfo.rateDate,
        rateSource: rateInfo.source,
        date: params.date,
        description: params.description.trim(),
        createdById: params.createdById,
        status: 'ACTIVE',
        runningBalance: '0.00',
      })
      .returning();

    const finalBalance = await recalculateAccountBalances(tx, params.accountId);

    const updatedTxRows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, inserted[0].id))
      .limit(1);

    await logActivity(
      {
        userId: params.createdById,
        action: 'CREATE_TRANSACTION',
        entity: 'Transaction',
        entityId: inserted[0].id,
        afterSnapshot: {
          ...updatedTxRows[0],
          accountBalanceAfter: finalBalance,
        },
      },
      tx
    );

    return {
      transaction: updatedTxRows[0],
      rateWarning: rateInfo.fallbackWarning ? rateInfo.warningMessage : null,
    };
  });

  broadcastRealtimeEvent('ledger:updated', { entityId: result.transaction.id });
  broadcastRealtimeEvent('accounts:updated', { entityId: params.accountId });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return result;
}

export async function editLedgerTransaction(params: {
  transactionId: number;
  adminUserId: number;
  reason: string;
  accountId?: number;
  type?: TransactionType;
  originalAmount?: string;
  originalCurrency?: CurrencyCode;
  date?: string;
  description?: string;
  recalculateRate?: boolean;
}) {
  if (!params.reason || !params.reason.trim()) {
    throw new Error('A reason is required to edit a transaction.');
  }

  let prefetchedRateInfo: Awaited<ReturnType<typeof getEffectiveRateForDate>> | null = null;
  let prefetchedRateDate: string | null = null;
  if (params.recalculateRate) {
    let targetDate = params.date;
    if (!targetDate) {
      const quickLookup = await db
        .select({ date: transactions.date })
        .from(transactions)
        .where(eq(transactions.id, params.transactionId))
        .limit(1);
      if (!quickLookup[0]) {
        throw new Error('Transaction not found.');
      }
      targetDate = quickLookup[0].date;
    }
    prefetchedRateDate = targetDate;
    prefetchedRateInfo = await getEffectiveRateForDate(targetDate, {
      userId: params.adminUserId,
    });
    if (!prefetchedRateInfo.rateAvailable || !prefetchedRateInfo.rate) {
      throw new RateUnavailableError(prefetchedRateInfo.warningMessage);
    }
  }

  const updated = await db.transaction(async (tx) => {
    const preRows = await tx
      .select({ id: transactions.id, accountId: transactions.accountId })
      .from(transactions)
      .where(eq(transactions.id, params.transactionId))
      .limit(1);
    const pre = preRows[0];
    if (!pre) {
      throw new Error('Transaction not found.');
    }

    const targetAccountId = params.accountId ?? pre.accountId;
    const lockIds =
      targetAccountId === pre.accountId
        ? [pre.accountId]
        : [pre.accountId, targetAccountId].sort((a, b) => a - b);

    const lockedAccounts = new Map<number, typeof accounts.$inferSelect>();
    for (const lockId of lockIds) {
      const accRows = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, lockId))
        .for('update')
        .limit(1);
      if (accRows[0]) lockedAccounts.set(lockId, accRows[0]);
    }

    const existingRows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, params.transactionId))
      .for('update')
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      throw new Error('Transaction not found.');
    }
    if (existing.status === 'REVERSED') {
      throw new Error('Reversed transactions cannot be edited.');
    }
    if (existing.reversalOfId) {
      throw new Error('Reversal entries cannot be edited directly.');
    }

    const newDate = params.date ?? existing.date;
    const origClosing = await tx
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, existing.date))
      .limit(1);
    assertDayNotClosed(origClosing[0]?.status, existing.date);

    if (newDate !== existing.date) {
      const targetClosing = await tx
        .select()
        .from(dailyClosings)
        .where(eq(dailyClosings.date, newDate))
        .limit(1);
      assertDayNotClosed(targetClosing[0]?.status, newDate);
    }

    const targetAccount = lockedAccounts.get(targetAccountId);
    if (!targetAccount) {
      throw new Error('Target account not found.');
    }

    let exchangeRate = existing.exchangeRate;
    let rateDate = existing.rateDate;
    let rateSource = existing.rateSource;

    if (params.recalculateRate) {
      const rateInfo =
        prefetchedRateInfo && prefetchedRateDate === newDate
          ? prefetchedRateInfo
          : await getEffectiveRateForDate(newDate, {
              userId: params.adminUserId,
            });
      if (!rateInfo.rateAvailable || !rateInfo.rate) {
        throw new RateUnavailableError(rateInfo.warningMessage);
      }
      exchangeRate = rateInfo.rate;
      rateDate = rateInfo.rateDate;
      rateSource = rateInfo.source;
    }

    const nextOriginalAmount = params.originalAmount ?? existing.originalAmount;
    const nextOriginalCurrency =
      (params.originalCurrency as CurrencyCode) ??
      (existing.originalCurrency as CurrencyCode);

    const converted = convertTransactionAmounts({
      originalAmount: nextOriginalAmount,
      originalCurrency: nextOriginalCurrency,
      exchangeRate,
      baseCurrency: (targetAccount.baseCurrency as CurrencyCode) || 'AED',
    });

    await tx
      .update(transactions)
      .set({
        accountId: targetAccountId,
        type: params.type ?? existing.type,
        amount: converted.amountInBase,
        originalAmount: converted.originalAmount,
        originalCurrency: converted.originalCurrency,
        exchangeRate: converted.exchangeRate,
        convertedAmountInr: converted.convertedAmountInr,
        rateDate,
        rateSource,
        date: newDate,
        description: (params.description ?? existing.description).trim(),
        editReason: params.reason.trim(),
      })
      .where(eq(transactions.id, existing.id));

    await recalculateAccountBalances(tx, existing.accountId);
    if (targetAccountId !== existing.accountId) {
      await recalculateAccountBalances(tx, targetAccountId);
    }

    const updatedRows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, existing.id))
      .limit(1);

    await logActivity(
      {
        userId: params.adminUserId,
        action: 'EDIT_TRANSACTION',
        entity: 'Transaction',
        entityId: existing.id,
        beforeSnapshot: existing,
        afterSnapshot: updatedRows[0],
        reason: params.reason.trim(),
      },
      tx
    );

    return updatedRows[0];
  });

  broadcastRealtimeEvent('ledger:updated', { entityId: updated.id });
  broadcastRealtimeEvent('accounts:updated', { entityId: updated.accountId });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return updated;
}

export async function reverseLedgerTransaction(params: {
  transactionId: number;
  adminUserId: number;
  reason: string;
  reversalDate?: string;
}) {
  if (!params.reason || !params.reason.trim()) {
    throw new Error('A reason is required to reverse a transaction.');
  }

  const result = await db.transaction(async (tx) => {
    const preRows = await tx
      .select({ id: transactions.id, accountId: transactions.accountId })
      .from(transactions)
      .where(eq(transactions.id, params.transactionId))
      .limit(1);
    const pre = preRows[0];
    if (!pre) {
      throw new Error('Transaction not found.');
    }

    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, pre.accountId))
      .for('update')
      .limit(1);

    const existingRows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, params.transactionId))
      .for('update')
      .limit(1);
    const orig = existingRows[0];
    if (!orig) {
      throw new Error('Transaction not found.');
    }
    if (orig.status === 'REVERSED') {
      throw new Error('Transaction is already reversed.');
    }
    if (orig.reversalOfId) {
      throw new Error('Cannot reverse a reversal entry.');
    }

    const targetDate = params.reversalDate || getDubaiDateString();
    const closingRows = await tx
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, targetDate))
      .limit(1);
    assertDayNotClosed(closingRows[0]?.status, targetDate);

    await tx
      .update(transactions)
      .set({
        status: 'REVERSED',
        editReason: params.reason.trim(),
      })
      .where(eq(transactions.id, orig.id));

    const oppositeType: TransactionType = orig.type === 'CREDIT' ? 'DEBIT' : 'CREDIT';
    const insertedReversal = await tx
      .insert(transactions)
      .values({
        accountId: orig.accountId,
        type: oppositeType,
        amount: orig.amount,
        originalAmount: orig.originalAmount,
        originalCurrency: orig.originalCurrency,
        exchangeRate: orig.exchangeRate,
        convertedAmountInr: orig.convertedAmountInr,
        rateDate: orig.rateDate,
        rateSource: orig.rateSource,
        date: targetDate,
        description: `REVERSAL of #${orig.id}: ${orig.description} (${params.reason.trim()})`,
        createdById: params.adminUserId,
        status: 'ACTIVE',
        reversalOfId: orig.id,
        editReason: params.reason.trim(),
        runningBalance: '0.00',
      })
      .returning();

    await recalculateAccountBalances(tx, orig.accountId);

    const finalReversal = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, insertedReversal[0].id))
      .limit(1);
    const updatedOrig = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, orig.id))
      .limit(1);

    await logActivity(
      {
        userId: params.adminUserId,
        action: 'REVERSE_TRANSACTION',
        entity: 'Transaction',
        entityId: orig.id,
        beforeSnapshot: orig,
        afterSnapshot: {
          original: updatedOrig[0],
          reversalEntry: finalReversal[0],
        },
        reason: params.reason.trim(),
      },
      tx
    );

    return {
      original: updatedOrig[0],
      reversal: finalReversal[0],
    };
  });

  broadcastRealtimeEvent('ledger:updated', { entityId: result.reversal.id });
  broadcastRealtimeEvent('accounts:updated', { entityId: result.original.accountId });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return result;
}

export async function getDailySummaryForDate(dateStr: string) {
  const dayTxs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.date, dateStr))
    .orderBy(asc(transactions.id));

  let totalAdditions = new Decimal(0);
  let totalDeductions = new Decimal(0);
  let totalAdditionsInr = new Decimal(0);
  let totalDeductionsInr = new Decimal(0);

  for (const t of dayTxs) {
    const amt = new Decimal(t.amount);
    const inr = new Decimal(t.convertedAmountInr);
    if (t.type === 'CREDIT') {
      totalAdditions = totalAdditions.plus(amt);
      totalAdditionsInr = totalAdditionsInr.plus(inr);
    } else {
      totalDeductions = totalDeductions.plus(amt);
      totalDeductionsInr = totalDeductionsInr.plus(inr);
    }
  }

  const [allAccounts, allTxsUpToDate] = await Promise.all([
    db.select({ openingBalance: accounts.openingBalance }).from(accounts),
    db
      .select({ type: transactions.type, amount: transactions.amount })
      .from(transactions)
      .where(lte(transactions.date, dateStr)),
  ]);

  let cumulativeBalanceAed = new Decimal(0);
  for (const acc of allAccounts) {
    cumulativeBalanceAed = cumulativeBalanceAed.plus(acc.openingBalance);
  }
  for (const t of allTxsUpToDate) {
    if (t.type === 'CREDIT') {
      cumulativeBalanceAed = cumulativeBalanceAed.plus(t.amount);
    } else {
      cumulativeBalanceAed = cumulativeBalanceAed.minus(t.amount);
    }
  }

  const rateInfo = await getEffectiveRateForDate(dateStr);
  const closingBalanceAedStr = round2(cumulativeBalanceAed);
  const closingBalanceInrStr =
    rateInfo.rateAvailable && rateInfo.rate
      ? round2(cumulativeBalanceAed.mul(new Decimal(rateInfo.rate)))
      : null;

  const existingClosing = await db
    .select()
    .from(dailyClosings)
    .where(eq(dailyClosings.date, dateStr))
    .limit(1);

  return {
    date: dateStr,
    entryCount: dayTxs.length,
    totalAdditions: round2(totalAdditions),
    totalDeductions: round2(totalDeductions),
    netChange: round2(totalAdditions.minus(totalDeductions)),
    closingBalance:
      existingClosing[0]?.status === 'CLOSED'
        ? existingClosing[0].closingBalance
        : closingBalanceAedStr,
    totalAdditionsInr:
      existingClosing[0]?.status === 'CLOSED'
        ? existingClosing[0].totalAdditionsInr
        : round2(totalAdditionsInr),
    totalDeductionsInr:
      existingClosing[0]?.status === 'CLOSED'
        ? existingClosing[0].totalDeductionsInr
        : round2(totalDeductionsInr),
    closingBalanceInr:
      existingClosing[0]?.status === 'CLOSED'
        ? existingClosing[0].closingBalanceInr
        : closingBalanceInrStr,
    appliedRate:
      existingClosing[0]?.status === 'CLOSED'
        ? existingClosing[0].appliedRate
        : rateInfo.rate
          ? round6(rateInfo.rate)
          : null,
    rateAvailable:
      existingClosing[0]?.status === 'CLOSED' ? true : rateInfo.rateAvailable,
    rateDate: rateInfo.rateDate,
    rateSource: rateInfo.source,
    status: (existingClosing[0]?.status as 'OPEN' | 'CLOSED') || 'OPEN',
    closedAt: existingClosing[0]?.closedAt ?? null,
    closedById: existingClosing[0]?.closedById ?? null,
    reopenReason: existingClosing[0]?.reopenReason ?? null,
    entries: dayTxs,
  };
}

export async function closeDailyLedger(params: { date: string; adminUserId: number }) {
  const summary = await getDailySummaryForDate(params.date);
  if (summary.status === 'CLOSED') {
    throw new ClosedDayError(params.date);
  }
  if (!summary.appliedRate || summary.closingBalanceInr === null) {
    throw new RateUnavailableError(
      'Cannot finalize daily closing without a verified AED->INR exchange rate.'
    );
  }
  const closingBalanceInr = summary.closingBalanceInr;
  const appliedRate = summary.appliedRate;

  const saved = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, params.date))
      .for('update')
      .limit(1);

    if (existing[0]?.status === 'CLOSED') {
      throw new ClosedDayError(params.date);
    }

    const values = {
      date: params.date,
      totalAdditions: summary.totalAdditions,
      totalDeductions: summary.totalDeductions,
      closingBalance: summary.closingBalance,
      totalAdditionsInr: summary.totalAdditionsInr,
      totalDeductionsInr: summary.totalDeductionsInr,
      closingBalanceInr,
      appliedRate,
      status: 'CLOSED',
      closedById: params.adminUserId,
      closedAt: new Date(),
    };

    let row;
    if (existing[0]) {
      const updated = await tx
        .update(dailyClosings)
        .set(values)
        .where(eq(dailyClosings.id, existing[0].id))
        .returning();
      row = updated[0];
    } else {
      const inserted = await tx.insert(dailyClosings).values(values).returning();
      row = inserted[0];
    }

    await logActivity(
      {
        userId: params.adminUserId,
        action: 'CLOSE_DAY',
        entity: 'DailyClosing',
        entityId: params.date,
        beforeSnapshot: existing[0] ?? null,
        afterSnapshot: row,
        reason: `Daily closing finalized and locked for ${params.date}`,
      },
      tx
    );

    return row;
  });

  broadcastRealtimeEvent('closing:updated', { entityId: params.date });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return saved;
}

export async function reopenDailyLedger(params: {
  date: string;
  adminUserId: number;
  reason: string;
}) {
  if (!params.reason || !params.reason.trim()) {
    throw new Error('A reason is required to reopen a closed day.');
  }

  const reopenedRow = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(dailyClosings)
      .where(eq(dailyClosings.date, params.date))
      .for('update')
      .limit(1);

    if (!existing[0] || existing[0].status !== 'CLOSED') {
      throw new Error(`Date ${params.date} is not currently closed.`);
    }

    const updated = await tx
      .update(dailyClosings)
      .set({
        status: 'OPEN',
        reopenReason: params.reason.trim(),
      })
      .where(eq(dailyClosings.id, existing[0].id))
      .returning();

    await logActivity(
      {
        userId: params.adminUserId,
        action: 'REOPEN_DAY',
        entity: 'DailyClosing',
        entityId: params.date,
        beforeSnapshot: existing[0],
        afterSnapshot: updated[0],
        reason: params.reason.trim(),
      },
      tx
    );

    return updated[0];
  });

  broadcastRealtimeEvent('closing:updated', { entityId: params.date });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return reopenedRow;
}

export async function recalculateAllAccountBalances(adminUserId: number) {
  const allAccs = await db.select().from(accounts).orderBy(asc(accounts.id));
  const results: Array<{
    accountId: number;
    name: string;
    previousBalance: string;
    recalculatedBalance: string;
    changed: boolean;
  }> = [];

  await db.transaction(async (tx) => {
    for (const acc of allAccs) {
      const recalc = await recalculateAccountBalances(tx, acc.id);
      results.push({
        accountId: acc.id,
        name: acc.name,
        previousBalance: acc.currentBalance,
        recalculatedBalance: recalc,
        changed: acc.currentBalance !== recalc,
      });
    }

    await logActivity(
      {
        userId: adminUserId,
        action: 'RECALCULATE_BALANCES',
        entity: 'System',
        entityId: 'all-accounts',
        afterSnapshot: {
          accountsChecked: results.length,
          discrepanciesFixed: results.filter((r) => r.changed).length,
        },
        reason: 'Admin ran system-wide balance consistency check & recalculation',
      },
      tx
    );
  });

  broadcastRealtimeEvent('accounts:updated', { entityId: 'all' });
  broadcastRealtimeEvent('ledger:updated', { entityId: 'all' });
  broadcastRealtimeEvent('activity:updated', { adminOnly: true });

  return results;
}
