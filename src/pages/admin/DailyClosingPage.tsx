import { useCallback, useEffect, useState } from 'react';
import { Calendar, Lock, Unlock } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { ConfirmModal } from '../../components/ConfirmModal.tsx';
import { getDubaiDateString } from '../../lib/money.ts';

export function DailyClosingPage() {
  const { apiFetch, notify } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getDubaiDateString());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);

  const loadDay = useCallback(
    async (showSkeleton = true) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch(`/api/daily-ledger?date=${encodeURIComponent(selectedDate)}`);
        setData(res);
      } catch (err: any) {
        const msg = err.message || 'Failed to load daily closing';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, selectedDate, notify]
  );

  useEffect(() => {
    loadDay(true);
  }, [loadDay]);

  useRealtimeRefresh(['ledger:updated', 'closing:updated', 'rates:updated'], () => loadDay(false));

  const handleCloseDay = async () => {
    await apiFetch('/api/admin/daily-closing/close', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate }),
    });
    notify('success', `Daily closing finalized and locked for ${selectedDate}`);
    setConfirmCloseOpen(false);
    await loadDay(false);
  };

  const handleReopenDay = async (reason: string) => {
    await apiFetch('/api/admin/daily-closing/reopen', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate, reason }),
    });
    notify('info', `Date ${selectedDate} reopened for adjustments`);
    setConfirmReopenOpen(false);
    await loadDay(false);
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Daily Closing & Day Lock</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review daily AED & INR totals, lock closed days against staff edits, or explicitly reopen with an audit reason
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
            />
          </div>

          {summary?.status === 'OPEN' ? (
            <button
              type="button"
              disabled={!summary.rateAvailable}
              title={
                !summary.rateAvailable
                  ? 'Fetch a live exchange rate or set a manual override before finalizing closing'
                  : 'Finalize and lock day'
              }
              onClick={() => setConfirmCloseOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              Finalize & Lock Day
            </button>
          ) : (
            summary && (
              <button
                type="button"
                onClick={() => setConfirmReopenOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
              >
                <Unlock className="w-4 h-4" />
                Reopen Closed Day
              </button>
            )
          )}
        </div>
      </div>

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadDay(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-44 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs text-slate-500 mb-1.5">Total Additions (Credits)</div>
                <CurrencyDualDisplay
                  aedAmount={summary.totalAdditions}
                  inrAmount={summary.totalAdditionsInr}
                  tone="credit"
                  size="lg"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs text-slate-500 mb-1.5">Total Deductions (Debits)</div>
                <CurrencyDualDisplay
                  aedAmount={summary.totalDeductions}
                  inrAmount={summary.totalDeductionsInr}
                  tone="debit"
                  size="lg"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="text-xs text-slate-500 mb-1.5">Closing Book Balance</div>
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
                <div className="text-xs text-slate-500 mb-1.5">Closing Status</div>
                <div
                  className={`text-xl font-semibold ${
                    summary.status === 'CLOSED' ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {summary.status}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {summary.status === 'CLOSED'
                    ? `Locked by ${summary.closedByName || 'Admin'}`
                    : `${summary.entryCount} entries ready for review`}
                </div>
              </div>
            </div>

            {/* Day's Entries */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Entries Included in {summary.date} Closing
                </h2>
                <span className="text-xs font-mono text-slate-500">
                  {summary.appliedRate
                    ? `Applied Rate: 1 AED = ₹${Number(summary.appliedRate).toFixed(4)}`
                    : 'Exchange rate unavailable'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-violet-50/80 text-violet-950 text-xs font-semibold border-b border-violet-100">
                      <th className="py-2.5 px-4">ID</th>
                      <th className="py-2.5 px-4">Account</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {summary.entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No entries on {summary.date}.
                        </td>
                      </tr>
                    ) : (
                      summary.entries.map((e: any) => (
                        <tr key={e.id} className="even:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">#{e.id}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{e.accountName}</td>
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
                          <td className="py-2.5 px-4 text-xs text-slate-600">{e.createdByName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Closings History */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">Recent Closing Log</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-violet-50/80 text-violet-950 text-xs font-semibold border-b border-violet-100">
                      <th className="py-2.5 px-4">Date (GST)</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Additions</th>
                      <th className="py-2.5 px-4 text-right">Deductions</th>
                      <th className="py-2.5 px-4 text-right">Closing Balance</th>
                      <th className="py-2.5 px-4 text-right">Rate Applied</th>
                      <th className="py-2.5 px-4">Closed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(data?.recentClosings || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No daily closings finalized yet.
                        </td>
                      </tr>
                    ) : (
                      (data?.recentClosings || []).map((c: any) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedDate(c.date)}
                          className="even:bg-slate-50/60 hover:bg-violet-50/30 cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-mono font-medium">{c.date}</td>
                          <td className="py-2.5 px-4 font-semibold">
                            <span
                              className={
                                c.status === 'CLOSED' ? 'text-red-700' : 'text-emerald-700'
                              }
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <CurrencyDualDisplay
                              aedAmount={c.totalAdditions}
                              inrAmount={c.totalAdditionsInr}
                              align="right"
                              tone="credit"
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <CurrencyDualDisplay
                              aedAmount={c.totalDeductions}
                              inrAmount={c.totalDeductionsInr}
                              align="right"
                              tone="debit"
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <CurrencyDualDisplay
                              aedAmount={c.closingBalance}
                              inrAmount={c.closingBalanceInr}
                              align="right"
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {c.appliedRate
                              ? `1 AED = ₹${Number(c.appliedRate).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{c.closedByName || '—'}</td>
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

      <ConfirmModal
        open={confirmCloseOpen}
        title={`Finalize Daily Closing for ${selectedDate}`}
        description={`Closing ${selectedDate} will lock all ${summary?.entryCount || 0} entries, AED/INR totals, and exchange conversions. Staff will not be able to add entries to this date unless an Admin reopens it.`}
        confirmLabel="Finalize & Lock Day"
        variant="purple"
        onConfirm={handleCloseDay}
        onCancel={() => setConfirmCloseOpen(false)}
      />

      <ConfirmModal
        open={confirmReopenOpen}
        title={`Reopen Closed Day (${selectedDate})`}
        description="Reopening a closed day allows adjustments, edits, or rate recalculations on this date. This action is recorded in the audit log."
        confirmLabel="Reopen Day"
        variant="danger"
        requireReason
        reasonLabel="Reason for Reopening"
        reasonPlaceholder="e.g. Late bank wire confirmation or rate correction..."
        onConfirm={handleReopenDay}
        onCancel={() => setConfirmReopenOpen(false)}
      />
    </div>
  );
}
