import { useCallback, useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import {
  formatAED,
  formatINR,
  getDubaiDateString,
  convertTransactionAmounts,
} from '../../lib/money.ts';

interface NewEntryPageProps {
  onSuccess?: () => void;
}

export function NewEntryPage({ onSuccess }: NewEntryPageProps) {
  const { apiFetch, notify, settings } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [currency, setCurrency] = useState<'AED' | 'INR'>(
    settings?.defaultCurrency || 'AED'
  );
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getDubaiDateString());
  const [description, setDescription] = useState('');

  const hasUserSelectedCurrencyRef = useRef(false);

  useEffect(() => {
    if (settings?.defaultCurrency && !hasUserSelectedCurrencyRef.current && amount === '') {
      setCurrency(settings.defaultCurrency);
    }
  }, [settings?.defaultCurrency, amount]);

  const [dateRateInfo, setDateRateInfo] = useState<any>(null);
  const [dayStatus, setDayStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAccounts = useCallback(() => {
    apiFetch('/api/accounts?status=ACTIVE')
      .then((res) => {
        const list = res.accounts || [];
        setAccounts(list);
        if (list.length) {
          setAccountId((prev) => prev || String(list[0].id));
        }
      })
      .catch((err) => notify('error', err.message || 'Failed to load accounts'));
  }, [apiFetch, notify]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const refreshDateContext = useCallback(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    Promise.all([
      apiFetch(`/api/rates/current?date=${encodeURIComponent(date)}`),
      apiFetch(`/api/daily-ledger?date=${encodeURIComponent(date)}`),
    ])
      .then(([rateRes, ledgerRes]) => {
        setDateRateInfo(rateRes.rateInfo);
        setDayStatus(ledgerRes.summary?.status === 'CLOSED' ? 'CLOSED' : 'OPEN');
      })
      .catch(() => {
        setDateRateInfo({ rateAvailable: false, rate: null });
        setDayStatus('OPEN');
      });
  }, [date, apiFetch]);

  useEffect(() => {
    refreshDateContext();
  }, [refreshDateContext]);

  useRealtimeRefresh(['accounts:updated', 'rates:updated', 'closing:updated'], () => {
    loadAccounts();
    refreshDateContext();
  });

  const selectedAccount = accounts.find((a) => String(a.id) === accountId);

  // Live conversion preview using Decimal
  let preview: { aed: string; inr: string; nextBalanceAed: string } | null = null;
  if (amount && Number(amount) > 0 && dateRateInfo?.rate) {
    try {
      const conv = convertTransactionAmounts({
        originalAmount: amount,
        originalCurrency: currency,
        exchangeRate: dateRateInfo.rate,
        baseCurrency: 'AED',
      });
      const currentBal = new Decimal(selectedAccount?.currentBalance || 0);
      const nextBal =
        type === 'CREDIT'
          ? currentBal.plus(conv.amountInBase)
          : currentBal.minus(conv.amountInBase);
      preview = {
        aed: conv.amountInBase,
        inr: conv.convertedAmountInr,
        nextBalanceAed: nextBal.toFixed(2),
      };
    } catch {
      preview = null;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!accountId) {
      setError('Please select an account.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (description.trim().length < 3) {
      setError('Please enter a descriptive narration (minimum 3 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: Number(accountId),
          type,
          originalAmount: amount,
          originalCurrency: currency,
          date,
          description: description.trim(),
        }),
      });
      notify(
        'success',
        `Posted ${type} #${res.transaction.id} (${formatAED(res.transaction.amount)} / ${formatINR(res.transaction.convertedAmountInr)})`
      );
      if (res.rateWarning) {
        notify('info', res.rateWarning);
      }
      setAmount('');
      setDescription('');
      // Refresh accounts to update projected currentBalance
      const accRes = await apiFetch('/api/accounts?status=ACTIVE');
      setAccounts(accRes.accounts || []);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to record entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Add New Ledger Entry</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Log a Credit or Debit entry. Running balance and INR conversion are computed automatically at the effective date rate.
        </p>
      </div>

      {dayStatus === 'CLOSED' && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <Lock className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Date {date} is Closed & Locked</div>
            <p className="text-xs text-red-700 mt-0.5">
              Daily closing has been finalized for this date. Staff cannot add entries to closed dates; an Admin must explicitly reopen the day first.
            </p>
          </div>
        </div>
      )}

      {dateRateInfo?.fallbackWarning && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
          <div>{dateRateInfo.warningMessage}</div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Account *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {accounts.length === 0 ? (
                <option value="">No active accounts available</option>
              ) : (
                accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountNumber} — {acc.name} ({formatAED(acc.currentBalance)})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Transaction Date (Asia/Dubai GST) *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Entry Type *
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setType('CREDIT')}
                className={`py-2 text-xs font-semibold rounded transition-colors ${
                  type === 'CREDIT'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                CREDIT (+)
              </button>
              <button
                type="button"
                onClick={() => setType('DEBIT')}
                className={`py-2 text-xs font-semibold rounded transition-colors ${
                  type === 'DEBIT'
                    ? 'bg-red-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                DEBIT (-)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Entry Currency *
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => {
                  hasUserSelectedCurrencyRef.current = true;
                  setCurrency('AED');
                }}
                className={`py-2 text-xs font-semibold rounded transition-colors ${
                  currency === 'AED'
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AED (Default)
              </button>
              <button
                type="button"
                onClick={() => {
                  hasUserSelectedCurrencyRef.current = true;
                  setCurrency('INR');
                }}
                className={`py-2 text-xs font-semibold rounded transition-colors ${
                  currency === 'INR'
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                INR (₹)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Amount ({currency}) *
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        </div>

        {/* Live Conversion & Balance Preview */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-700">
              Live Conversion & Running Balance Preview
            </span>
            {dateRateInfo?.rateAvailable && dateRateInfo.rate ? (
              <span className="text-xs font-mono tabular-nums text-slate-600">
                Rate: 1 AED = ₹{Number(dateRateInfo.rate).toFixed(4)} on {dateRateInfo.rateDate} ({dateRateInfo.source})
              </span>
            ) : (
              <span className="text-xs font-mono text-red-700">
                Rate unavailable for {date}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <div className="text-[11px] text-slate-500">Ledger Base Amount (AED)</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                {preview ? formatAED(preview.aed) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">INR Equivalent Stored</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                {preview ? formatINR(preview.inr) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Projected Account Balance</div>
              <div
                className={`text-sm font-semibold font-mono tabular-nums ${
                  preview
                    ? Number(preview.nextBalanceAed) >= 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                    : 'text-slate-900'
                }`}
              >
                {preview ? formatAED(preview.nextBalanceAed) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Description / Narration *
          </label>
          <textarea
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Wire settlement received for Export Invoice #INV-2704"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        {error && (
          <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={
              submitting ||
              dayStatus === 'CLOSED' ||
              accounts.length === 0 ||
              !dateRateInfo?.rateAvailable
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Saving Entry...' : 'Post Ledger Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
