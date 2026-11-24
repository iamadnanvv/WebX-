import Decimal from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type CurrencyCode = 'AED' | 'INR';
export type TransactionType = 'CREDIT' | 'DEBIT';

export class ClosedDayError extends Error {
  statusCode = 409;
  constructor(date: string) {
    super(
      `Date ${date} is closed and locked. An Admin must reopen the day before modifying or adding entries.`
    );
    this.name = 'ClosedDayError';
  }
}

export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function round2(value: string | number | Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function round6(value: string | number | Decimal): string {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

export interface ConversionInput {
  originalAmount: string | number;
  originalCurrency: CurrencyCode;
  exchangeRate: string | number; // 1 AED = X INR
  baseCurrency?: CurrencyCode;
}

export interface ConversionResult {
  amountInBase: string;
  originalAmount: string;
  originalCurrency: CurrencyCode;
  exchangeRate: string;
  convertedAmountInr: string;
}

/**
 * Deterministic decimal conversion between AED and INR using ROUND_HALF_UP to 2 decimals.
 * Never uses IEEE-754 floating-point arithmetic.
 */
export function convertTransactionAmounts(input: ConversionInput): ConversionResult {
  const origAmt = new Decimal(input.originalAmount);
  const rate = new Decimal(input.exchangeRate);
  const baseCurrency = input.baseCurrency ?? 'AED';

  if (origAmt.lte(0)) {
    throw new Error('Transaction amount must be greater than zero.');
  }
  if (rate.lte(0)) {
    throw new Error('Exchange rate must be greater than zero.');
  }

  let amountInAed: Decimal;
  let convertedInr: Decimal;

  if (input.originalCurrency === 'AED') {
    amountInAed = origAmt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    convertedInr = amountInAed.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    // Entry in INR -> convert to AED using 1 AED = rate INR
    convertedInr = origAmt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    amountInAed = convertedInr.div(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  const amountInBase = baseCurrency === 'INR' ? convertedInr : amountInAed;

  return {
    amountInBase: amountInBase.toFixed(2),
    originalAmount: origAmt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    originalCurrency: input.originalCurrency,
    exchangeRate: rate.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6),
    convertedAmountInr: convertedInr.toFixed(2),
  };
}

export interface LedgerEntryLike {
  id: number;
  type: string;
  amount: string;
  date: string;
  status: string;
}

export interface ComputedBalanceResult {
  finalBalance: string;
  entries: Array<{ id: number; runningBalance: string }>;
}

/**
 * Computes running balances chronologically (date ASC, id ASC) for an account.
 * Credits increase balance; Debits decrease balance.
 * Reversed transactions keep their original entry in the ledger and are offset by their linked reversal entry.
 */
export function computeRunningBalances(
  openingBalance: string | number,
  orderedEntries: LedgerEntryLike[]
): ComputedBalanceResult {
  const sorted = [...orderedEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id - b.id;
  });

  let running = new Decimal(openingBalance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const entries: Array<{ id: number; runningBalance: string }> = [];

  for (const entry of sorted) {
    const amt = new Decimal(entry.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (entry.type === 'CREDIT') {
      running = running.plus(amt);
    } else if (entry.type === 'DEBIT') {
      running = running.minus(amt);
    } else {
      throw new Error(`Unsupported transaction type: ${entry.type}`);
    }
    running = running.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    entries.push({
      id: entry.id,
      runningBalance: running.toFixed(2),
    });
  }

  return {
    finalBalance: running.toFixed(2),
    entries,
  };
}

export function assertDayNotClosed(closingStatus?: string | null, date?: string): void {
  if (closingStatus === 'CLOSED') {
    throw new ClosedDayError(date ?? 'selected date');
  }
}

export function formatAED(value: string | number | Decimal): string {
  const dec = new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const isNeg = dec.isNegative();
  const abs = dec.abs().toNumber();
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return isNeg ? `-AED ${formatted}` : `AED ${formatted}`;
}

export function formatINR(value: string | number | Decimal): string {
  const dec = new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const isNeg = dec.isNegative();
  const abs = dec.abs().toNumber();
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return isNeg ? `-₹${formatted}` : `₹${formatted}`;
}

export function resolveSafeTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim() || 'Asia/Dubai';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return 'Asia/Dubai';
  }
}

export function getDubaiDateString(
  date: Date = new Date(),
  timeZone: string = 'Asia/Dubai'
): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveSafeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getDubaiDateDaysAgo(
  days: number,
  timeZone: string = 'Asia/Dubai'
): string {
  const target = new Date(Date.now() - days * 86_400_000);
  return getDubaiDateString(target, timeZone);
}

export function formatDateTimeInZone(
  value: string | Date,
  timeZone: string = 'Asia/Dubai',
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: resolveSafeTimeZone(timeZone),
    ...options,
  });
}

export function applyMarkupToRate(baseRate: string | number, markupPercent: string | number): string {
  const rate = new Decimal(baseRate);
  const markup = new Decimal(markupPercent || 0);
  if (markup.isZero()) {
    return rate.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
  }
  const factor = new Decimal(1).plus(markup.div(100));
  return rate.mul(factor).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}
