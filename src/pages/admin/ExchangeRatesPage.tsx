import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { getDubaiDateString } from '../../lib/money.ts';

export function ExchangeRatesPage() {
  const { apiFetch, notify, refreshWorkspace } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [overrideRate, setOverrideRate] = useState('');
  const [overrideDate, setOverrideDate] = useState(getDubaiDateString());
  const [overrideNotes, setOverrideNotes] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  const loadRates = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch('/api/admin/rates');
        setData(res);
        if (res.current?.baseRate) {
          setOverrideRate((prev) => prev || Number(res.current.baseRate).toFixed(4));
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to load exchange rates';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    loadRates(true);
  }, [loadRates]);

  useRealtimeRefresh(['rates:updated', 'settings:updated'], () => loadRates(false));

  const handleRefreshLive = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch('/api/admin/rates/refresh', { method: 'POST' });
      if (!res.rateInfo?.rateAvailable || !res.rateInfo?.rate) {
        notify(
          'error',
          res.rateInfo?.warningMessage || 'Live exchange rate API unavailable and no fallback rate exists'
        );
      } else if (res.rateInfo?.fallbackWarning) {
        notify('info', res.rateInfo.warningMessage || 'Live API unavailable; fallback rate retained');
      } else {
        notify(
          'success',
          `Refreshed live rate: 1 AED = ₹${Number(res.rateInfo.rate).toFixed(4)}`
        );
      }
      await loadRates(false);
      await refreshWorkspace();
    } catch (err: any) {
      notify('error', err.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleModeSwitch = async (mode: 'AUTO' | 'MANUAL') => {
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ rateRefreshMode: mode }),
      });
      notify('success', `Rate refresh mode switched to ${mode}`);
      await loadRates(false);
      await refreshWorkspace();
    } catch (err: any) {
      notify('error', err.message || 'Failed to switch mode');
    }
  };

  const handleSetOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOverride(true);
    try {
      await apiFetch('/api/admin/rates/override', {
        method: 'POST',
        body: JSON.stringify({
          rate: overrideRate,
          effectiveDate: overrideDate,
          notes: overrideNotes,
        }),
      });
      notify(
        'success',
        `Manual override saved: 1 AED = ₹${Number(overrideRate).toFixed(4)} for ${overrideDate}`
      );
      setOverrideNotes('');
      await loadRates(false);
      await refreshWorkspace();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save manual override');
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            AED → INR Exchange Rate Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure automatic API fetching or set manual rate overrides per effective date (GST). Manual overrides take priority over API feeds.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshLive}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Fetching Live Feed...' : 'Fetch Live API Rate'}
        </button>
      </div>

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadRates(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-44 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ) : (
        data && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Current Active Rate & Mode */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div>
                  <div className="text-xs font-medium text-slate-500">Current Active Effective Rate</div>
                  {data.current?.rateAvailable && data.current?.rate ? (
                    <>
                      <div className="text-2xl font-semibold font-mono tabular-nums text-violet-800 mt-1">
                        1 AED = ₹{Number(data.current.rate).toFixed(4)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Base: ₹{Number(data.current.baseRate).toFixed(4)} · Markup: {data.markup}% · Source:{' '}
                        <span className="font-semibold text-slate-800">{data.current.source}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        Effective Date: {data.current.rateDate}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-red-700 mt-1">
                        No Active Rate Recorded
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Click &quot;Fetch Live API Rate&quot; or enter a manual override to activate AED → INR conversion.
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs font-medium text-slate-700 mb-2">
                    Rate Refresh Mode
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
                    {(['AUTO', 'MANUAL'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleModeSwitch(m)}
                        className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                          data.mode === m
                            ? 'bg-violet-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Manual Rate Override Form */}
              <form
                onSubmit={handleSetOverride}
                className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
              >
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Set Manual Exchange Rate Override
                  </h2>
                  <p className="text-xs text-slate-500">
                    Overrides take immediate priority for the selected effective date (blocked if that day is already CLOSED).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      1 AED = INR (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.01"
                      required
                      value={overrideRate}
                      onChange={(e) => setOverrideRate(e.target.value)}
                      placeholder="e.g. 25.3200"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Effective Date (GST) *
                    </label>
                    <input
                      type="date"
                      required
                      value={overrideDate}
                      onChange={(e) => setOverrideDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Audit Notes
                    </label>
                    <input
                      type="text"
                      value={overrideNotes}
                      onChange={(e) => setOverrideNotes(e.target.value)}
                      placeholder="e.g. Treasury settlement lock"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingOverride}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingOverride ? 'Saving Override...' : 'Save Manual Override'}
                  </button>
                </div>
              </form>
            </div>

            {/* Historical Rates Table */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">
                  Historical AED → INR Rate Log
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-violet-50/80 text-violet-950 text-xs font-semibold border-b border-violet-100">
                      <th className="py-2.5 px-4">Effective Date</th>
                      <th className="py-2.5 px-4 text-right">Rate (1 AED = INR)</th>
                      <th className="py-2.5 px-4">Source</th>
                      <th className="py-2.5 px-4">Set By</th>
                      <th className="py-2.5 px-4">Notes</th>
                      <th className="py-2.5 px-4">Recorded At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No historical exchange rates recorded yet. Click Fetch Live API Rate or save a manual override.
                        </td>
                      </tr>
                    ) : (
                      data.history.map((r: any) => (
                        <tr key={r.id} className="even:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                            {r.effectiveDate}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            ₹{Number(r.rate).toFixed(6)}
                          </td>
                          <td className="py-2.5 px-4 font-semibold">
                            <span
                              className={
                                r.source === 'MANUAL' ? 'text-violet-700' : 'text-blue-700'
                              }
                            >
                              {r.source}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{r.setByName}</td>
                          <td className="py-2.5 px-4 text-slate-600">{r.notes || '—'}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-400">
                            {new Date(r.createdAt).toLocaleString('en-GB', {
                              timeZone: 'Asia/Dubai',
                            })}
                          </td>
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
