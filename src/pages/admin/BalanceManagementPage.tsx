import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';

export function BalanceManagementPage() {
  const { apiFetch, notify } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recalcResults, setRecalcResults] = useState<any[] | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadAccounts = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch('/api/accounts');
        setAccounts(res.accounts || []);
      } catch (err: any) {
        const msg = err.message || 'Failed to load account balances';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    loadAccounts(true);
  }, [loadAccounts]);

  useRealtimeRefresh(['accounts:updated', 'ledger:updated', 'rates:updated'], () =>
    loadAccounts(false)
  );

  const handleRecalculateAll = async () => {
    setRunning(true);
    try {
      const res = await apiFetch('/api/admin/balances/recalculate', {
        method: 'POST',
      });
      setRecalcResults(res.results || []);
      notify(
        'success',
        `Consistency check complete across ${res.results?.length || 0} accounts (${res.discrepanciesFixed} discrepancies corrected)`
      );
      await loadAccounts(false);
    } catch (err: any) {
      notify('error', err.message || 'Recalculation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            System Balance Management & Verification
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Running and final balances are calculated automatically using exact decimal arithmetic. Run a consistency sweep anytime to audit every ledger chain.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRecalculateAll}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Recalculating All Ledgers...' : 'Run System-Wide Recalculation'}
        </button>
      </div>

      {recalcResults && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold text-violet-950">
            Last Consistency Check Results ({recalcResults.length} accounts verified)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {recalcResults.map((r) => (
              <div
                key={r.accountId}
                className="bg-white border border-violet-200 rounded px-3 py-2 text-xs flex items-center justify-between"
              >
                <span className="font-medium text-slate-800 truncate pr-2">{r.name}</span>
                <span
                  className={`font-mono ${
                    r.changed ? 'text-amber-700 font-semibold' : 'text-emerald-700'
                  }`}
                >
                  {r.changed ? `Fixed -> AED ${r.recalculatedBalance}` : 'Verified'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadAccounts(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-violet-50/80 text-violet-950 text-xs font-semibold border-b border-violet-100">
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Account No.</th>
                <th className="py-3 px-4 text-right">Opening Balance</th>
                <th className="py-3 px-4 text-right">Current Ledger Balance</th>
                <th className="py-3 px-4 text-right">Entries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3].map((n) => (
                  <tr key={n}>
                    <td colSpan={5} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    No accounts created yet.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr key={acc.id} className="even:bg-slate-50/60">
                    <td className="py-3 px-4 font-medium text-slate-900">{acc.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {acc.accountNumber} · {acc.baseCurrency}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <CurrencyDualDisplay
                        aedAmount={acc.openingBalance}
                        inrAmount={acc.openingBalanceInr}
                        align="right"
                        size="sm"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <CurrencyDualDisplay
                        aedAmount={acc.currentBalance}
                        inrAmount={acc.currentBalanceInr}
                        align="right"
                        tone={Number(acc.currentBalance) >= 0 ? 'credit' : 'debit'}
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-600">
                      {acc.transactionCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
