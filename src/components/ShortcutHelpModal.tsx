import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { type ShortcutDefinition } from '../lib/shortcuts.ts';

interface ShortcutHelpModalProps {
  open: boolean;
  shortcuts: ShortcutDefinition[];
  onClose: () => void;
}

export function ShortcutHelpModal({
  open,
  shortcuts,
  onClose,
}: ShortcutHelpModalProps) {
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

  const staffNav = shortcuts.filter((s) => s.category === 'STAFF');
  const adminNav = shortcuts.filter((s) => s.category === 'ADMIN');
  const actions = shortcuts.filter((s) => s.category === 'ACTIONS');

  const renderGroup = (
    title: string,
    items: ShortcutDefinition[],
    accent: 'blue' | 'violet' | 'slate'
  ) => {
    if (items.length === 0) return null;
    const headingClass =
      accent === 'violet'
        ? 'text-violet-800 border-violet-200 bg-violet-50/60'
        : accent === 'blue'
          ? 'text-blue-800 border-blue-200 bg-blue-50/60'
          : 'text-slate-800 border-slate-200 bg-slate-50';

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className={`px-4 py-2 text-xs font-semibold border-b ${headingClass}`}>
          {title}
        </div>
        <div className="divide-y divide-slate-100 bg-white">
          {items.map((item) => (
            <div
              key={item.id}
              className="px-4 py-2.5 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{item.label}</div>
                <div className="text-[11px] text-slate-500 truncate">{item.description}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((k, idx) => (
                  <span key={`${item.id}-${idx}`} className="flex items-center gap-1">
                    {idx > 0 && item.chord && (
                      <span className="text-[10px] text-slate-400">then</span>
                    )}
                    {idx > 0 && !item.chord && (
                      <span className="text-[10px] text-slate-400">+</span>
                    )}
                    <kbd className="px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded">
                      {k}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 no-print"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-700 text-white flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                WebX Global Keyboard Shortcuts
              </h2>
              <p className="text-xs text-slate-500">
                Single-key and chord shortcuts pause automatically while typing inside form fields
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            {renderGroup('Global Feature Shortcuts', actions, 'slate')}
            {renderGroup('Staff Panel Navigation (Press G, then key)', staffNav, 'blue')}
          </div>
          <div className="space-y-5">
            {adminNav.length > 0 ? (
              renderGroup('Admin Panel Navigation (Press A, then key)', adminNav, 'violet')
            ) : (
              <div className="border border-slate-200 rounded-lg p-5 bg-slate-50 text-xs text-slate-600 space-y-2">
                <div className="font-semibold text-slate-800">Role-Aware Navigation</div>
                <p>
                  Staff shortcuts (`G` + key) and quick workspace actions are enabled for your session. Administrator panel shortcuts are hidden when signed in as Staff.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
