import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';

export function TransactionHistoryPage() {
  const { apiFetch, notify } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const dateRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

  useEffect(() => {
    apiFetch('/api/accounts')
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => {});
  }, [apiFetch]);

  const loadTransactions = useCallback(async (showSkeleton = true) => {
    if (dateRangeInvalid) {
      setLoading(false);
      setLoadError('');
      return;
    }
    if (showSkeleton) setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '15');
      if (search.trim()) params.set('search', search.trim());
      if (accountId) params.set('accountId', accountId);
      if (type !== 'ALL') params.set('type', type);
      if (status !== 'ALL') params.set('status', status);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      setRows(res.transactions || []);
      setPagination(res.pagination || { page: 1, pageSize: 15, total: 0, totalPages: 1 });
    } catch (err: any) {
      const msg = err.message || 'Failed to load transaction history';
      setLoadError(msg);
      if (showSkeleton) notify('error', msg);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [apiFetch, page, search, accountId, type, status, startDate, endDate, dateRangeInvalid, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTransactions(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadTransactions]);

  useRealtimeRefresh(['ledger:updated'], () => {
    loadTransactions(false);
  });

  const resetFilters = () => {
    setSearch('');
    setAccountId('');
    setType('ALL');
    setStatus('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Transaction History</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Immutable ledger log with entry-time exchange rates and running account balances
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search description, account, staff, #ID..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md"
          />
        </div>

        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by account"
          className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.accountNumber} — {a.name}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by type"
          className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="ALL">All Types</option>
          <option value="CREDIT">Credits Only</option>
          <option value="DEBIT">Debits Only</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="REVERSED">Reversed</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
          aria-label="Start date"
          className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
        />

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            aria-label="End date"
            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap"
          >
            Reset
          </button>
        </div>
      </div>

      {dateRangeInvalid && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900">
          <span>Start date cannot be after end date. Adjust the date range or reset filters.</span>
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-1.5 font-medium bg-white border border-amber-200 rounded hover:bg-amber-100 shrink-0"
          >
            Reset Filters
          </button>
        </div>
      )}

      {loadError && !loading && !dateRangeInvalid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadTransactions(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Date (GST)</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Amount (AED / INR)</th>
                <th className="py-3 px-4 text-right">Rate Used</th>
                <th className="py-3 px-4 text-right">Run Bal (AED)</th>
                <th className="py-3 px-4">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3, 4, 5].map((n) => (
                  <tr key={n}>
                    <td colSpan={9} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">#{t.id}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      <div>{t.date}</div>
                      {t.isDayClosed && (
                        <div className="text-[11px] text-slate-400">Closed Day</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{t.accountName}</div>
                      <div className="text-xs font-mono text-slate-400">{t.accountNumber}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold whitespace-nowrap">
                      <span className={t.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'}>
                        {t.type}
                      </span>
                      {t.status === 'REVERSED' && (
                        <div className="text-[11px] font-medium text-amber-700">REVERSED</div>
                      )}
                      {t.reversalOfId && (
                        <div className="text-[11px] font-medium text-slate-500">
                          Reverses #{t.reversalOfId}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 max-w-xs">
                      <div className="truncate" title={t.description}>
                        {t.description}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Orig: {t.originalCurrency} {t.originalAmount}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <CurrencyDualDisplay
                        aedAmount={t.amount}
                        inrAmount={t.convertedAmountInr}
                        align="right"
                        tone={t.type === 'CREDIT' ? 'credit' : 'debit'}
                        size="sm"
                      />
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-500 whitespace-nowrap">
                      <div>1 AED = ₹{Number(t.exchangeRate).toFixed(2)}</div>
                      <div className="text-[11px] text-slate-400">
                        {t.rateDate} · {t.rateSource}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">
                      AED {Number(t.runningBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{t.createdByName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div>
            Showing page <span className="font-mono font-semibold">{pagination.page}</span> of{' '}
            <span className="font-mono font-semibold">{pagination.totalPages}</span> (
            <span className="font-mono">{pagination.total}</span> total entries)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
