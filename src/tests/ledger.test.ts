import { describe, expect, it } from 'vitest';
import {
  ClosedDayError,
  applyMarkupToRate,
  assertDayNotClosed,
  computeRunningBalances,
  convertTransactionAmounts,
  formatAED,
  formatINR,
} from '../lib/money.ts';
import { resolveRateWithFallback } from '../server/exchangeRates.ts';
import {
  OFFICIAL_SUPPORT_EMAIL,
  SUPPORT_SERVICES,
  buildSupportMailtoUrl,
} from '../lib/supportCatalog.ts';

describe('WebX Bookkeeping Core Engine', () => {
  it('computes running and final balances accurately without floating-point drift', () => {
    const result = computeRunningBalances('1000.00', [
      { id: 2, type: 'DEBIT', amount: '250.20', date: '2026-11-21', status: 'ACTIVE' },
      { id: 1, type: 'CREDIT', amount: '0.10', date: '2026-11-20', status: 'ACTIVE' },
      { id: 3, type: 'CREDIT', amount: '0.20', date: '2026-11-21', status: 'ACTIVE' },
    ]);

    // Chronological order: id=1 (11-20) -> 1000.10, id=2 (11-21) -> 749.90, id=3 (11-21) -> 750.10
    expect(result.entries).toEqual([
      { id: 1, runningBalance: '1000.10' },
      { id: 2, runningBalance: '749.90' },
      { id: 3, runningBalance: '750.10' },
    ]);
    expect(result.finalBalance).toBe('750.10');
  });

  it('converts AED to INR and INR to AED with deterministic ROUND_HALF_UP precision', () => {
    const aedToInr = convertTransactionAmounts({
      originalAmount: '1250.55',
      originalCurrency: 'AED',
      exchangeRate: '22.945000',
      baseCurrency: 'AED',
    });
    // 1250.55 * 22.945 = 28693.86975 -> 28693.87
    expect(aedToInr.amountInBase).toBe('1250.55');
    expect(aedToInr.convertedAmountInr).toBe('28693.87');

    const inrToAed = convertTransactionAmounts({
      originalAmount: '100000.00',
      originalCurrency: 'INR',
      exchangeRate: '22.950000',
      baseCurrency: 'AED',
    });
    // 100000 / 22.95 = 4357.2984749... -> 4357.30
    expect(inrToAed.convertedAmountInr).toBe('100000.00');
    expect(inrToAed.amountInBase).toBe('4357.30');
  });

  it('applies rate markup cleanly to base AED-INR rate', () => {
    expect(applyMarkupToRate('22.900000', '0')).toBe('22.900000');
    expect(applyMarkupToRate('22.000000', '1.5')).toBe('22.330000');
  });

  it('reverses a transaction at its exact original stored rate so AED and INR offset to zero', () => {
    const originalRate = '22.850000';
    const original = convertTransactionAmounts({
      originalAmount: '5000.00',
      originalCurrency: 'AED',
      exchangeRate: originalRate,
      baseCurrency: 'AED',
    });

    // Even if today's rate moved to 23.400000, reversal uses original.exchangeRate & convertedAmountInr
    const reversal = {
      id: 2,
      type: 'DEBIT' as const,
      amount: original.amountInBase,
      convertedAmountInr: original.convertedAmountInr,
      exchangeRate: original.exchangeRate,
      date: '2026-11-23',
      status: 'ACTIVE',
    };

    const balances = computeRunningBalances('10000.00', [
      {
        id: 1,
        type: 'CREDIT',
        amount: original.amountInBase,
        date: '2026-11-20',
        status: 'REVERSED',
      },
      reversal,
    ]);

    expect(balances.finalBalance).toBe('10000.00');
    expect(reversal.convertedAmountInr).toBe(original.convertedAmountInr);
    expect(reversal.exchangeRate).toBe(originalRate);
  });

  it('prioritizes manual override over API rate and falls back safely when API fails', async () => {
    const stored = [
      { rate: '22.880000', effectiveDate: '2026-11-22', source: 'API' },
      { rate: '23.050000', effectiveDate: '2026-11-23', source: 'MANUAL' },
      { rate: '22.910000', effectiveDate: '2026-11-23', source: 'API' },
    ];

    // Manual override on 2026-11-23 beats API on same date
    const manualWin = await resolveRateWithFallback({
      dateStr: '2026-11-23',
      todayStr: '2026-11-23',
      storedRates: stored,
      mode: 'AUTO',
      markupPercent: '0',
      fetchLiveRate: async () => '22.950000',
    });
    expect(manualWin.source).toBe('MANUAL');
    expect(manualWin.rate).toBe('23.050000');
    expect(manualWin.fallbackWarning).toBe(false);

    // API failure for today when no rate exists for today -> falls back to 2026-11-22 with warning
    const fallbackResult = await resolveRateWithFallback({
      dateStr: '2026-11-24',
      todayStr: '2026-11-24',
      storedRates: [
        { rate: '22.880000', effectiveDate: '2026-11-22', source: 'API' },
      ],
      mode: 'AUTO',
      markupPercent: '0',
      fetchLiveRate: async () => {
        throw new Error('Network timeout');
      },
    });
    expect(fallbackResult.source).toBe('FALLBACK');
    expect(fallbackResult.fallbackWarning).toBe(true);
    expect(fallbackResult.rate).toBe('22.880000');
    expect(fallbackResult.rateDate).toBe('2026-11-22');
  });

  it('returns rateAvailable=false (null rate) with zero hardcoded fallback when DB is empty and API fails', async () => {
    const unavailable = await resolveRateWithFallback({
      dateStr: '2026-11-24',
      todayStr: '2026-11-24',
      storedRates: [],
      mode: 'AUTO',
      markupPercent: '0',
      fetchLiveRate: async () => {
        throw new Error('Upstream unavailable');
      },
    });
    expect(unavailable.rateAvailable).toBe(false);
    expect(unavailable.rate).toBeNull();
    expect(unavailable.baseRate).toBeNull();
    expect(unavailable.fallbackWarning).toBe(true);
  });

  it('fetches live API rate when forceRefresh is true even if mode is MANUAL', async () => {
    const manualModeRefresh = await resolveRateWithFallback({
      dateStr: '2026-11-24',
      todayStr: '2026-11-24',
      storedRates: [],
      mode: 'MANUAL',
      markupPercent: '0',
      forceRefresh: true,
      fetchLiveRate: async () => '22.971000',
    });
    expect(manualModeRefresh.rateAvailable).toBe(true);
    expect(manualModeRefresh.source).toBe('API');
    expect(manualModeRefresh.rate).toBe('22.971000');
  });

  it('blocks entries or edits on a CLOSED daily closing date', () => {
    expect(() => assertDayNotClosed('OPEN', '2026-11-23')).not.toThrow();
    expect(() => assertDayNotClosed('CLOSED', '2026-11-21')).toThrow(ClosedDayError);
  });

  it('formats AED with standard grouping and INR with Indian digit grouping', () => {
    expect(formatAED('123456.78')).toBe('AED 123,456.78');
    expect(formatINR('123456.00')).toBe('₹1,23,456.00');
  });

  it('provides all 6 support services routed to adwebcomicllp@gmail.com', () => {
    expect(OFFICIAL_SUPPORT_EMAIL).toBe('adwebcomicllp@gmail.com');
    expect(SUPPORT_SERVICES.map((s) => s.id)).toEqual([
      'CUSTOMER_SUPPORT',
      'TECHNICAL_SUPPORT',
      'STAFF_ONBOARDING',
      'ACCOUNT_SUPPORT',
      'ADMIN_SUPPORT',
      'BILLING_PAYMENT',
    ]);
    const mailto = buildSupportMailtoUrl({
      category: 'BILLING_PAYMENT',
      ticketNumber: 'WEBX-SUP-20261123-1001',
      subject: 'Invoice clarification',
      requesterName: 'Test User',
      requesterEmail: 'user@company.ae',
    });
    expect(mailto.startsWith('mailto:adwebcomicllp@gmail.com?')).toBe(true);
    expect(mailto).toContain('WEBX-SUP-20261123-1001');
  });

  it('applies negative rate markup and preserves nearest prior rate without calling live API in MANUAL mode', async () => {
    expect(applyMarkupToRate('25.000000', '-2')).toBe('24.500000');

    let fetched = false;
    const res = await resolveRateWithFallback({
      dateStr: '2026-11-25',
      todayStr: '2026-11-25',
      storedRates: [
        { rate: '23.100000', effectiveDate: '2026-11-20', source: 'MANUAL' },
        { rate: '22.900000', effectiveDate: '2026-11-22', source: 'API' },
      ],
      mode: 'MANUAL',
      markupPercent: '0',
      fetchLiveRate: async () => {
        fetched = true;
        return '23.500000';
      },
    });
    expect(fetched).toBe(false);
    expect(res.rateAvailable).toBe(true);
    expect(res.rate).toBe('22.900000');
    expect(res.rateDate).toBe('2026-11-22');
    expect(res.fallbackWarning).toBe(true);
  });

  it('handles negative balance running calculations cleanly without drift', () => {
    const result = computeRunningBalances('50.00', [
      { id: 10, type: 'DEBIT', amount: '75.25', date: '2026-11-21', status: 'ACTIVE' },
      { id: 11, type: 'CREDIT', amount: '10.05', date: '2026-11-22', status: 'ACTIVE' },
    ]);
    expect(result.entries).toEqual([
      { id: 10, runningBalance: '-25.25' },
      { id: 11, runningBalance: '-15.20' },
    ]);
    expect(result.finalBalance).toBe('-15.20');
  });

  it('orders same-date concurrent entries deterministically by ascending id and rejects zero/invalid amounts', () => {
    const ordered = computeRunningBalances('0.00', [
      { id: 9, type: 'DEBIT', amount: '40.00', date: '2026-11-24', status: 'ACTIVE' },
      { id: 7, type: 'CREDIT', amount: '100.00', date: '2026-11-24', status: 'ACTIVE' },
      { id: 8, type: 'CREDIT', amount: '25.50', date: '2026-11-24', status: 'ACTIVE' },
    ]);
    expect(ordered.entries).toEqual([
      { id: 7, runningBalance: '100.00' },
      { id: 8, runningBalance: '125.50' },
      { id: 9, runningBalance: '85.50' },
    ]);
    expect(ordered.finalBalance).toBe('85.50');

    expect(() =>
      convertTransactionAmounts({
        originalAmount: '0',
        originalCurrency: 'AED',
        exchangeRate: '22.950000',
      })
    ).toThrow();
  });
});
