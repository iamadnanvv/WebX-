import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  OFFICIAL_SUPPORT_EMAIL,
  SUPPORT_PRIORITIES,
  SUPPORT_SERVICES,
  type SupportCategory,
  type SupportPriority,
  buildSupportMailtoUrl,
  getSupportServiceMeta,
} from '../lib/supportCatalog.ts';

interface SupportRequestComposerProps {
  mode: 'public' | 'authenticated';
  initialCategory?: SupportCategory;
  onSubmitted?: (ticket: any) => void;
  onCancel?: () => void;
}

export function SupportRequestComposer({
  mode,
  initialCategory = 'CUSTOMER_SUPPORT',
  onSubmitted,
  onCancel,
}: SupportRequestComposerProps) {
  const { user, apiFetch, notify } = useAuth();
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [priority, setPriority] = useState<SupportPriority>(
    getSupportServiceMeta(initialCategory).defaultPriority
  );
  const [requesterName, setRequesterName] = useState(user?.name || '');
  const [requesterEmail, setRequesterEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [detailReference, setDetailReference] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedResult, setSubmittedResult] = useState<{
    ticket: any;
    mailtoUrl: string;
    deliveryNote: string;
  } | null>(null);

  useEffect(() => {
    setCategory(initialCategory);
    setPriority(getSupportServiceMeta(initialCategory).defaultPriority);
  }, [initialCategory]);

  useEffect(() => {
    if (mode === 'authenticated' && user) {
      setRequesterName(user.name);
      setRequesterEmail(user.email);
    }
  }, [mode, user]);

  const serviceMeta = getSupportServiceMeta(category);

  const handleCategoryChange = (nextCat: SupportCategory) => {
    setCategory(nextCat);
    setPriority(getSupportServiceMeta(nextCat).defaultPriority);
  };

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(OFFICIAL_SUPPORT_EMAIL);
      notify('success', `Copied ${OFFICIAL_SUPPORT_EMAIL}`);
    } catch {
      notify('info', `Support email: ${OFFICIAL_SUPPORT_EMAIL}`);
    }
  };

  const draftMailtoUrl = buildSupportMailtoUrl({
    category,
    subject,
    requesterName: requesterName.trim() || user?.name,
    requesterEmail: requesterEmail.trim() || user?.email,
    detailValue: detailReference.trim() || undefined,
    description,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'public') {
      if (requesterName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (!requesterEmail.includes('@')) {
        setError('Please enter a valid email address so our team can reply.');
        return;
      }
    }

    if (subject.trim().length < 4) {
      setError('Please provide a clear subject (at least 4 characters).');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe your request in detail (at least 10 characters).');
      return;
    }

    setSubmitting(true);
    try {
      let res: { ticket: any; mailtoUrl: string; deliveryNote: string };
      if (mode === 'public') {
        const resp = await fetch('/api/support/public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            priority,
            requesterName: requesterName.trim(),
            requesterEmail: requesterEmail.trim(),
            subject: subject.trim(),
            description: description.trim(),
            detailReference: detailReference.trim() || undefined,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || 'Failed to submit support request');
        }
        res = data;
      } else {
        res = await apiFetch('/api/support/tickets', {
          method: 'POST',
          body: JSON.stringify({
            category,
            priority,
            subject: subject.trim(),
            description: description.trim(),
            detailReference: detailReference.trim() || undefined,
          }),
        });
      }

      setSubmittedResult(res);
      notify('success', `Support ticket ${res.ticket.ticketNumber} created`);
      if (onSubmitted) {
        onSubmitted(res.ticket);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to submit support request');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-emerald-950">
              Support Request Logged — {submittedResult.ticket.ticketNumber}
            </h3>
            <p className="text-xs text-emerald-900 leading-relaxed">
              {submittedResult.deliveryNote}
            </p>
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-md p-3.5 text-xs text-slate-700 space-y-1.5">
          <div>
            <span className="text-slate-500">Service:</span>{' '}
            <span className="font-semibold text-slate-900">{serviceMeta.title}</span>
          </div>
          <div>
            <span className="text-slate-500">Routed To:</span>{' '}
            <span className="font-mono font-medium text-blue-700">
              {submittedResult.ticket.routedToEmail}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Priority:</span>{' '}
            <span className="font-semibold">{submittedResult.ticket.priority}</span> ·{' '}
            <span className="text-slate-500">Response Target:</span>{' '}
            <span>{serviceMeta.responseTarget}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <a
            href={submittedResult.mailtoUrl}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Send Email Copy to {OFFICIAL_SUPPORT_EMAIL}
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubmittedResult(null);
                setSubject('');
                setDescription('');
                setDetailReference('');
              }}
              className="px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md"
            >
              Submit Another Request
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-blue-50/80 border border-blue-200 rounded-md text-xs">
        <div className="flex items-center gap-2 text-blue-950">
          <Mail className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            Official Support Desk:{' '}
            <a
              href={draftMailtoUrl}
              className="font-mono font-semibold text-blue-800 underline hover:text-blue-950"
            >
              {OFFICIAL_SUPPORT_EMAIL}
            </a>
          </span>
        </div>
        <button
          type="button"
          onClick={copySupportEmail}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 rounded"
        >
          <Copy className="w-3 h-3" />
          Copy Email
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Support Service Category *
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as SupportCategory)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            {SUPPORT_SERVICES.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Priority Level *
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as SupportPriority)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            {SUPPORT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-600 space-y-1">
        <div className="font-medium text-slate-800">{serviceMeta.description}</div>
        <div className="text-[11px] text-slate-500">
          Target Response: <span className="font-medium text-slate-700">{serviceMeta.responseTarget}</span> ·{' '}
          Covers: {serviceMeta.scopeBullets.join(' · ')}
        </div>
      </div>

      {mode === 'public' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Your Full Name *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="e.g., Rashid Al Maktoum"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Your Reply-To Email *
            </label>
            <input
              type="email"
              required
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              placeholder="you@company.ae"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Subject *
        </label>
        <input
          type="text"
          required
          minLength={4}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={serviceMeta.subjectPlaceholder}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {serviceMeta.detailFieldLabel}
        </label>
        <input
          type="text"
          value={detailReference}
          onChange={(e) => setDetailReference(e.target.value)}
          placeholder={serviceMeta.detailFieldPlaceholder}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Detailed Description *
        </label>
        <textarea
          rows={4}
          required
          minLength={10}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Provide complete details so our team at adwebcomicllp@gmail.com can assist promptly..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <a
          href={draftMailtoUrl}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
        >
          <Mail className="w-3.5 h-3.5" />
          Open Draft in Email App
          <ExternalLink className="w-3 h-3" />
        </a>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-md transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Submitting...' : 'Submit Support Request'}
          </button>
        </div>
      </div>
    </form>
  );
}
