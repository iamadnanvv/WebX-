import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../context/AuthContext.tsx';
import { CurrencyDualDisplay } from './CurrencyValue.tsx';

interface AccountLedgerModalProps {
  accountId: number | null;
  onClose: () => void;
}

export function AccountLedgerModal({ accountId, onClose }: AccountLedgerModalProps) {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLedger = useCallback(
    (showSkeleton = true) => {
      if (!accountId) return;
      if (showSkeleton) setLoading(true);
      setError('');
      apiFetch(`/api/accounts/${accountId}/ledger`)
        .then((res) => {
          setData(res);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load ledger');
        })
        .finally(() => {
          if (showSkeleton) setLoading(false);
        });
    },
    [accountId, apiFetch]
  );

  useEffect(() => {
    if (!accountId) return;
    loadLedger(true);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [accountId, loadLedger, onClose]);

  useRealtimeRefresh(['ledger:updated', 'accounts:updated', 'rates:updated'], () => {
    if (accountId) loadLedger(false);
  });

  if (!accountId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
    >
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {data?.account ? `${data.account.name} (${data.account.accountNumber})` : 'Account Ledger'}
            </h3>
            {data?.account && (
              <p className="text-xs text-slate-500 mt-0.5">
                Base Currency: {data.account.baseCurrency} · Status: {data.account.status}
                {data.account.contactEmail ? ` · ${data.account.contactEmail}` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="space-y-3">
              <div className="h-16 bg-slate-100 rounded animate-pulse" />
              <div className="h-48 bg-slate-100 rounded animate-pulse" />
            </div>
          )}

          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="text-xs text-slate-500 mb-1">Opening Balance</div>
                  <CurrencyDualDisplay
                    aedAmount={data.summary.openingBalanceAed}
                    inrAmount={data.summary.openingBalanceInr}
                  />
                </div>
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-md">
                  <div className="text-xs text-emerald-800 mb-1">Total Credits</div>
                  <CurrencyDualDisplay
                    aedAmount={data.summary.totalCreditsAed}
                    inrAmount={data.summary.totalCreditsInr}
                    tone="credit"
                  />
                </div>
                <div className="p-4 bg-red-50/50 border border-red-200 rounded-md">
                  <div className="text-xs text-red-800 mb-1">Total Debits</div>
                  <CurrencyDualDisplay
                    aedAmount={data.summary.totalDebitsAed}
                    inrAmount={data.summary.totalDebitsInr}
                    tone="debit"
                  />
                </div>
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-md">
                  <div className="text-xs text-blue-900 mb-1">Current Closing Balance</div>
                  <CurrencyDualDisplay
                    aedAmount={data.summary.closingBalanceAed}
                    inrAmount={data.summary.closingBalanceInr}
                    rate={data.rateInfo?.rate}
                    rateDate={data.rateInfo?.rateDate}
                    showRateLabel
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                        <th className="py-2.5 px-3">Entry</th>
                        <th className="py-2.5 px-3">Date (GST)</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Amount (AED / INR)</th>
                        <th className="py-2.5 px-3 text-right">Rate Applied</th>
                        <th className="py-2.5 px-3 text-right">Running Balance</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {data.entries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            No ledger entries posted for this account yet.
                          </td>
                        </tr>
                      ) : (
                        data.entries.map((entry: any) => (
                          <tr key={entry.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                              #{entry.id}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {entry.date}
                            </td>
                            <td className="py-2.5 px-3 text-xs font-semibold">
                              <span
                                className={
                                  entry.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                                }
                              >
                                {entry.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-800 max-w-xs">
                              <div className="truncate" title={entry.description}>
                                {entry.description}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Orig: {entry.originalCurrency} {entry.originalAmount} · By {entry.createdByName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <CurrencyDualDisplay
                                aedAmount={entry.amount}
                                inrAmount={entry.convertedAmountInr}
                                align="right"
                                tone={entry.type === 'CREDIT' ? 'credit' : 'debit'}
                                size="sm"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 whitespace-nowrap">
                              <div>1 AED = ₹{Number(entry.exchangeRate).toFixed(2)}</div>
                              <div className="text-[11px] text-slate-400">
                                on {entry.rateDate} ({entry.rateSource})
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <CurrencyDualDisplay
                                aedAmount={entry.runningBalance}
                                inrAmount={entry.runningBalanceInr}
                                align="right"
                                size="sm"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-xs font-medium">
                              <span
                                className={
                                  entry.status === 'REVERSED'
                                    ? 'text-amber-700'
                                    : 'text-slate-600'
                                }
                              >
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
