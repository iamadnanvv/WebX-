import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { exchangeRates } from '../db/schema.ts';
import { applyMarkupToRate, getDubaiDateString, round6 } from '../lib/money.ts';
import { getSystemSettings } from './settings.ts';
import { logActivity } from './activityLog.ts';
import { broadcastRealtimeEvent } from './realtime.ts';

export class RateUnavailableError extends Error {
  statusCode = 503;
  constructor(message?: string) {
    super(
      message ||
        'Live exchange-rate feed is unavailable and no stored AED->INR rate exists. Retry live fetch or set a manual rate override.'
    );
    this.name = 'RateUnavailableError';
  }
}

export interface StoredRateRecord {
  id?: number;
  rate: string;
  effectiveDate: string;
  source: string;
  createdAt?: Date | string;
}

export interface EffectiveRateResolution {
  rate: string | null; // Markup-adjusted effective rate, or null when unavailable
  baseRate: string | null; // Raw rate before markup
  rateDate: string;
  source: 'API' | 'MANUAL' | 'FALLBACK' | 'UNAVAILABLE';
  rateAvailable: boolean;
  fallbackWarning: boolean;
  warningMessage?: string;
}

export interface ResolveRateParams {
  dateStr: string;
  todayStr: string;
  storedRates: StoredRateRecord[];
  mode: 'AUTO' | 'MANUAL';
  markupPercent: string;
  forceRefresh?: boolean;
  fetchLiveRate?: () => Promise<string | null>;
}

/**
 * Pure deterministic rate resolution engine (unit-testable):
 * 1. Manual override on exact dateStr always wins (unless forceRefresh explicitly asks for live API).
 * 2. In AUTO mode, if forceRefresh or no rate exists for todayStr when requesting todayStr,
 *    attempts live API fetch.
 * 3. If API fails and stored rates exist in PostgreSQL, falls back to latest stored rate with fallbackWarning=true.
 * 4. If both API fails and zero stored rates exist, returns rateAvailable=false (never fabricates a hardcoded rate).
 */
