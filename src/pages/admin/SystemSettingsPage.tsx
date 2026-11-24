import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';

export function SystemSettingsPage() {
  const { apiFetch, notify, refreshWorkspace } = useAuth();
  const [form, setForm] = useState({
    defaultCurrency: 'AED',
    reportingCurrency: 'INR',
    rateRefreshMode: 'AUTO',
    rateRefreshSchedule: '09:00',
    rateMarkup: '0',
    timezone: 'Asia/Dubai',
    staffCanViewReports: true,
    staffCanExport: true,
    staffCanAddAccounts: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(
    (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      apiFetch('/api/admin/settings')
        .then((res) => {
          if (res.settings) setForm(res.settings);
        })
        .catch((err) => {
          const msg = err.message || 'Failed to load settings';
          setLoadError(msg);
          if (showSkeleton) notify('error', msg);
        })
        .finally(() => {
          if (showSkeleton) setLoading(false);
        });
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    loadSettings(true);
  }, [loadSettings]);

  useRealtimeRefresh(['settings:updated'], () => loadSettings(false));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      notify('success', 'System settings and staff permissions saved');
      await refreshWorkspace();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  if (loadError) {
    return (
      <div className="max-w-3xl bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between gap-3 text-xs text-red-800">
        <span>{loadError}</span>
        <button
          type="button"
          onClick={() => loadSettings(true)}
          className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          System Settings & Role Permissions
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure working/reporting currencies, exchange-rate refresh behavior, markup, timezone, and staff portal permissions
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-6"
      >
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Currency & Exchange Rate Configuration
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Working Currency
              </label>
              <select
                value={form.defaultCurrency}
                onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
              >
                <option value="AED">AED (UAE Dirham)</option>
                <option value="INR">INR (Indian Rupee)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reporting Currency
              </label>
              <select
                value={form.reportingCurrency}
                onChange={(e) => setForm({ ...form, reportingCurrency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
              >
                <option value="INR">INR (Indian Rupee ₹)</option>
                <option value="AED">AED (UAE Dirham)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Rate Refresh Mode
              </label>
              <select
                value={form.rateRefreshMode}
                onChange={(e) => setForm({ ...form, rateRefreshMode: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
              >
                <option value="AUTO">AUTO (Daily API Feed + Fallback)</option>
                <option value="MANUAL">MANUAL (Admin Override Only)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Daily Refresh Schedule (GST)
              </label>
              <input
                type="time"
                value={form.rateRefreshSchedule}
                onChange={(e) => setForm({ ...form, rateRefreshSchedule: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Optional Rate Markup (%)
              </label>
              <input
                type="number"
                step="0.05"
                min="-20"
                max="20"
                value={form.rateMarkup}
                onChange={(e) => setForm({ ...form, rateMarkup: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Operating Timezone
              </label>
              <input
                type="text"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Staff Role Permissions
          </h2>

          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.staffCanViewReports}
              onChange={(e) => setForm({ ...form, staffCanViewReports: e.target.checked })}
              className="rounded border-slate-300 text-violet-700"
            />
            Allow Staff users to view Basic Reports
          </label>

          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.staffCanExport}
              onChange={(e) => setForm({ ...form, staffCanExport: e.target.checked })}
              className="rounded border-slate-300 text-violet-700"
            />
            Allow Staff users to download PDF and Excel report exports
          </label>

          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.staffCanAddAccounts}
              onChange={(e) => setForm({ ...form, staffCanAddAccounts: e.target.checked })}
              className="rounded border-slate-300 text-violet-700"
            />
            Allow Staff users to create new ledger accounts
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Settings...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
