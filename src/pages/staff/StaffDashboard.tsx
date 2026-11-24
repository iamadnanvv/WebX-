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
import { ArrowRight, PlusCircle } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import { CurrencyDualDisplay } from '../../components/CurrencyValue.tsx';
import { CurrencyConverterWidget } from '../../components/CurrencyConverterWidget.tsx';
import { formatAED, formatINR } from '../../lib/money.ts';

interface StaffDashboardProps {
  onNavigate: (page: string) => void;
}

export function StaffDashboard({ onNavigate }: StaffDashboardProps) {
  const { apiFetch, primaryCurrency } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/staff');
      setData(res);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useRealtimeRefresh(
    ['ledger:updated', 'accounts:updated', 'rates:updated', 'closing:updated'],
    () => {
      loadDashboard(true);
    }
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
        <span>{error || 'Unable to load dashboard metrics.'}</span>
        <button
          type="button"
          onClick={() => loadDashboard(false)}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff Operations Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Active Date: {data.todayDate} (Asia/Dubai GST) · Day Status:{' '}
            <span
              className={
                data.todayStatus === 'CLOSED'
                  ? 'font-semibold text-red-700'
                  : 'font-semibold text-emerald-700'
              }
            >
              {data.todayStatus}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('new-entry')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          Log New Entry
        </button>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Total Book Balance</div>
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
          <div className="text-xs font-medium text-slate-500 mb-1.5">Ledger Accounts</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.activeAccountCount}
            <span className="text-sm font-normal text-slate-500"> / {data.accountCount}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Active corporate & trade accounts</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Entries Made Today</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.entriesTodayCount}
          </div>
          <div className="text-xs text-emerald-700 font-mono tabular-nums mt-1">
            Credits:{' '}
            {primaryCurrency === 'AED'
              ? formatAED(data.todayCreditsAed)
              : formatINR(data.todayCreditsInr)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Today Debits Outflow</div>
          <CurrencyDualDisplay
            aedAmount={data.todayDebitsAed}
            inrAmount={data.todayDebitsInr}
            tone="debit"
            size="lg"
          />
          <div className="text-xs text-slate-500 mt-1">
            Credits vs Debits tracked in GST
          </div>
        </div>
      </div>

      {/* Main Chart + Currency Converter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                7-Day Cashflow ({primaryCurrency})
              </h2>
              <p className="text-xs text-slate-500">
                Daily credits vs. debits across all accounts
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-700 font-medium">Credits</span>
              <span className="text-red-700 font-medium">Debits</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value: any) =>
                    primaryCurrency === 'AED' ? formatAED(value) : formatINR(value)
                  }
                />
                <Bar
                  dataKey={primaryCurrency === 'AED' ? 'creditsAed' : 'creditsInr'}
                  name="Credits"
                  fill="#15803d"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={primaryCurrency === 'AED' ? 'debitsAed' : 'debitsInr'}
                  name="Debits"
                  fill="#b91c1c"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <CurrencyConverterWidget />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Transactions</h2>
            <p className="text-xs text-slate-500">Latest 10 ledger postings across accounts</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            View All History <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Date (GST)</th>
                <th className="py-2.5 px-4">Account</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4 text-right">Rate Applied</th>
                <th className="py-2.5 px-4">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No transactions recorded yet. Use &ldquo;Log New Entry&rdquo; to post your first ledger entry.
                  </td>
                </tr>
              ) : (
                data.recentTransactions.map((t: any) => (
                <tr key={t.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-500">#{t.id}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {t.date}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{t.accountName}</div>
                    <div className="text-xs font-mono text-slate-400">{t.accountNumber}</div>
                  </td>
                  <td className="py-2.5 px-4 text-xs font-semibold">
                    <span className={t.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'}>
                      {t.type}
                    </span>
                    {t.status === 'REVERSED' && (
                      <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                        · REVERSED
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate" title={t.description}>
                    {t.description}
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
                    1 AED = ₹{Number(t.exchangeRate).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600">{t.createdByName}</td>
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