export async function resolveRateWithFallback(
  params: ResolveRateParams
): Promise<EffectiveRateResolution> {
  const {
    dateStr,
    todayStr,
    storedRates,
    mode,
    markupPercent,
    forceRefresh = false,
    fetchLiveRate,
  } = params;

  const eligible = storedRates
    .filter((r) => r.effectiveDate <= dateStr)
    .sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) {
        return b.effectiveDate.localeCompare(a.effectiveDate);
      }
      if (a.source !== b.source) {
        return a.source === 'MANUAL' ? -1 : 1;
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  const exactManual = eligible.find(
    (r) => r.effectiveDate === dateStr && r.source === 'MANUAL'
  );
  if (exactManual && !forceRefresh) {
    const baseRate = round6(exactManual.rate);
    return {
      rate: applyMarkupToRate(baseRate, markupPercent),
      baseRate,
      rateDate: exactManual.effectiveDate,
      source: 'MANUAL',
      rateAvailable: true,
      fallbackWarning: false,
    };
  }

  const exactAny = eligible.find((r) => r.effectiveDate === dateStr);

  const shouldFetchLive =
    forceRefresh ||
    (mode === 'AUTO' &&
      ((dateStr === todayStr && !exactAny) || storedRates.length === 0));

  if (shouldFetchLive && fetchLiveRate) {
    try {
      const liveRate = await fetchLiveRate();
      if (liveRate && Number(liveRate) > 0) {
        const baseRate = round6(liveRate);
        return {
          rate: applyMarkupToRate(baseRate, markupPercent),
          baseRate,
          rateDate: todayStr,
          source: 'API',
          rateAvailable: true,
          fallbackWarning: false,
        };
      }
    } catch {
      // Fall through to stored DB fallback
    }

    const fallbackRecord = eligible[0] ?? storedRates[0];
    if (fallbackRecord) {
      const baseRate = round6(fallbackRecord.rate);
      return {
        rate: applyMarkupToRate(baseRate, markupPercent),
        baseRate,
        rateDate: fallbackRecord.effectiveDate,
        source: 'FALLBACK',
        rateAvailable: true,
        fallbackWarning: true,
        warningMessage: `Live exchange-rate feed unavailable. Using last stored rate from ${fallbackRecord.effectiveDate}.`,
      };
    }

    return {
      rate: null,
      baseRate: null,
      rateDate: dateStr,
      source: 'UNAVAILABLE',
      rateAvailable: false,
      fallbackWarning: true,
      warningMessage:
        'Live exchange-rate feed is unavailable and no stored AED->INR rate exists. Retry API refresh or set a manual rate override.',
    };
  }

  if (exactAny) {
    const baseRate = round6(exactAny.rate);
    return {
      rate: applyMarkupToRate(baseRate, markupPercent),
      baseRate,
      rateDate: exactAny.effectiveDate,
      source: exactAny.source === 'MANUAL' ? 'MANUAL' : 'API',
      rateAvailable: true,
      fallbackWarning: false,
    };
  }

  const nearest = eligible[0] ?? storedRates[0];
  if (nearest) {
    const baseRate = round6(nearest.rate);
    return {
      rate: applyMarkupToRate(baseRate, markupPercent),
      baseRate,
      rateDate: nearest.effectiveDate,
      source: nearest.source === 'MANUAL' ? 'MANUAL' : 'FALLBACK',
      rateAvailable: true,
      fallbackWarning: nearest.effectiveDate !== dateStr,
      warningMessage:
        nearest.effectiveDate !== dateStr
          ? `No rate recorded for ${dateStr}. Using stored rate from ${nearest.effectiveDate}.`
          : undefined,
    };
  }

  // Try live API if AUTO and no stored rates exist at all (e.g., querying a historical date on brand-new DB)
  if (mode === 'AUTO' && fetchLiveRate) {
    try {
      const liveRate = await fetchLiveRate();
      if (liveRate && Number(liveRate) > 0) {
        const baseRate = round6(liveRate);
        return {
          rate: applyMarkupToRate(baseRate, markupPercent),
          baseRate,
          rateDate: todayStr,
          source: 'API',
          rateAvailable: true,
          fallbackWarning: dateStr !== todayStr,
          warningMessage:
            dateStr !== todayStr
              ? `No historical rate recorded for ${dateStr}; using current live API rate (${todayStr}).`
              : undefined,
        };
      }
    } catch {
      // Fall through to unavailable
    }
  }

  return {
    rate: null,
    baseRate: null,
    rateDate: dateStr,
    source: 'UNAVAILABLE',
    rateAvailable: false,
    fallbackWarning: true,
    warningMessage:
      'No stored AED->INR rate found and live feed is unavailable. Please set a manual rate override or refresh the API feed.',
  };
}

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchLiveAedInrRate(): Promise<string | null> {
  const configuredUrl =
    process.env.EXCHANGE_RATE_API_URL?.trim() || 'https://open.er-api.com/v6/latest/AED';
  if (!isAllowedExternalUrl(configuredUrl)) {
    console.warn('Exchange rate API URL blocked by security policy');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.EXCHANGE_RATE_API_KEY?.trim()) {
      headers['Authorization'] = `Bearer ${process.env.EXCHANGE_RATE_API_KEY.trim()}`;
    }

    const resp = await fetch(configuredUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!resp.ok) {
      return null;
    }
    const data = (await resp.json()) as Record<string, any>;
    const inrVal =
      data?.rates?.INR ?? data?.conversion_rates?.INR ?? data?.data?.INR ?? null;
    if (typeof inrVal === 'number' && Number.isFinite(inrVal) && inrVal > 0) {
      return round6(inrVal);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEffectiveRateForDate(
  dateStr?: string,
  options?: { forceRefresh?: boolean; userId?: number | null }
): Promise<EffectiveRateResolution> {
  const sysSettings = await getSystemSettings();
  const todayStr = getDubaiDateString(new Date(), sysSettings.timezone);
  const targetDate = dateStr || todayStr;

  const stored = await db
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.fromCurrency, 'AED'), eq(exchangeRates.toCurrency, 'INR')))
    .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.createdAt));

  let fetchedAndStored = false;

  const resolution = await resolveRateWithFallback({
    dateStr: targetDate,
    todayStr,
    storedRates: stored,
    mode: sysSettings.rateRefreshMode,
    markupPercent: sysSettings.rateMarkup,
    forceRefresh: options?.forceRefresh,
    fetchLiveRate: async () => {
      const live = await fetchLiveAedInrRate();
      if (live) {
        await db.insert(exchangeRates).values({
          fromCurrency: 'AED',
          toCurrency: 'INR',
          rate: live,
          effectiveDate: todayStr,
          source: 'API',
          setById: options?.userId ?? null,
          notes: options?.forceRefresh ? 'Manual API refresh' : 'Automatic daily API fetch',
        });
        fetchedAndStored = true;
      }
      return live;
    },
  });

  if (fetchedAndStored) {
    if (options?.forceRefresh && options?.userId) {
      await logActivity({
        userId: options.userId,
        action: 'REFRESH_EXCHANGE_RATE',
        entity: 'ExchangeRate',
        entityId: todayStr,
        afterSnapshot: { rate: resolution.baseRate, effectiveDate: todayStr, source: 'API' },
        reason: 'Admin triggered live API exchange rate refresh',
      });
    }
    broadcastRealtimeEvent('rates:updated', { entityId: todayStr });
  }

  return resolution;
}

