import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, UserPlus, X } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';

export function StaffManagementPage() {
  const { apiFetch, notify, user: currentUser } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'STAFF' | 'ADMIN'>('STAFF');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch('/api/admin/staff');
        setStaff(res.users || []);
      } catch (err: any) {
        const msg = err.message || 'Failed to load staff directory';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    loadStaff(true);
  }, [loadStaff]);

  useEffect(() => {
    if (!showCreate && !resetTarget && !editTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        setShowCreate(false);
        setResetTarget(null);
        setEditTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreate, resetTarget, editTarget, saving]);

  useRealtimeRefresh(['staff:updated', 'ledger:updated'], () => loadStaff(false));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      notify('success', `User ${name} created`);
      setShowCreate(false);
      setName('');
      setEmail('');
      setPassword('');
      setRole('STAFF');
      await loadStaff(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u: any) => {
    const nextStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await apiFetch(`/api/admin/staff/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      notify('success', `${u.name} marked ${nextStatus}`);
      await loadStaff(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to update status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/staff/${resetTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      });
      notify('success', `Password reset for ${resetTarget.name}`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      notify('error', err.message || 'Password reset failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: { name: string; role?: 'STAFF' | 'ADMIN' } = {
        name: editName.trim(),
      };
      if (editTarget.id !== currentUser?.id) {
        payload.role = editRole;
      }
      await apiFetch(`/api/admin/staff/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      notify('success', `Updated user ${editName.trim()}`);
      setEditTarget(null);
      await loadStaff(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff & User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create staff accounts, manage role access, disable access, and reset passwords
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff User
        </button>
      </div>

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadStaff(true)}
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
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Entries Logged</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [1, 2, 3].map((n) => (
                  <tr key={n}>
                    <td colSpan={7} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                staff.map((u) => (
                  <tr key={u.id} className="even:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">#{u.id}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{u.name}</td>
                    <td className="py-3 px-4 text-slate-600">{u.email}</td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span className={u.role === 'ADMIN' ? 'text-violet-700' : 'text-blue-700'}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={u.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-700'}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">{u.transactionCount}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(u);
                            setEditName(u.name);
                            setEditRole(u.role);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setNewPassword('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset Password
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => toggleStatus(u)}
                            className={`px-2.5 py-1 text-xs font-medium rounded border ${
                              u.status === 'ACTIVE'
                                ? 'border-red-200 text-red-700 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!saving && e.target === e.currentTarget) setShowCreate(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create Staff / Admin User</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Password (min 8 chars) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'STAFF' | 'ADMIN')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!saving && e.target === e.currentTarget) setResetTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Reset Password · {resetTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label="Close reset password modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Password (min 8 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!saving && e.target === e.currentTarget) setEditTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Edit User · {editTarget.email}
              </h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label="Close edit user modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  required
                  minLength={2}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
                <select
                  value={editRole}
                  disabled={editTarget.id === currentUser?.id}
                  onChange={(e) => setEditRole(e.target.value as 'STAFF' | 'ADMIN')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                {editTarget.id === currentUser?.id && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    You cannot change your own administrator role.
                  </p>
                )}
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
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
