import { useCallback, useEffect, useState } from 'react';
import { BookText, Plus, Search } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { AccountLedgerModal } from '../../components/AccountLedgerModal.tsx';

export function AccountListPage() {
  const { apiFetch, user, settings, notify } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rateInfo, setRateInfo] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newAccNum, setNewAccNum] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newOpening, setNewOpening] = useState('0.00');
  const [saving, setSaving] = useState(false);

  const canCreateAccount = user?.role === 'ADMIN' || Boolean(settings?.staffCanAddAccounts);

  const loadAccounts = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await apiFetch(`/api/accounts?${params.toString()}`);
      setAccounts(res.accounts || []);
      setRateInfo(res.rateInfo);
    } catch (err: any) {
      const msg = err.message || 'Failed to load accounts';
      setLoadError(msg);
      if (showSkeleton) notify('error', msg);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [apiFetch, search, statusFilter, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAccounts(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadAccounts]);

  useEffect(() => {
    if (!showCreateModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        setShowCreateModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreateModal, saving]);

  useRealtimeRefresh(['accounts:updated', 'ledger:updated', 'rates:updated'], () => {
    loadAccounts(false);
  });

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          accountNumber: newAccNum,
          contactEmail: newEmail,
          contactPhone: newPhone,
          contactAddress: newAddress,
          baseCurrency: 'AED',
          openingBalance: newOpening || '0.00',
        }),
      });
      notify('success', `Account "${newName}" created`);
      setShowCreateModal(false);
      setNewName('');
      setNewAccNum('');
      setNewEmail('');
      setNewPhone('');
      setNewAddress('');
      setNewOpening('0.00');
      await loadAccounts();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Accounts & Balance Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Automated AED ledger balances with live INR equivalents
            {rateInfo?.rateAvailable && rateInfo?.rate
              ? ` · Rate: 1 AED = ₹${Number(rateInfo.rate).toFixed(2)} on ${rateInfo.rateDate}`
              : ''}
          </p>
        </div>
        {canCreateAccount && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Account
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-60 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by holder name, account number, email or phone..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          {['ALL', 'ACTIVE', 'INACTIVE'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                statusFilter === s
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s === 'ALL' ? 'All Statuses' : s}
            </button>
          ))}
        </div>
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

      {/* Accounts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                <th className="py-3 px-4">Account Holder</th>
                <th className="py-3 px-4">Account No.</th>
                <th className="py-3 px-4">Contact Details</th>
                <th className="py-3 px-4 text-right">Opening Balance</th>
                <th className="py-3 px-4 text-right">Current Balance</th>
                <th className="py-3 px-4 text-right">Entries</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3, 4].map((n) => (
                  <tr key={n}>
                    <td colSpan={8} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No accounts match your search criteria.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr key={acc.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
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
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-600">
                      {acc.transactionCount}
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
                      <button
                        type="button"
                        onClick={() => setSelectedAccountId(acc.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                      >
                        <BookText className="w-3.5 h-3.5" />
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AccountLedgerModal
        accountId={selectedAccountId}
        onClose={() => setSelectedAccountId(null)}
      />

      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!saving && e.target === e.currentTarget) setShowCreateModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create Ledger Account</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    placeholder="e.g. Horizon Logistics LLC"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account Number *
                  </label>
                  <input
                    required
                    value={newAccNum}
                    onChange={(e) => setNewAccNum(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                    placeholder="WBX-1011"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Opening Balance (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newOpening}
                  onChange={(e) => setNewOpening(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
