import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Headphones,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageSquare,
  PlusCircle,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth, useRealtimeRefresh } from '../context/AuthContext.tsx';
import {
  OFFICIAL_SUPPORT_EMAIL,
  SUPPORT_PRIORITIES,
  SUPPORT_SERVICES,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
  buildSupportMailtoUrl,
  getSupportServiceMeta,
} from '../lib/supportCatalog.ts';
import { SupportRequestComposer } from '../components/SupportRequestComposer.tsx';

const SERVICE_ICONS: Record<SupportCategory, React.ComponentType<{ className?: string }>> = {
  CUSTOMER_SUPPORT: Headphones,
  TECHNICAL_SUPPORT: Wrench,
  STAFF_ONBOARDING: UserPlus,
  ACCOUNT_SUPPORT: KeyRound,
  ADMIN_SUPPORT: SlidersHorizontal,
  BILLING_PAYMENT: CreditCard,
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'IN_PROGRESS':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'RESOLVED':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-red-50 text-red-800 border-red-200';
    case 'HIGH':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'LOW':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

interface SupportCenterPageProps {
  adminMode?: boolean;
  onNavigate?: (page: string) => void;
}

export function SupportCenterPage({ adminMode = false, onNavigate }: SupportCenterPageProps) {
  const { apiFetch, notify, user } = useAuth();
  const [supportEmail, setSupportEmail] = useState(OFFICIAL_SUPPORT_EMAIL);
  const [emailRelayConfigured, setEmailRelayConfigured] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    urgentOrHigh: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerCategory, setComposerCategory] =
    useState<SupportCategory>('CUSTOMER_SUPPORT');

  // Ticket detail modal state
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Admin triage state
  const [adminStatus, setAdminStatus] = useState<SupportStatus>('OPEN');
  const [adminPriority, setAdminPriority] = useState<SupportPriority>('NORMAL');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);

  const loadTickets = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) setLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams();
        if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (search.trim()) params.set('search', search.trim());

        const res = await apiFetch(`/api/support/tickets?${params.toString()}`);
        setSupportEmail(res.supportEmail || OFFICIAL_SUPPORT_EMAIL);
        setEmailRelayConfigured(Boolean(res.emailRelayConfigured));
        setTickets(res.tickets || []);
        if (res.summary) setSummary(res.summary);
      } catch (err: any) {
        const msg = err.message || 'Failed to load support tickets';
        setLoadError(msg);
        if (showSkeleton) notify('error', msg);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [apiFetch, categoryFilter, statusFilter, search, notify]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTickets(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadTickets]);

  const openTicketDetail = useCallback(
    async (ticketId: number, silent = false) => {
      if (!silent) setDetailLoading(true);
      try {
        const res = await apiFetch(`/api/support/tickets/${ticketId}`);
        setSelectedTicket(res.ticket);
        setMessages(res.messages || []);
        setAdminStatus(res.ticket.status);
        setAdminPriority(res.ticket.priority);
        setResolutionNotes(res.ticket.resolutionNotes || '');
      } catch (err: any) {
        if (!silent) notify('error', err.message || 'Unable to load ticket thread');
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    if (!composerOpen && !selectedTicket && !detailLoading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sendingReply && !updatingTicket) {
        e.preventDefault();
        setComposerOpen(false);
        setSelectedTicket(null);
        setMessages([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composerOpen, selectedTicket, detailLoading, sendingReply, updatingTicket]);

  useRealtimeRefresh(['support:updated'], () => {
    loadTickets(false);
    if (selectedTicket?.id) {
      openTicketDetail(selectedTicket.id, true);
    }
  });

  const copyOfficialEmail = async () => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      notify('success', `Copied ${supportEmail}`);
    } catch {
      notify('info', `Support email: ${supportEmail}`);
    }
  };

  const handleOpenCategoryRequest = (cat: SupportCategory) => {
    setComposerCategory(cat);
    setComposerOpen(true);
  };

  const handlePostReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || replyText.trim().length < 2) return;
    setSendingReply(true);
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText('');
      notify('success', 'Reply added to ticket thread');
      await openTicketDetail(selectedTicket.id);
      await loadTickets(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleAdminUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    setUpdatingTicket(true);
    try {
      await apiFetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: adminStatus,
          priority: adminPriority,
          resolutionNotes: resolutionNotes.trim(),
          assignToMe: true,
        }),
      });
      notify('success', `Ticket ${selectedTicket.ticketNumber} updated`);
      await openTicketDetail(selectedTicket.id);
      await loadTickets(false);
    } catch (err: any) {
      notify('error', err.message || 'Failed to update ticket');
    } finally {
      setUpdatingTicket(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header & Official Contact Strip */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {adminMode ? 'Support Desk & Request Oversight' : 'Help & Support Center'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {adminMode
              ? `Manage staff, onboarding, account, technical, customer, and billing inquiries routed to ${supportEmail}`
              : `Dedicated assistance across customer, technical, onboarding, account, admin, and billing queries via ${supportEmail}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyOfficialEmail}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            {supportEmail}
          </button>
          <a
            href={buildSupportMailtoUrl({
              category: 'CUSTOMER_SUPPORT',
              requesterName: user?.name,
              requesterEmail: user?.email,
            })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-blue-700 rounded-md"
          >
            <Mail className="w-3.5 h-3.5" />
            Email Directly
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={() => handleOpenCategoryRequest('CUSTOMER_SUPPORT')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-md transition-colors ${
              adminMode
                ? 'bg-violet-700 hover:bg-violet-800'
                : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            New Support Request
          </button>
        </div>
      </div>

      {/* Official Email Dispatch Info Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
              adminMode ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Official Support Routing: <span className="font-mono text-blue-700">{supportEmail}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {emailRelayConfigured
                ? 'Automated SMTP mail dispatch is active — new requests and replies send immediately to adwebcomicllp@gmail.com.'
                : 'Requests are saved in WebX Support Desk with instant pre-addressed email handoff to adwebcomicllp@gmail.com.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-500">Open:</span>{' '}
            <span className="font-mono font-semibold text-blue-700">{summary.open}</span>
          </div>
          <div>
            <span className="text-slate-500">In Progress:</span>{' '}
            <span className="font-mono font-semibold text-amber-700">{summary.inProgress}</span>
          </div>
          <div>
            <span className="text-slate-500">Resolved:</span>{' '}
            <span className="font-mono font-semibold text-emerald-700">{summary.resolved}</span>
          </div>
        </div>
      </div>

      {/* Admin KPI Cards */}
      {adminMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Total Logged Requests</div>
            <div className="text-2xl font-semibold font-mono text-slate-900 mt-1">
              {summary.total}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Awaiting Triage (Open)</div>
            <div className="text-2xl font-semibold font-mono text-blue-700 mt-1">
              {summary.open}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Active High / Urgent</div>
            <div className="text-2xl font-semibold font-mono text-red-700 mt-1">
              {summary.urgentOrHigh}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Resolved & Closed</div>
            <div className="text-2xl font-semibold font-mono text-emerald-700 mt-1">
              {summary.resolved}
            </div>
          </div>
        </div>
      )}

      {/* All 6 Essential Support Service Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Support Services Directory
          </h2>
          <span className="text-xs text-slate-500">
            Select a specialized service below to submit or email directly
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SUPPORT_SERVICES.map((svc) => {
            const Icon = SERVICE_ICONS[svc.id];
            const directHref = buildSupportMailtoUrl({
              category: svc.id,
              requesterName: user?.name,
              requesterEmail: user?.email,
            });
            return (
              <div
                key={svc.id}
                className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4 hover:border-blue-300 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                          adminMode
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {svc.title}
                        </h3>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>{svc.responseTarget}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {svc.description}
                  </p>

                  <ul className="space-y-1 pt-1">
                    {svc.scopeBullets.map((item) => (
                      <li
                        key={item}
                        className="text-[11px] text-slate-500 flex items-center gap-1.5"
                      >
                        <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenCategoryRequest(svc.id)}
                    className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${
                      adminMode
                        ? 'bg-violet-700 hover:bg-violet-800'
                        : 'bg-blue-700 hover:bg-blue-800'
                    }`}
                  >
                    Create Request
                  </button>
                  <a
                    href={directHref}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-700"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email Desk
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ticket Queue & Workflow History */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {adminMode ? 'All Workspace & Pre-Login Support Tickets' : 'My Support Requests'}
            </h2>
            <p className="text-xs text-slate-500">
              Track responses, updates, and direct mail handoff to {supportEmail}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket # or subject..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by support service"
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="ALL">All Services</option>
              {SUPPORT_SERVICES.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.title}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by ticket status"
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="ALL">All Statuses</option>
              {SUPPORT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadError && !loading && (
          <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-red-800">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => loadTickets(true)}
              className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded hover:bg-red-100 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`text-xs font-semibold border-b ${
                  adminMode
                    ? 'bg-violet-50/80 text-violet-950 border-violet-100'
                    : 'bg-blue-50 text-blue-950 border-blue-100'
                }`}
              >
                <th className="py-2.5 px-4">Ticket #</th>
                <th className="py-2.5 px-4">Service</th>
                <th className="py-2.5 px-4">Subject</th>
                {adminMode && <th className="py-2.5 px-4">Requester</th>}
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Updated</th>
                <th className="py-2.5 px-4 text-right">Workflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                [1, 2, 3].map((n) => (
                  <tr key={n}>
                    <td colSpan={adminMode ? 8 : 7} className="py-3.5 px-4">
                      <div className="h-6 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={adminMode ? 8 : 7} className="py-12 text-center text-slate-500">
                    No support tickets found matching these filters. Use any service card above or click{' '}
                    <span className="font-medium text-slate-700">New Support Request</span> to contact{' '}
                    <span className="font-mono text-blue-700">{supportEmail}</span>.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const svc = getSupportServiceMeta(t.category);
                  return (
                    <tr key={t.id} className="even:bg-slate-50/60 hover:bg-blue-50/30">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {t.ticketNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {svc.shortLabel}
                      </td>
                      <td className="py-3 px-4 text-slate-900 max-w-xs truncate">
                        {t.subject}
                      </td>
                      {adminMode && (
                        <td className="py-3 px-4 text-slate-600">
                          <div className="font-medium text-slate-800">{t.requesterName}</div>
                          <div className="text-[11px] text-slate-500">{t.requesterEmail}</div>
                        </td>
                      )}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded ${priorityBadgeClass(
                            t.priority
                          )}`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded ${statusBadgeClass(
                            t.status
                          )}`}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(t.updatedAt).toLocaleString('en-GB', {
                          timeZone: 'Asia/Dubai',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openTicketDetail(t.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Open Thread
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Support Request Modal */}
      {composerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setComposerOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Submit Support Request
                </h3>
                <p className="text-xs text-slate-500">
                  Routed directly to {supportEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close support request modal"
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 max-h-[80vh] overflow-y-auto">
              <SupportRequestComposer
                mode="authenticated"
                initialCategory={composerCategory}
                onSubmitted={() => {
                  loadTickets(false);
                }}
                onCancel={() => setComposerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ticket Detail & Workflow Drawer Modal */}
      {(selectedTicket || detailLoading) && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (!sendingReply && !updatingTicket && e.target === e.currentTarget) {
              setSelectedTicket(null);
              setMessages([]);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-auto">
            {detailLoading && !selectedTicket ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Loading support ticket...
              </div>
            ) : (
              selectedTicket && (
                <>
                  <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/70">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700">
                          {selectedTicket.ticketNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${statusBadgeClass(
                            selectedTicket.status
                          )}`}
                        >
                          {selectedTicket.status.replace('_', ' ')}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${priorityBadgeClass(
                            selectedTicket.priority
                          )}`}
                        >
                          {selectedTicket.priority}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mt-1">
                        {selectedTicket.subject}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {getSupportServiceMeta(selectedTicket.category).title} · Requester:{' '}
                        {selectedTicket.requesterName} ({selectedTicket.requesterEmail}) · Routed to{' '}
                        <span className="font-mono text-blue-700">
                          {selectedTicket.routedToEmail}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTicket(null);
                        setMessages([]);
                      }}
                      aria-label="Close ticket detail modal"
                      className="p-1 text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 max-h-[75vh] overflow-y-auto space-y-5">
                    {selectedTicket.metadata?.detailReference && (
                      <div className="bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5 text-xs">
                        <span className="font-semibold text-slate-700">
                          {getSupportServiceMeta(selectedTicket.category).detailFieldLabel}:
                        </span>{' '}
                        <span className="text-slate-900">
                          {selectedTicket.metadata.detailReference}
                        </span>
                      </div>
                    )}

                    {/* Quick Staff Provisioning Shortcut for Admin on Onboarding / Account tickets */}
                    {isAdmin &&
                      onNavigate &&
                      (selectedTicket.category === 'STAFF_ONBOARDING' ||
                        selectedTicket.category === 'ACCOUNT_SUPPORT') && (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-violet-50 border border-violet-200 rounded-md px-4 py-3 text-xs text-violet-950">
                          <span>
                            Quick Action: Create staff account, assign role, or reset password in Staff Management.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(null);
                              onNavigate('admin-staff');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-700 hover:bg-violet-800 text-white font-medium rounded"
                          >
                            <Users className="w-3.5 h-3.5" />
                            Open Staff Management
                          </button>
                        </div>
                      )}

                    {/* Message Thread */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Conversation History
                      </div>
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                            m.senderRole === 'ADMIN'
                              ? 'bg-violet-50/50 border-violet-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {m.senderName}{' '}
                              <span
                                className={`ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  m.senderRole === 'ADMIN'
                                    ? 'bg-violet-100 text-violet-800'
                                    : m.senderRole === 'STAFF'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {m.senderRole}
                              </span>
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {new Date(m.createdAt).toLocaleString('en-GB', {
                                timeZone: 'Asia/Dubai',
                              })}
                            </span>
                          </div>
                          <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {m.message}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reply Form */}
                    <form onSubmit={handlePostReply} className="space-y-2.5 pt-2 border-t border-slate-200">
                      <label className="block text-xs font-medium text-slate-700">
                        Add Reply to Ticket Thread
                      </label>
                      <textarea
                        rows={3}
                        required
                        minLength={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write an update or follow-up message..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          href={buildSupportMailtoUrl({
                            category: selectedTicket.category,
                            subject: selectedTicket.subject,
                            ticketNumber: selectedTicket.ticketNumber,
                            requesterName: selectedTicket.requesterName,
                            requesterEmail: selectedTicket.requesterEmail,
                            description: replyText || selectedTicket.description,
                          })}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Send Email via {supportEmail}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="submit"
                          disabled={sendingReply || replyText.trim().length < 2}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sendingReply ? 'Sending...' : 'Post Reply'}
                        </button>
                      </div>
                    </form>

                    {/* Admin Triage Controls */}
                    {isAdmin && (
                      <form
                        onSubmit={handleAdminUpdateTicket}
                        className="bg-violet-50/50 border border-violet-200 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-violet-950">
                          <CheckCircle2 className="w-4 h-4 text-violet-700" />
                          Administrator Workflow Controls
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Ticket Status
                            </label>
                            <select
                              value={adminStatus}
                              onChange={(e) => setAdminStatus(e.target.value as SupportStatus)}
                              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                            >
                              {SUPPORT_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Priority
                            </label>
                            <select
                              value={adminPriority}
                              onChange={(e) => setAdminPriority(e.target.value as SupportPriority)}
                              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                            >
                              {SUPPORT_PRIORITIES.map((pr) => (
                                <option key={pr} value={pr}>
                                  {pr}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            Resolution / Internal Audit Notes
                          </label>
                          <input
                            type="text"
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            placeholder="Summarize resolution or action taken..."
                            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={updatingTicket}
                            className="px-4 py-1.5 text-xs font-medium bg-violet-700 hover:bg-violet-800 text-white rounded-md disabled:opacity-50"
                          >
                            {updatingTicket ? 'Updating...' : 'Save Status & Assign to Me'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
