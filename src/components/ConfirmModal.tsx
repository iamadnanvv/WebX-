import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'primary' | 'danger' | 'purple';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  variant = 'primary',
  requireReason = false,
  reasonLabel = 'Audit Reason',
  reasonPlaceholder = 'Enter reason for this action...',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason('');
      setError('');
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && reason.trim().length < 3) {
      setError('Please enter a clear reason (at least 3 characters).');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } catch (err: any) {
      setError(err?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const btnColor =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'purple'
        ? 'bg-violet-700 hover:bg-violet-800 text-white'
        : 'bg-blue-700 hover:bg-blue-800 text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (!submitting && e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

          {requireReason && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {reasonLabel} <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${btnColor}`}
            >
              {submitting ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
