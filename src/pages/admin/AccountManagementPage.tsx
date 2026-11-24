import { useCallback, useEffect, useState } from 'react';
import { BookText, Edit3, Plus } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { AccountLedgerModal } from '../../components/AccountLedgerModal.tsx';

export function AccountManagementPage() {
  const { apiFetch, notify } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ledgerAccountId, setLedgerAccountId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    accountNumber: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
    openingBalance: '0.00',
    status: 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch('/api/accounts');
        setAccounts(res.accounts || []);
      } catch (err: any) {
        const msg = err.message || 'Failed to load accounts';
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

  useEffect(() => {
    if (!creating && !editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        setEditing(null);
        setCreating(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [creating, editing, saving]);

  useRealtimeRefresh(['accounts:updated', 'ledger:updated', 'rates:updated'], () =>
    loadAccounts(false)
  );

  const openEdit = (acc: any) => {
    setEditing(acc);
    setForm({
      name: acc.name,
      accountNumber: acc.accountNumber,
      contactEmail: acc.contactEmail || '',
      contactPhone: acc.contactPhone || '',
      contactAddress: acc.contactAddress || '',
      openingBalance: acc.openingBalance,
      status: acc.status,
    });
  };

  const openCreate = () => {
    setCreating(true);
    setForm({
      name: '',
      accountNumber: '',
      contactEmail: '',
      contactPhone: '',
      contactAddress: '',
      openingBalance: '0.00',
      status: 'ACTIVE',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/accounts/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            contactEmail: form.contactEmail,
            contactPhone: form.contactPhone,
            contactAddress: form.contactAddress,
            openingBalance: form.openingBalance,
            status: form.status,
          }),
        });
        notify('success', `Account ${form.name} updated & ledger recalculated`);
        setEditing(null);
      } else {
        await apiFetch('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            accountNumber: form.accountNumber,
            contactEmail: form.contactEmail,
            contactPhone: form.contactPhone,
            contactAddress: form.contactAddress,
            openingBalance: form.openingBalance,
            baseCurrency: 'AED',
          }),
        });
        notify('success', `Account ${form.name} created`);
        setCreating(false);
      }
      await loadAccounts(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Account Management (Admin)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create, edit, deactivate accounts, and inspect full opening-to-closing ledgers
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Create Account
        </button>
      </div>

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
                <th className="py-3 px-4">Account Holder</th>
                <th className="py-3 px-4">Account No.</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-right">Opening Balance</th>
                <th className="py-3 px-4 text-right">Current Balance</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3, 4].map((n) => (
                  <tr key={n}>
                    <td colSpan={7} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No accounts created yet. Click Create Account to add your first ledger account.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr key={acc.id} className="even:bg-slate-50/60">
                    <td className="py-3 px-4 font-medium text-slate-900">{acc.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {acc.accountNumber} · {acc.baseCurrency}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{acc.contactEmail || '—'}</div>
                      <div className="text-slate-400">{acc.contactPhone || ''}</div>
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
                    <td className="py-3 px-4 text-xs font-medium">
                      <span
                        className={
                          acc.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'
                        }
                      >
                        {acc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(acc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setLedgerAccountId(acc.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-violet-200 bg-violet-50 text-violet-800 rounded hover:bg-violet-100"
                        >
                          <BookText className="w-3.5 h-3.5" />
                          Ledger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AccountLedgerModal
        accountId={ledgerAccountId}
        onClose={() => setLedgerAccountId(null)}
      />

      {(creating || editing) && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!saving && e.target === e.currentTarget) {
              setEditing(null);
              setCreating(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? `Edit Account · ${editing.accountNumber}` : 'Create Account'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                {!editing && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Account Number *
                    </label>
                    <input
                      required
                      value={form.accountNumber}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                    />
                  </div>
                )}
                {editing && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <input
                  value={form.contactAddress}
                  onChange={(e) => setForm({ ...form, contactAddress: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Opening Balance (AED) — triggers running balance recalculation
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.openingBalance}
                  onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setCreating(false);
                  }}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
