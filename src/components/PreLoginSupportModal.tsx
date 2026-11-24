import { useEffect } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import { OFFICIAL_SUPPORT_EMAIL, type SupportCategory } from '../lib/supportCatalog.ts';
import { SupportRequestComposer } from './SupportRequestComposer.tsx';

interface PreLoginSupportModalProps {
  open: boolean;
  initialCategory: SupportCategory;
  onClose: () => void;
}

export function PreLoginSupportModal({
  open,
  initialCategory,
  onClose,
}: PreLoginSupportModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-700 text-white flex items-center justify-center shrink-0">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                WebX Support & Access Desk
              </h2>
              <p className="text-xs text-slate-500">
                All requests route directly to {OFFICIAL_SUPPORT_EMAIL}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto">
          <SupportRequestComposer
            mode="public"
            initialCategory={initialCategory}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
