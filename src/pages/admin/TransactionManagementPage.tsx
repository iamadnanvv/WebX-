import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3, RotateCcw, Search } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { ConfirmModal } from '../../components/ConfirmModal.tsx';

export function TransactionManagementPage() {
  const { apiFetch, notify } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    accountId: '',
    type: 'CREDIT',
    originalAmount: '',
    originalCurrency: 'AED',
    date: '',
    description: '',
    reason: '',
    recalculateRate: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [reverseTarget, setReverseTarget] = useState<any>(null);

  const loadAccounts = useCallback(() => {
    apiFetch('/api/accounts')
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadTransactions = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', '15');
        if (search.trim()) params.set('search', search.trim());
        if (type !== 'ALL') params.set('type', type);
        if (status !== 'ALL') params.set('status', status);
        const res = await apiFetch(`/api/transactions?${params.toString()}`);
        setRows(res.transactions || []);
        setPagination(res.pagination || { page: 1, pageSize: 15, total: 0, totalPages: 1 });
      } catch (err: any) {
        const msg = err.message || 'Failed to load transactions';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, page, search, type, status, notify]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTransactions(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadTransactions]);

  useEffect(() => {
    if (!editTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingEdit) {
        e.preventDefault();
        setEditTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editTarget, savingEdit]);

  useRealtimeRefresh(['ledger:updated', 'closing:updated'], () => loadTransactions(false));
  useRealtimeRefresh(['accounts:updated'], loadAccounts);

  const openEdit = (tx: any) => {
    setEditTarget(tx);
    setEditForm({
      accountId: String(tx.accountId),
      type: tx.type,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency,
      date: tx.date,
      description: tx.description,
      reason: '',
      recalculateRate: false,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (editForm.description.trim().length < 3) {
      notify('error', 'Description must be at least 3 characters.');
      return;
    }
    if (editForm.reason.trim().length < 3) {
      notify('error', 'Audit reason must be at least 3 characters.');
      return;
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/api/admin/transactions/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          accountId: Number(editForm.accountId),
          type: editForm.type,
          originalAmount: editForm.originalAmount,
          originalCurrency: editForm.originalCurrency,
          date: editForm.date,
          description: editForm.description,
          reason: editForm.reason,
          recalculateRate: editForm.recalculateRate,
        }),
      });
      notify('success', `Transaction #${editTarget.id} updated & balances recalculated`);
      setEditTarget(null);
      await loadTransactions(false);
    } catch (err: any) {
      notify('error', err.message || 'Edit failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReverseConfirm = async (reason: string) => {
    if (!reverseTarget) return;
    await apiFetch(`/api/admin/transactions/${reverseTarget.id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    notify(
      'success',
      `Transaction #${reverseTarget.id} reversed using original rate (1 AED = ₹${Number(reverseTarget.exchangeRate).toFixed(2)})`
    );
    setReverseTarget(null);
    await loadTransactions(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Transaction Audit, Edit & Reversal
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Entries are never hard-deleted. Edits require a logged reason and open day; reversals create an exact offsetting entry at the original stored rate.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search #ID, account, description..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
            />
          </div>

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
            <option value="CREDIT">Credits</option>
            <option value="DEBIT">Debits</option>
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

          {(search || type !== 'ALL' || status !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setType('ALL');
                setStatus('ALL');
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {loadError && !loading && (
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

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-violet-50/80 text-violet-950 text-xs font-semibold border-b border-violet-100">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Date (GST)</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Stored Rate</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Audit Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3, 4].map((n) => (
                  <tr key={n}>
                    <td colSpan={9} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="even:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">#{t.id}</td>
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      <div>{t.date}</div>
                      {t.isDayClosed && (
                        <div className="text-[11px] text-red-700 font-medium">CLOSED</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{t.accountName}</div>
                      <div className="text-xs font-mono text-slate-400">{t.accountNumber}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold">
                      <span className={t.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'}>
                        {t.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 max-w-xs">
                      <div className="truncate" title={t.description}>
                        {t.description}
                      </div>
                      {t.editReason && (
                        <div className="text-[11px] text-violet-700 truncate">
                          Audit note: {t.editReason}
                        </div>
                      )}
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
                      1 AED = ₹{Number(t.exchangeRate).toFixed(4)}
                      <div className="text-[11px] text-slate-400">{t.rateDate}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium">
                      <span
                        className={
                          t.status === 'REVERSED'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {t.status === 'ACTIVE' && !t.reversalOfId ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={t.isDayClosed}
                            title={
                              t.isDayClosed
                                ? 'Reopen closed day before editing'
                                : 'Edit entry'
                            }
                            onClick={() => openEdit(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700 disabled:opacity-40"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setReverseTarget(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-red-200 bg-red-50 text-red-700 rounded hover:bg-red-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reverse
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Locked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div>
            Page <span className="font-mono font-semibold">{pagination.page}</span> of{' '}
            <span className="font-mono font-semibold">{pagination.totalPages}</span> (
            <span className="font-mono">{pagination.total}</span> total entries)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!savingEdit && e.target === e.currentTarget) setEditTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Edit Transaction #{editTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 font-mono">
                Original stored rate: 1 AED = ₹{Number(editTarget.exchangeRate).toFixed(6)} on{' '}
                {editTarget.rateDate} ({editTarget.rateSource})
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Account</label>
                  <select
                    value={editForm.accountId}
                    onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountNumber} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date (GST)</label>
                  <input
                    type="date"
                    required
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    <option value="CREDIT">CREDIT</option>
                    <option value="DEBIT">DEBIT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Currency</label>
                  <select
                    value={editForm.originalCurrency}
                    onChange={(e) => setEditForm({ ...editForm, originalCurrency: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    <option value="AED">AED</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editForm.originalAmount}
                    onChange={(e) => setEditForm({ ...editForm, originalAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <input
                  required
                  minLength={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="recalcRateCheck"
                  type="checkbox"
                  checked={editForm.recalculateRate}
                  onChange={(e) =>
                    setEditForm({ ...editForm, recalculateRate: e.target.checked })
                  }
                  className="rounded border-slate-300 text-violet-700"
                />
                <label htmlFor="recalcRateCheck" className="text-xs text-slate-700">
                  Recalculate exchange rate using effective rate for the edited date (logged in audit)
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Required Audit Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="Explain why this entry is being edited..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Audited Edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Confirm Modal */}
      <ConfirmModal
        open={Boolean(reverseTarget)}
        title={`Reverse Transaction #${reverseTarget?.id}`}
        description={
          reverseTarget
            ? `This will mark entry #${reverseTarget.id} (${reverseTarget.type} AED ${reverseTarget.amount}) as REVERSED and post an offsetting ${reverseTarget.type === 'CREDIT' ? 'DEBIT' : 'CREDIT'} entry at the original stored rate (1 AED = ₹${Number(reverseTarget.exchangeRate).toFixed(4)}) so both AED and INR balances offset exactly.`
            : ''
        }
        confirmLabel="Confirm Reversal"
        variant="danger"
        requireReason
        reasonLabel="Reversal Reason"
        reasonPlaceholder="e.g. Duplicate posting or wrong vendor invoice..."
        onConfirm={handleReverseConfirm}
        onCancel={() => setReverseTarget(null)}
      />
    </div>
  );
}
