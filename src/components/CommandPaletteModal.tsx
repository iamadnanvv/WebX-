import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, CornerDownLeft, Search, X } from 'lucide-react';
import { type ShortcutDefinition } from '../lib/shortcuts.ts';

interface CommandPaletteModalProps {
  open: boolean;
  shortcuts: ShortcutDefinition[];
  onClose: () => void;
  onExecute: (shortcut: ShortcutDefinition) => void;
}

export function CommandPaletteModal({
  open,
  shortcuts,
  onClose,
  onExecute,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = shortcuts.filter((s) => s.actionId !== 'open-command-palette');
    if (!q) return list;
    return list.filter((item) => {
      const haystack = [
        item.label,
        item.description,
        item.category,
        item.keys.join(' '),
        ...(item.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, shortcuts]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 15);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex((prev) =>
      filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)
    );
  }, [filtered.length]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      }
      return;
    }
    if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      onExecute(filtered[selectedIndex]);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-16 sm:pt-24 no-print"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search WebX features, pages, or quick actions..."
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-slate-500">
              No WebX features match &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const selected = idx === selectedIndex;
              const badgeColor =
                item.category === 'ADMIN'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : item.category === 'ACTIONS'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200';
              const categoryLabel =
                item.category === 'ADMIN'
                  ? 'Admin'
                  : item.category === 'ACTIONS'
                    ? 'Action'
                    : 'Staff';

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onExecute(item);
                    onClose();
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${
                    selected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold border rounded ${badgeColor}`}
                      >
                        {categoryLabel}
                      </span>
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{item.description}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, kIdx) => (
                      <span key={`${item.id}-${kIdx}`} className="flex items-center gap-1">
                        {kIdx > 0 && item.chord && (
                          <span className="text-[10px] text-slate-400">then</span>
                        )}
                        <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded shadow-2xs">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-white border border-slate-300 rounded">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              Open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-white border border-slate-300 rounded">
                Esc
              </kbd>
              Close
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Command className="w-3 h-3" />
            Press <kbd className="font-mono font-semibold text-slate-600">?</kbd> for full cheat sheet
          </span>
        </div>
      </div>
    </div>
  );
}
