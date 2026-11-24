import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../../context/AuthContext.tsx';

export function ActivityLogsPage() {
  const { apiFetch, notify } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadLogs = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        if (search.trim()) params.set('search', search.trim());
        if (entity !== 'ALL') params.set('entity', entity);
        if (action !== 'ALL') params.set('action', action);
        const res = await apiFetch(`/api/admin/activity-logs?${params.toString()}`);
        setLogs(res.logs || []);
        setPagination(res.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 });
      } catch (err: any) {
        const msg = err.message || 'Failed to load activity logs';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, page, search, entity, action, notify]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  useRealtimeRefresh(
    [
      'activity:updated',
      'ledger:updated',
      'accounts:updated',
      'rates:updated',
      'closing:updated',
      'staff:updated',
      'settings:updated',
      'support:updated',
    ],
    () => loadLogs(false)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">System Audit Trail</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Immutable log of every login, transaction creation, edit, reversal, rate change, closing, and settings update
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search user, entity ID, reason..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md"
          />
        </div>

        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by entity"
          className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="ALL">All Entities</option>
          <option value="Transaction">Transaction</option>
          <option value="DailyClosing">DailyClosing</option>
          <option value="ExchangeRate">ExchangeRate</option>
          <option value="Account">Account</option>
          <option value="User">User</option>
          <option value="Setting">Setting</option>
          <option value="SupportTicket">SupportTicket</option>
          <option value="System">System</option>
        </select>

        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE_TRANSACTION">CREATE_TRANSACTION</option>
            <option value="EDIT_TRANSACTION">EDIT_TRANSACTION</option>
            <option value="REVERSE_TRANSACTION">REVERSE_TRANSACTION</option>
            <option value="CLOSE_DAY">CLOSE_DAY</option>
            <option value="REOPEN_DAY">REOPEN_DAY</option>
            <option value="SET_EXCHANGE_RATE">SET_EXCHANGE_RATE</option>
            <option value="REFRESH_EXCHANGE_RATE">REFRESH_EXCHANGE_RATE</option>
            <option value="CREATE_ACCOUNT">CREATE_ACCOUNT</option>
            <option value="UPDATE_ACCOUNT">UPDATE_ACCOUNT</option>
            <option value="CREATE_STAFF">CREATE_STAFF</option>
            <option value="UPDATE_STAFF">UPDATE_STAFF</option>
            <option value="RESET_PASSWORD">RESET_PASSWORD</option>
            <option value="RECALCULATE_BALANCES">RECALCULATE_BALANCES</option>
            <option value="CREATE_SUPPORT_TICKET">CREATE_SUPPORT_TICKET</option>
            <option value="CREATE_PUBLIC_SUPPORT_TICKET">CREATE_PUBLIC_SUPPORT_TICKET</option>
            <option value="REPLY_SUPPORT_TICKET">REPLY_SUPPORT_TICKET</option>
            <option value="UPDATE_SUPPORT_TICKET">UPDATE_SUPPORT_TICKET</option>
            <option value="UPDATE_SETTINGS">UPDATE_SETTINGS</option>
            <option value="BOOTSTRAP_ADMIN">BOOTSTRAP_ADMIN</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
          </select>
          {(search || entity !== 'ALL' || action !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setEntity('ALL');
                setAction('ALL');
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap"
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
            onClick={() => loadLogs(true)}
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
                <th className="py-3 px-4 w-8" />
                <th className="py-3 px-4">Timestamp (GST)</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Audit Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((n) => (
                  <tr key={n}>
                    <td colSpan={6} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="even:bg-slate-50/60 hover:bg-violet-50/30 cursor-pointer"
                      >
                        <td className="py-2.5 px-4 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('en-GB', {
                            timeZone: 'Asia/Dubai',
                          })}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{log.userName}</div>
                          <div className="text-[11px] text-slate-400">{log.userRole}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-violet-800">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-700">
                          {log.entity} #{log.entityId}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                          {log.reason || '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-[11px] font-semibold text-slate-500 mb-1">
                                  Before Snapshot
                                </div>
                                <pre className="p-3 bg-white border border-slate-200 rounded text-[11px] font-mono overflow-x-auto max-h-56 text-slate-700">
                                  {log.beforeSnapshot
                                    ? JSON.stringify(log.beforeSnapshot, null, 2)
                                    : 'null'}
                                </pre>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold text-slate-500 mb-1">
                                  After Snapshot
                                </div>
                                <pre className="p-3 bg-white border border-slate-200 rounded text-[11px] font-mono overflow-x-auto max-h-56 text-slate-700">
                                  {log.afterSnapshot
                                    ? JSON.stringify(log.afterSnapshot, null, 2)
                                    : 'null'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div>
            Page <span className="font-mono font-semibold">{pagination.page}</span> of{' '}
            <span className="font-mono font-semibold">{pagination.totalPages}</span> (
            <span className="font-mono">{pagination.total}</span> records)
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
    </div>
  );
}
