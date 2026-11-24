import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CalendarClock,
  Check,
  Copy,
  DatabaseBackup,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../context/AuthContext.tsx';
import { formatAED, formatDateTimeInZone, formatINR, getDubaiDateString } from '../lib/money.ts';

interface MonthEndStatus {
  currentDate: string;
  currentMonth: string;
  periodStart: string;
  periodEnd: string;
  daysInMonth: number;
  dayOfMonth: number;
  daysRemainingInMonth: number;
  isMonthEndToday: boolean;
  isNearMonthEnd: boolean;
  timezone: string;
}

interface MonthlyArchiveRow {
  id: number;
  month: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  generationType: string;
  accountCount: number;
  transactionCount: number;
  dailyClosingCount: number;
  exchangeRateCount: number;
  supportTicketCount: number;
  totalCreditsAed: string;
  totalDebitsAed: string;
  totalCreditsInr: string;
  totalDebitsInr: string;
  closingBalanceAed: string;
  sha256Checksum: string;
  generatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export function MonthlyBackupsPage() {
  const { apiFetch, downloadFile, notify, primaryCurrency, settings, user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(getDubaiDateString().slice(0, 7));
  const [monthEndStatus, setMonthEndStatus] = useState<MonthEndStatus | null>(null);
  const [archives, setArchives] = useState<MonthlyArchiveRow[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generatingMonth, setGeneratingMonth] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth);

  const loadBackups = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch('/api/backups/monthly');
        setMonthEndStatus(res.monthEndStatus || null);
        setArchives(res.archives || []);
        setAvailableMonths(res.availableMonths || []);
      } catch (err: any) {
        const msg = err.message || 'Failed to load monthly backups';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    loadBackups(true);
  }, [loadBackups]);

  useRealtimeRefresh(['backups:updated', 'ledger:updated', 'closing:updated'], () => {
    loadBackups(false);
  });

  const handleGenerate = async (month: string, forceRebuild = false) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      notify('error', 'Select a valid month (YYYY-MM).');
      return;
    }
    setGeneratingMonth(month);
    try {
      const res = await apiFetch('/api/backups/monthly/generate', {
        method: 'POST',
        body: JSON.stringify({ month, forceRebuild }),
      });
      if (res.wasLockedPreserved) {
        notify('info', `Preserved immutable locked archive for ${month}.`);
      } else {
        notify('success', `Monthly backup snapshot saved for ${month}.`);
      }
      await loadBackups(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to generate monthly snapshot');
    } finally {
      setGeneratingMonth(null);
    }
  };

  const handleDownload = async (month: string, format: 'xlsx' | 'json' | 'pdf') => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      notify('error', 'Select a valid month (YYYY-MM).');
      return;
    }
    const key = `${month}:${format}`;
    setDownloadingKey(key);
    try {
      await downloadFile(
        `/api/backups/monthly/${month}/download?format=${format}`,
        `webx-monthly-backup-${month}.${format}`
      );
      notify('success', `Downloaded ${month} complete backup (${format.toUpperCase()})`);
      await loadBackups(false);
    } catch (err: any) {
      notify('error', err.message || `Failed to download ${format.toUpperCase()} backup`);
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleCopyChecksum = async (checksum: string) => {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopiedChecksum(checksum);
      setTimeout(() => setCopiedChecksum((c) => (c === checksum ? null : c)), 2000);
    } catch {
      notify('info', `Checksum: ${checksum}`);
    }
  };

  const archivedMonthSet = new Set(archives.map((a) => a.month));
  const unarchivedMonths = availableMonths.filter((m) => !archivedMonthSet.has(m));

  const formatMoney = (aed: string, inr: string) =>
    primaryCurrency === 'INR' ? formatINR(inr) : formatAED(aed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Monthly Data Backups &amp; Archives
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Persistent end-of-month ledger snapshots stored in Cloud SQL with instant Excel, JSON &amp; PDF downloads
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Select backup month"
            className="px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
          />
          <button
            type="button"
            disabled={!monthValid || generatingMonth !== null}
            onClick={() => handleGenerate(selectedMonth, false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md transition-colors disabled:opacity-50"
          >
            <DatabaseBackup className="w-4 h-4" />
            {generatingMonth === selectedMonth ? 'Snapshotting...' : 'Snapshot Month'}
          </button>
        </div>
      </div>

      {/* Month-End Readiness & Zero-Data-Loss Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className={`lg:col-span-2 rounded-lg border p-4 flex flex-col justify-between gap-3 ${
            monthEndStatus?.isMonthEndToday
              ? 'bg-emerald-50 border-emerald-200'
              : monthEndStatus?.isNearMonthEnd
                ? 'bg-amber-50 border-amber-200'
                : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-md shrink-0 ${
                  monthEndStatus?.isMonthEndToday
                    ? 'bg-emerald-100 text-emerald-800'
                    : monthEndStatus?.isNearMonthEnd
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-50 text-blue-700'
                }`}
              >
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {monthEndStatus?.isMonthEndToday
                    ? `Month-End Closing & Backup Ready (${monthEndStatus.currentMonth})`
                    : monthEndStatus?.isNearMonthEnd
                      ? `Month-End Backup Window (${monthEndStatus.daysRemainingInMonth} day${monthEndStatus.daysRemainingInMonth === 1 ? '' : 's'} remaining)`
                      : `Active GST Accounting Month: ${monthEndStatus?.currentMonth || selectedMonth}`}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  {monthEndStatus
                    ? `Period ${monthEndStatus.periodStart} to ${monthEndStatus.periodEnd} (${monthEndStatus.timezone}) · Automated month-end archival captures all accounts, AED/INR transactions, daily closings, and FX rates.`
                    : 'Automated month-end archival persists complete ledger snapshots directly in PostgreSQL.'}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-white/80 border border-slate-200 text-slate-700 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              Zero-Delete Audit DB
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
            <span className="text-xs text-slate-600">
              Download complete archive for <strong className="font-mono">{selectedMonth}</strong>:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!monthValid || downloadingKey !== null}
                onClick={() => handleDownload(selectedMonth, 'xlsx')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                {downloadingKey === `${selectedMonth}:xlsx` ? 'Exporting...' : 'Excel (.xlsx)'}
              </button>
              <button
                type="button"
                disabled={!monthValid || downloadingKey !== null}
                onClick={() => handleDownload(selectedMonth, 'json')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md disabled:opacity-50"
              >
                <FileJson className="w-3.5 h-3.5 text-blue-700" />
                {downloadingKey === `${selectedMonth}:json` ? 'Exporting...' : 'JSON Archive (.json)'}
              </button>
              <button
                type="button"
                disabled={!monthValid || downloadingKey !== null}
                onClick={() => handleDownload(selectedMonth, 'pdf')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                {downloadingKey === `${selectedMonth}:pdf` ? 'Exporting...' : 'PDF Statement (.pdf)'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Data Integrity &amp; Retention
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {archives.length} Archive{archives.length === 1 ? '' : 's'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Persisted in Cloud SQL PostgreSQL with SHA-256 checksums and non-destructive ledger history.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Hard Transaction Deletes</span>
              <span className="font-semibold text-emerald-700">Disabled (Reversal Only)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Timezone Standard</span>
              <span className="font-mono text-slate-800">{settings?.timezone || 'Asia/Dubai'}</span>
            </div>
          </div>
        </div>
      </div>

      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadBackups(true)}
            className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Unarchived Months Quick Banner */}
      {!loading && unarchivedMonths.length > 0 && (
        <div className="bg-slate-900 text-white rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <span className="font-semibold">Detected Unarchived Month(s): </span>
            <span className="text-slate-300 font-mono">{unarchivedMonths.join(', ')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unarchivedMonths.slice(0, 3).map((m) => (
              <button
                key={m}
                type="button"
                disabled={generatingMonth !== null}
                onClick={() => handleGenerate(m, false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                Snapshot {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Persisted Archives Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Stored Monthly Backup Snapshots
          </h2>
          <button
            type="button"
            onClick={() => loadBackups(false)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="h-56 animate-pulse bg-slate-50" />
        ) : archives.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <Archive className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-700">
              No monthly snapshots saved yet
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click &quot;Snapshot Month&quot; or download any format above to generate and store a checksum-verified monthly archive for {selectedMonth}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Month</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Records</th>
                  <th className="py-2.5 px-3 text-right">Credits</th>
                  <th className="py-2.5 px-3 text-right">Debits</th>
                  <th className="py-2.5 px-3">SHA-256 Checksum</th>
                  <th className="py-2.5 px-3">Updated (GST)</th>
                  <th className="py-2.5 px-3 text-right">Download Formats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {archives.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{a.monthLabel}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {a.periodStart} → {a.periodEnd}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {a.status === 'SNAPSHOT_LOCKED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-50 text-violet-800 font-semibold text-[11px]">
                          <Lock className="w-3 h-3" />
                          Month-End Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold text-[11px]">
                          <Check className="w-3 h-3" />
                          Available
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {a.generationType === 'AUTO_MONTH_END' ? 'Auto Month-End' : a.generatedByName}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      <div>{a.transactionCount} entries</div>
                      <div className="text-[10px] text-slate-400">
                        {a.accountCount} acc · {a.dailyClosingCount} closings
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatMoney(a.totalCreditsAed, a.totalCreditsInr)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                      {formatMoney(a.totalDebitsAed, a.totalDebitsInr)}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => handleCopyChecksum(a.sha256Checksum)}
                        title="Copy full SHA-256 integrity checksum"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-mono text-[11px] text-slate-700"
                      >
                        <span>{a.sha256Checksum.slice(0, 12)}…</span>
                        {copiedChecksum === a.sha256Checksum ? (
                          <Check className="w-3 h-3 text-emerald-700" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTimeInZone(a.updatedAt, settings?.timezone)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={downloadingKey !== null}
                          onClick={() => handleDownload(a.month, 'xlsx')}
                          title="Download Complete Excel Backup"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" />
                          XLSX
                        </button>
                        <button
                          type="button"
                          disabled={downloadingKey !== null}
                          onClick={() => handleDownload(a.month, 'json')}
                          title="Download Full JSON Archive"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" />
                          JSON
                        </button>
                        <button
                          type="button"
                          disabled={downloadingKey !== null}
                          onClick={() => handleDownload(a.month, 'pdf')}
                          title="Download Monthly PDF Statement"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" />
                          PDF
                        </button>
                        {isAdmin && a.status === 'SNAPSHOT_LOCKED' && (
                          <button
                            type="button"
                            disabled={generatingMonth !== null}
                            onClick={() => handleGenerate(a.month, true)}
                            title="Admin: Rebuild Locked Snapshot"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
