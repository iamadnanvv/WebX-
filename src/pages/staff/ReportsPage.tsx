import { useCallback, useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';
import {
  formatAED,
  formatINR,
  getDubaiDateDaysAgo,
  getDubaiDateString,
} from '../../lib/money.ts';

export function ReportsPage({ adminMode = false }: { adminMode?: boolean }) {
  const { apiFetch, downloadFile, notify, settings, user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(getDubaiDateDaysAgo(14));
  const [endDate, setEndDate] = useState(getDubaiDateString());
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('ALL');
  const [reportMode, setReportMode] = useState<'DETAILED' | 'DAILY' | 'MONTHLY' | 'ACCOUNT'>(
    adminMode ? 'DAILY' : 'DETAILED'
  );
  const [currencyView, setCurrencyView] = useState<'BOTH' | 'AED' | 'INR'>('BOTH');
  const [includeRateVariance, setIncludeRateVariance] = useState(false);

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const datesIncomplete =
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate);
  const dateRangeInvalid = Boolean(!datesIncomplete && startDate > endDate);

  useEffect(() => {
    apiFetch('/api/accounts')
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => {});
  }, [apiFetch]);

  useRealtimeRefresh(['accounts:updated'], () => {
    apiFetch('/api/accounts')
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => {});
  });

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (accountId) params.set('accountId', accountId);
    if (type !== 'ALL') params.set('type', type);
    params.set('reportMode', reportMode);
    params.set('currencyView', currencyView);
    if (includeRateVariance) params.set('includeRateVariance', 'true');
    return params.toString();
  }, [startDate, endDate, accountId, type, reportMode, currencyView, includeRateVariance]);

  const loadReport = useCallback(async (showSkeleton = true) => {
    if (datesIncomplete || dateRangeInvalid) {
      setLoading(false);
      setLoadError('');
      return;
    }
    if (showSkeleton) setLoading(true);
    setLoadError('');
    try {
      const qs = buildQueryString();
      const res = await apiFetch(`/api/reports/data?${qs}`);
      setReport(res.report);
    } catch (err: any) {
      const msg = err.message || 'Failed to load report';
      setLoadError(msg);
      if (showSkeleton) notify('error', msg);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [apiFetch, buildQueryString, datesIncomplete, dateRangeInvalid, notify]);

  useEffect(() => {
    loadReport(true);
  }, [loadReport]);

  useRealtimeRefresh(['ledger:updated', 'rates:updated'], () => {
    loadReport(false);
  });

  const canExport = user?.role === 'ADMIN' || Boolean(settings?.staffCanExport);

  const handleExport = async (kind: 'pdf' | 'excel') => {
    if (datesIncomplete) {
      notify('error', 'Please enter valid From and To dates.');
      return;
    }
    if (dateRangeInvalid) {
      notify('error', 'From date cannot be after To date.');
      return;
    }
    setExporting(kind);
    try {
      const qs = buildQueryString();
      const url = kind === 'pdf' ? `/api/reports/export/pdf?${qs}` : `/api/reports/export/excel?${qs}`;
      const ext = kind === 'pdf' ? 'pdf' : 'xlsx';
      await downloadFile(url, `webx-report-${startDate}-to-${endDate}.${ext}`);
      notify('success', `${kind.toUpperCase()} report downloaded`);
    } catch (err: any) {
      notify('error', err.message || `Failed to export ${kind.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {adminMode ? 'Comprehensive Financial Reporting' : 'Ledger Reports & Exports'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Multi-currency AED/INR ledger exports with entry-time exchange rates · Asia/Dubai (GST)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <>
              <button
                type="button"
                disabled={exporting !== null || dateRangeInvalid}
                onClick={() => handleExport('pdf')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md transition-colors disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-red-700" />
                {exporting === 'pdf' ? 'Generating PDF...' : 'Download PDF'}
              </button>
              <button
                type="button"
                disabled={exporting !== null || dateRangeInvalid}
                onClick={() => handleExport('excel')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                {exporting === 'excel' ? 'Generating Excel...' : 'Export Excel'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print View
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3 no-print">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">From (GST)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-md"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">To (GST)</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-md"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Filter report by account"
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountNumber} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter report by transaction type"
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
          >
            <option value="ALL">All Types</option>
            <option value="CREDIT">Credits</option>
            <option value="DEBIT">Debits</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Columns</label>
          <select
            value={currencyView}
            onChange={(e) => setCurrencyView(e.target.value as any)}
            aria-label="Select report currency columns"
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
          >
            <option value="BOTH">AED + INR (Both)</option>
            <option value="AED">AED Only</option>
            <option value="INR">INR Only</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Report Mode</label>
          <select
            value={reportMode}
            onChange={(e) => setReportMode(e.target.value as any)}
            aria-label="Select report mode"
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
          >
            <option value="DETAILED">Detailed Ledger</option>
            <option value="DAILY">Daily Statement</option>
            <option value="MONTHLY">Monthly Statement</option>
            <option value="ACCOUNT">Account-Wise Statement</option>
          </select>
        </div>

        {adminMode && (
          <div className="md:col-span-6 flex items-center gap-2 pt-1 border-t border-slate-100">
            <input
              id="rateVarianceToggle"
              type="checkbox"
              checked={includeRateVariance}
              onChange={(e) => setIncludeRateVariance(e.target.checked)}
              className="rounded border-slate-300 text-violet-700 focus:ring-violet-600"
            />
            <label htmlFor="rateVarianceToggle" className="text-xs font-medium text-slate-700">
              Include Rate-Variance Analysis (compares historical entry-time INR against today&apos;s reference rate)
            </label>
          </div>
        )}
      </div>

      {dateRangeInvalid && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900 no-print">
          <span>&quot;From (GST)&quot; date cannot be later than &quot;To (GST)&quot; date.</span>
          <button
            type="button"
            onClick={() => {
              setStartDate(getDubaiDateDaysAgo(14));
              setEndDate(getDubaiDateString());
            }}
            className="px-3 py-1.5 font-medium bg-white border border-amber-200 rounded hover:bg-amber-100 shrink-0"
          >
            Reset Range
          </button>
        </div>
      )}

      {loadError && !loading && !dateRangeInvalid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800 no-print">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadReport(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Report Summary & Printable Body */}
      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ) : (
        report && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    WebX — {report.title}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {report.subtitle} · Range: {report.dateRangeLabel}
                    {report.currentReferenceRate
                      ? ` · Reference Rate: 1 AED = ₹${Number(report.currentReferenceRate).toFixed(4)}`
                      : ''}
                  </p>
                </div>
                <div className="text-xs font-mono text-slate-500">
                  {report.rows.length} entries
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <div>
                  <div className="text-xs text-slate-500">Total Credits</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-emerald-700">
                    {currencyView !== 'INR' && formatAED(report.totals.totalCreditsAed)}
                    {currencyView === 'BOTH' && ' · '}
                    {currencyView !== 'AED' && formatINR(report.totals.totalCreditsInr)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total Debits</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-red-700">
                    {currencyView !== 'INR' && formatAED(report.totals.totalDebitsAed)}
                    {currencyView === 'BOTH' && ' · '}
                    {currencyView !== 'AED' && formatINR(report.totals.totalDebitsInr)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Net Movement</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
                    {currencyView !== 'INR' && formatAED(report.totals.netAed)}
                    {currencyView === 'BOTH' && ' · '}
                    {currencyView !== 'AED' && formatINR(report.totals.netInr)}
                  </div>
                </div>
              </div>
            </div>

            {report.summaryGroups && report.summaryGroups.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                    {reportMode === 'ACCOUNT'
                      ? 'Account-Wise Summary Statement'
                      : reportMode === 'MONTHLY'
                        ? 'Monthly Summary Statement'
                        : 'Daily Summary Statement'}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {report.summaryGroups.length} group(s)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                        <th className="py-2.5 px-3">
                          {reportMode === 'ACCOUNT'
                            ? 'Account'
                            : reportMode === 'MONTHLY'
                              ? 'Month (GST)'
                              : 'Date (GST)'}
                        </th>
                        <th className="py-2.5 px-3 text-right">Entries</th>
                        {(currencyView === 'AED' || currencyView === 'BOTH') && (
                          <>
                            <th className="py-2.5 px-3 text-right">Credits (AED)</th>
                            <th className="py-2.5 px-3 text-right">Debits (AED)</th>
                            <th className="py-2.5 px-3 text-right">Net (AED)</th>
                          </>
                        )}
                        {(currencyView === 'INR' || currencyView === 'BOTH') && (
                          <>
                            <th className="py-2.5 px-3 text-right">Credits (INR)</th>
                            <th className="py-2.5 px-3 text-right">Debits (INR)</th>
                            <th className="py-2.5 px-3 text-right">Net (INR)</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {report.summaryGroups.map((g: any) => (
                        <tr key={g.key} className="even:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-medium text-slate-900">{g.label}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {g.entryCount}
                          </td>
                          {(currencyView === 'AED' || currencyView === 'BOTH') && (
                            <>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                                {formatAED(g.creditsAed)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                                {formatAED(g.debitsAed)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                {formatAED(g.netAed)}
                              </td>
                            </>
                          )}
                          {(currencyView === 'INR' || currencyView === 'BOTH') && (
                            <>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                                {formatINR(g.creditsInr)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                                {formatINR(g.debitsInr)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                {formatINR(g.netInr)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-blue-50 text-blue-950 text-xs font-semibold border-b border-blue-100">
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Account</th>
                      <th className="py-2.5 px-3">Type</th>
                      {(currencyView === 'AED' || currencyView === 'BOTH') && (
                        <th className="py-2.5 px-3 text-right">AED Amount</th>
                      )}
                      <th className="py-2.5 px-3 text-right">Rate Applied</th>
                      {(currencyView === 'INR' || currencyView === 'BOTH') && (
                        <th className="py-2.5 px-3 text-right">INR Equivalent</th>
                      )}
                      {includeRateVariance && (
                        <th className="py-2.5 px-3 text-right">Rate Variance (INR)</th>
                      )}
                      <th className="py-2.5 px-3 text-right">Run Bal (AED)</th>
                      <th className="py-2.5 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-500">
                          No entries found for this reporting period.
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r: any) => {
                        let varianceInr: string | null = null;
                        if (includeRateVariance && report.currentReferenceRate) {
                          const atCurr = new Decimal(r.amount).mul(report.currentReferenceRate);
                          varianceInr = atCurr
                            .minus(r.convertedAmountInr)
                            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                            .toFixed(2);
                        }
                        return (
                          <tr key={r.id} className="even:bg-slate-50/60">
                            <td className="py-2.5 px-3 font-mono text-slate-500">#{r.id}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                              {r.date}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              {r.accountName}
                            </td>
                            <td className="py-2.5 px-3 font-semibold">
                              <span
                                className={
                                  r.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                                }
                              >
                                {r.type}
                              </span>
                            </td>
                            {(currencyView === 'AED' || currencyView === 'BOTH') && (
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {formatAED(r.amount)}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              1 AED = ₹{Number(r.exchangeRate).toFixed(2)} ({r.rateDate})
                            </td>
                            {(currencyView === 'INR' || currencyView === 'BOTH') && (
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {formatINR(r.convertedAmountInr)}
                              </td>
                            )}
                            {includeRateVariance && (
                              <td
                                className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                                  varianceInr === null
                                    ? 'text-slate-400'
                                    : Number(varianceInr) >= 0
                                      ? 'text-emerald-700'
                                      : 'text-red-700'
                                }`}
                              >
                                {varianceInr === null ? '—' : formatINR(varianceInr)}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {formatAED(r.runningBalance)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                              {r.description}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
