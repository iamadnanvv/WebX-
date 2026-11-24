import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ShieldCheck } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { formatAED, formatINR } from '../../lib/money.ts';

export function AdminDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { apiFetch, primaryCurrency } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(
    (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      apiFetch('/api/admin/dashboard')
        .then((res) => {
          setData(res);
          setError('');
        })
        .catch((err) => {
          setError(err.message || 'Failed to load admin overview');
        })
        .finally(() => {
          if (showSkeleton) setLoading(false);
        });
    },
    [apiFetch]
  );

  useEffect(() => {
    loadDashboard(true);
  }, [loadDashboard]);

  useRealtimeRefresh(
    ['ledger:updated', 'accounts:updated', 'rates:updated', 'closing:updated', 'staff:updated'],
    () => loadDashboard(false)
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
        <span>{error || 'Failed to load admin dashboard'}</span>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  const chartData = (data.staffPerformance || []).map((s: any) => ({
    name: s.name.split(' ')[0],
    entries: s.entryCount,
    volumeAed: Number(s.totalVolumeAed),
    volumeInr: Number(s.totalVolumeInr),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 mb-1">
            <ShieldCheck className="w-4 h-4" />
            Admin Control Center
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Executive Oversight & Staff Performance
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('admin-closing')}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
        >
          Review Daily Closing
        </button>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">System Net Liquidity</div>
          <CurrencyDualDisplay
            aedAmount={data.totalBalanceAed}
            inrAmount={data.totalBalanceInr}
            rate={data.rateInfo?.rate}
            rateDate={data.rateInfo?.rateDate}
            showRateLabel
            size="lg"
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Managed Accounts</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.totalAccounts}
          </div>
          <div className="text-xs text-slate-500 mt-1">All AED base-currency ledgers</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Total Ledger Entries</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.totalTransactions}
          </div>
          <div className="text-xs text-amber-700 mt-1 font-mono tabular-nums">
            {data.reversedCount} reversed · zero hard deletes
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Active Reference Rate</div>
          {data.rateInfo?.rateAvailable && data.rateInfo?.rate ? (
            <>
              <div className="text-xl font-semibold font-mono tabular-nums text-violet-800">
                1 AED = ₹{Number(data.rateInfo.rate).toFixed(4)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {data.rateInfo.source} · {data.rateInfo.rateDate}
              </div>
            </>
          ) : (
            <>
              <div className="text-base font-semibold text-red-700">Rate Unavailable</div>
              <div className="text-xs text-slate-500 mt-1">
                Fetch live rate or set an override
              </div>
            </>
          )}
        </div>
      </div>

      {/* Staff Performance Chart + Top Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-base font-semibold text-slate-900">Staff Entry Volume</h2>
          <p className="text-xs text-slate-500 mb-4">
            Transaction counts and cumulative volume handled per user
          </p>
          {chartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
              No user activity recorded yet.
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="entries" name="Total Entries" fill="#6d28d9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Top Account Balances</h2>
            <button
              type="button"
              onClick={() => onNavigate('admin-accounts')}
              className="text-xs font-medium text-violet-700 hover:text-violet-900"
            >
              Manage Accounts
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-violet-50/70 text-violet-950 text-xs font-semibold border-b border-violet-100">
                  <th className="py-2.5 px-4">Account</th>
                  <th className="py-2.5 px-4 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.topAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-xs text-slate-500">
                      No accounts created yet. Create an account to start posting entries.
                    </td>
                  </tr>
                ) : (
                  data.topAccounts.map((a: any) => (
                    <tr key={a.id} className="even:bg-slate-50/60">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="text-xs font-mono text-slate-400">{a.accountNumber}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <CurrencyDualDisplay
                          aedAmount={a.currentBalance}
                          inrAmount={a.balanceInr}
                          align="right"
                          size="sm"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Staff Performance Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Team Activity Breakdown</h2>
          <button
            type="button"
            onClick={() => onNavigate('admin-staff')}
            className="text-xs font-medium text-violet-700 hover:text-violet-900"
          >
            Manage Staff
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-violet-50/70 text-violet-950 text-xs font-semibold border-b border-violet-100">
                <th className="py-2.5 px-4">Member</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Today Entries</th>
                <th className="py-2.5 px-4 text-right">Total Entries</th>
                <th className="py-2.5 px-4 text-right">Total Volume Processed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.staffPerformance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No team members found.
                  </td>
                </tr>
              ) : (
                data.staffPerformance.map((s: any) => (
                  <tr key={s.userId} className="even:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.email}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold">
                      <span className={s.role === 'ADMIN' ? 'text-violet-700' : 'text-blue-700'}>
                        {s.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span className={s.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-700'}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs">
                      {s.todayCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs font-semibold">
                      {s.entryCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs">
                      {primaryCurrency === 'AED'
                        ? `${formatAED(s.totalVolumeAed)} · ${formatINR(s.totalVolumeInr)}`
                        : `${formatINR(s.totalVolumeInr)} · ${formatAED(s.totalVolumeAed)}`}
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
