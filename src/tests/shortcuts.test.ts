import { describe, expect, it } from 'vitest';
import {
  SHORTCUT_DEFINITIONS,
  getAvailableShortcuts,
  getShortcutForPage,
  hasOpenModalDialog,
  isEditableTarget,
  matchChordShortcut,
  matchSingleShortcut,
} from '../lib/shortcuts.ts';

describe('WebX Global Keyboard Shortcuts', () => {
  it('covers all 7 Staff pages and 11 Admin pages with zero chord or single-key collisions', () => {
    const chordKeys = new Set<string>();
    const singleKeys = new Set<string>();
    const pages = new Set<string>();

    for (const def of SHORTCUT_DEFINITIONS) {
      if (def.pageId) {
        pages.add(def.pageId);
      }
      if (def.chord) {
        const key = `${def.chord[0]}+${def.chord[1]}`;
        expect(chordKeys.has(key)).toBe(false);
        chordKeys.add(key);
      }
      if (def.singleKey) {
        const key = `${def.shift ? 'shift+' : ''}${def.singleKey}`;
        expect(singleKeys.has(key)).toBe(false);
        singleKeys.add(key);
      }
    }

    const expectedPages = [
      'staff-dashboard',
      'accounts',
      'new-entry',
      'transactions',
      'daily-ledger',
      'reports',
      'support-center',
      'admin-dashboard',
      'admin-staff',
      'admin-accounts',
      'admin-transactions',
      'admin-balances',
      'admin-closing',
      'admin-rates',
      'admin-reports',
      'admin-logs',
      'admin-support',
      'admin-settings',
    ];
    for (const p of expectedPages) {
      expect(pages.has(p)).toBe(true);
    }
  });

  it('enforces role and report permissions when resolving available shortcuts', () => {
    const staffNoReports = getAvailableShortcuts({
      isAdmin: false,
      staffCanViewReports: false,
    });
    expect(staffNoReports.some((s) => s.adminOnly)).toBe(false);
    expect(staffNoReports.some((s) => s.pageId === 'reports')).toBe(false);
    expect(
      matchChordShortcut('a', 's', { isAdmin: false, staffCanViewReports: true })
    ).toBeUndefined();
    expect(
      matchChordShortcut('g', 'r', { isAdmin: false, staffCanViewReports: false })
    ).toBeUndefined();

    const staffWithReports = getAvailableShortcuts({
      isAdmin: false,
      staffCanViewReports: true,
    });
    expect(staffWithReports.some((s) => s.pageId === 'reports')).toBe(true);
    expect(
      matchChordShortcut('g', 'r', { isAdmin: false, staffCanViewReports: true })?.pageId
    ).toBe('reports');

    const adminAll = getAvailableShortcuts({
      isAdmin: true,
      staffCanViewReports: false,
    });
    expect(adminAll.length).toBe(SHORTCUT_DEFINITIONS.length);
    expect(
      matchChordShortcut('A', 'C', { isAdmin: true, staffCanViewReports: false })?.pageId
    ).toBe('admin-closing');
    expect(
      getShortcutForPage('admin-rates', { isAdmin: true, staffCanViewReports: false })?.keys
    ).toEqual(['A', 'E']);
  });

  it('matches single-key and shift-modified feature shortcuts accurately', () => {
    const opts = { isAdmin: true, staffCanViewReports: true };
    expect(matchSingleShortcut('n', false, opts)?.pageId).toBe('new-entry');
    expect(matchSingleShortcut('c', false, opts)?.actionId).toBe('toggle-currency');
    expect(matchSingleShortcut('?', true, opts)?.actionId).toBe('open-shortcut-help');
    expect(matchSingleShortcut('?', false, opts)?.actionId).toBe('open-shortcut-help');
    expect(matchSingleShortcut('L', true, opts)?.actionId).toBe('logout-prompt');
    expect(matchSingleShortcut('l', false, opts)).toBeUndefined();
    expect(matchSingleShortcut('P', true, opts)?.actionId).toBe('print-page');
    expect(matchSingleShortcut('p', false, opts)).toBeUndefined();
  });

  it('detects editable form elements cleanly so typing is never interrupted', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(
      isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)
    ).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: 'BODY' } as unknown as EventTarget)).toBe(false);
  });

  it('safely detects open modal dialogs via aria-modal="true" semantics', () => {
    expect(hasOpenModalDialog()).toBe(false);
    const originalDoc = globalThis.document;
    (globalThis as any).document = {
      querySelector: (selector: string) =>
        selector === '[role="dialog"][aria-modal="true"]' ? { role: 'dialog' } : null,
    };
    try {
      expect(hasOpenModalDialog()).toBe(true);
    } finally {
      (globalThis as any).document = originalDoc;
    }
  });
});