export async function setManualExchangeRate(params: {
  rate: string;
  effectiveDate: string;
  userId: number;
  notes?: string;
}) {
  const cleanRate = round6(params.rate);
  if (Number(cleanRate) <= 0) {
    throw new Error('Exchange rate must be greater than zero.');
  }

  const existing = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.effectiveDate, params.effectiveDate),
        eq(exchangeRates.fromCurrency, 'AED'),
        eq(exchangeRates.toCurrency, 'INR'),
        eq(exchangeRates.source, 'MANUAL')
      )
    )
    .orderBy(desc(exchangeRates.createdAt))
    .limit(1);

  const inserted = await db
    .insert(exchangeRates)
    .values({
      fromCurrency: 'AED',
      toCurrency: 'INR',
      rate: cleanRate,
      effectiveDate: params.effectiveDate,
      source: 'MANUAL',
      setById: params.userId,
      notes: params.notes?.trim() || 'Admin manual rate override',
    })
    .returning();

  await logActivity({
    userId: params.userId,
    action: 'SET_EXCHANGE_RATE',
    entity: 'ExchangeRate',
    entityId: inserted[0].id,
    beforeSnapshot: existing[0] ?? null,
    afterSnapshot: inserted[0],
    reason: params.notes?.trim() || `Manual AED->INR rate override for ${params.effectiveDate}`,
  });

  broadcastRealtimeEvent('rates:updated', { entityId: params.effectiveDate });
  return inserted[0];
}

export async function listExchangeRates(limit = 90) {
  return await db
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.fromCurrency, 'AED'), eq(exchangeRates.toCurrency, 'INR')))
    .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.createdAt))
    .limit(limit);
}

let rateSchedulerStarted = false;

export function startExchangeRateScheduler(): void {
  if (rateSchedulerStarted) return;
  rateSchedulerStarted = true;

  const checkAndRefresh = async () => {
    try {
      const sysSettings = await getSystemSettings();
      if (sysSettings.rateRefreshMode !== 'AUTO') return;

      let resolvedTz = sysSettings.timezone || 'Asia/Dubai';
      try {
        Intl.DateTimeFormat(undefined, { timeZone: resolvedTz });
      } catch {
        resolvedTz = 'Asia/Dubai';
      }
      const todayStr = getDubaiDateString(new Date(), resolvedTz);
      const nowTimeDubai = new Intl.DateTimeFormat('en-GB', {
        timeZone: resolvedTz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());

      if (nowTimeDubai < sysSettings.rateRefreshSchedule) return;

      const existingToday = await db
        .select({ id: exchangeRates.id })
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.effectiveDate, todayStr),
            eq(exchangeRates.fromCurrency, 'AED'),
            eq(exchangeRates.toCurrency, 'INR')
          )
        )
        .limit(1);

      if (existingToday.length === 0) {
        await getEffectiveRateForDate(todayStr);
      }
    } catch (error) {
      console.error('Scheduled exchange rate check error:', error);
    }
  };

  // Run periodic check every 15 minutes (never eager at module import time)
  setInterval(checkAndRefresh, 15 * 60 * 1000);
}
