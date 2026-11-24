import { useCallback, useEffect, useState } from 'react';
import { Calendar, Lock, Unlock } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { getDubaiDateString } from '../../lib/money.ts';

export function DailyLedgerPage() {
  const { apiFetch, notify } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getDubaiDateString());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadLedger = useCallback(async (showSkeleton = true) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;
    if (showSkeleton) setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch(`/api/daily-ledger?date=${encodeURIComponent(selectedDate)}`);
      setData(res);
    } catch (err: any) {
      const msg = err.message || 'Failed to load daily ledger';
      setLoadError(msg);
      if (showSkeleton) notify('error', msg);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [apiFetch, selectedDate, notify]);

  useEffect(() => {
    loadLedger(true);
  }, [loadLedger]);

  useRealtimeRefresh(['ledger:updated', 'closing:updated', 'rates:updated'], () => {
    loadLedger(false);
  });

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Daily Ledger</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Per-day additions, deductions, and cumulative closing balance in Asia/Dubai (GST)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          {summary && (
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border ${
                summary.status === 'CLOSED'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {summary.status === 'CLOSED' ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
              {summary.status}
            </div>
          )}
        </div>
      </div>

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadLedger(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs font-medium text-slate-500 mb-1.5">
                  Daily Additions (Credits)
                </div>
                <CurrencyDualDisplay
                  aedAmount={summary.totalAdditions}
                  inrAmount={summary.totalAdditionsInr}
                  tone="credit"
                  size="lg"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs font-medium text-slate-500 mb-1.5">
                  Daily Deductions (Debits)
                </div>
                <CurrencyDualDisplay
                  aedAmount={summary.totalDeductions}
                  inrAmount={summary.totalDeductionsInr}
                  tone="debit"
                  size="lg"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs font-medium text-slate-500 mb-1.5">
                  Day Closing Balance
                </div>
                <CurrencyDualDisplay
                  aedAmount={summary.closingBalance}
                  inrAmount={summary.closingBalanceInr}
                  rate={summary.appliedRate}
                  rateDate={summary.date}
                  showRateLabel
                  size="lg"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs font-medium text-slate-500 mb-1.5">Day Summary</div>
                <div className="text-xl font-semibold font-mono tabular-nums text-slate-900">
                  {summary.entryCount} entries
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {summary.appliedRate
                    ? `Rate: 1 AED = ₹${Number(summary.appliedRate).toFixed(4)}`
                    : 'Rate unavailable'}
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Entries for {summary.date}
                </h2>
                <span className="text-xs text-slate-500">
                  {summary.status === 'CLOSED'
                    ? `Locked by ${summary.closedByName || 'Admin'}`
                    : 'Open for posting'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                      <th className="py-2.5 px-4">ID</th>
                      <th className="py-2.5 px-4">Account</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-right">Rate Applied</th>
                      <th className="py-2.5 px-4">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {summary.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          No entries recorded on {summary.date}.
                        </td>
                      </tr>
                    ) : (
                      summary.entries.map((e: any) => (
                        <tr key={e.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">#{e.id}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">{e.accountName}</div>
                            <div className="text-xs font-mono text-slate-400">
                              {e.accountNumber}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold">
                            <span
                              className={
                                e.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                              }
                            >
                              {e.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{e.description}</td>
                          <td className="py-2.5 px-4 text-right">
                            <CurrencyDualDisplay
                              aedAmount={e.amount}
                              inrAmount={e.convertedAmountInr}
                              align="right"
                              tone={e.type === 'CREDIT' ? 'credit' : 'debit'}
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-500">
                            1 AED = ₹{Number(e.exchangeRate).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-600">{e.createdByName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
