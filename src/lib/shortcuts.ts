export type ShortcutCategory = 'STAFF' | 'ADMIN' | 'ACTIONS';

export type ShortcutActionId =
  | 'open-command-palette'
  | 'open-shortcut-help'
  | 'toggle-currency'
  | 'set-currency-aed'
  | 'set-currency-inr'
  | 'toggle-converter'
  | 'focus-search'
  | 'refresh-workspace'
  | 'open-support'
  | 'print-page'
  | 'logout-prompt';

export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  category: ShortcutCategory;
  keys: string[];
  chord?: [string, string];
  singleKey?: string;
  shift?: boolean;
  pageId?: string;
  actionId?: ShortcutActionId;
  adminOnly?: boolean;
  requiresStaffReports?: boolean;
  keywords?: string[];
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Staff Panel Navigation (G -> <key>)
  {
    id: 'nav-staff-dashboard',
    label: 'Staff Dashboard',
    description: 'View account totals, today metrics, and 7-day trend',
    category: 'STAFF',
    keys: ['G', 'D'],
    chord: ['g', 'd'],
    pageId: 'staff-dashboard',
    keywords: ['home', 'overview', 'staff'],
  },
  {
    id: 'nav-accounts',
    label: 'Account List',
    description: 'Search ledger accounts and inspect account balances',
    category: 'STAFF',
    keys: ['G', 'A'],
    chord: ['g', 'a'],
    pageId: 'accounts',
    keywords: ['accounts', 'holders', 'balances'],
  },
  {
    id: 'nav-new-entry',
    label: 'Add New Entry',
    description: 'Log a multi-currency AED or INR credit/debit entry',
    category: 'STAFF',
    keys: ['G', 'N'],
    chord: ['g', 'n'],
    pageId: 'new-entry',
    keywords: ['credit', 'debit', 'transaction', 'create', 'post'],
  },
  {
    id: 'nav-transactions',
    label: 'Transaction History',
    description: 'Browse paginated ledger history with filters',
    category: 'STAFF',
    keys: ['G', 'T'],
    chord: ['g', 't'],
    pageId: 'transactions',
    keywords: ['history', 'entries', 'ledger', 'reversed'],
  },
  {
    id: 'nav-daily-ledger',
    label: 'Daily Ledger',
    description: 'Review day-by-day additions, deductions, and closing status',
    category: 'STAFF',
    keys: ['G', 'L'],
    chord: ['g', 'l'],
    pageId: 'daily-ledger',
    keywords: ['daily', 'summary', 'closing'],
  },
  {
    id: 'nav-reports',
    label: 'Basic Reports',
    description: 'Filter, print, and export PDF/Excel ledger statements',
    category: 'STAFF',
    keys: ['G', 'R'],
    chord: ['g', 'r'],
    pageId: 'reports',
    requiresStaffReports: true,
    keywords: ['pdf', 'excel', 'export', 'statement'],
  },
  {
    id: 'nav-support-center',
    label: 'Help & Support',
    description: 'Open or track support requests routed to adwebcomicllp@gmail.com',
    category: 'STAFF',
    keys: ['G', 'H'],
    chord: ['g', 'h'],
    pageId: 'support-center',
    keywords: ['help', 'ticket', 'email', 'assistance'],
  },

  // Admin Panel Navigation (A -> <key>)
  {
    id: 'nav-admin-dashboard',
    label: 'Admin Overview',
    description: 'System-wide balances, staff performance, and closing status',
    category: 'ADMIN',
    keys: ['A', 'D'],
    chord: ['a', 'd'],
    pageId: 'admin-dashboard',
    adminOnly: true,
    keywords: ['admin', 'overview', 'performance'],
  },
  {
    id: 'nav-admin-staff',
    label: 'Staff Management',
    description: 'Create users, assign roles, reset passwords, toggle status',
    category: 'ADMIN',
    keys: ['A', 'S'],
    chord: ['a', 's'],
    pageId: 'admin-staff',
    adminOnly: true,
    keywords: ['users', 'staff', 'password', 'roles'],
  },
  {
    id: 'nav-admin-accounts',
    label: 'Account Management',
    description: 'Create, edit, or deactivate customer/vendor ledger accounts',
    category: 'ADMIN',
    keys: ['A', 'A'],
    chord: ['a', 'a'],
    pageId: 'admin-accounts',
    adminOnly: true,
    keywords: ['accounts', 'opening balance', 'ledger'],
  },
  {
    id: 'nav-admin-transactions',
    label: 'Transaction Audit',
    description: 'Edit or reverse ledger entries with logged audit reasons',
    category: 'ADMIN',
    keys: ['A', 'T'],
    chord: ['a', 't'],
    pageId: 'admin-transactions',
    adminOnly: true,
    keywords: ['audit', 'edit', 'reverse', 'transactions'],
  },
  {
    id: 'nav-admin-balances',
    label: 'Balance Check',
    description: 'Run full ledger consistency & running balance verification',
    category: 'ADMIN',
    keys: ['A', 'B'],
    chord: ['a', 'b'],
    pageId: 'admin-balances',
    adminOnly: true,
    keywords: ['recalculate', 'consistency', 'balance'],
  },
  {
    id: 'nav-admin-closing',
    label: 'Daily Closing',
    description: 'Finalize & lock daily books or reopen with an audit reason',
    category: 'ADMIN',
    keys: ['A', 'C'],
    chord: ['a', 'c'],
    pageId: 'admin-closing',
    adminOnly: true,
    keywords: ['close', 'lock', 'reopen', 'day'],
  },
  {
    id: 'nav-admin-rates',
    label: 'Exchange Rates',
    description: 'Fetch live AED → INR rate or configure manual overrides',
    category: 'ADMIN',
    keys: ['A', 'E'],
    chord: ['a', 'e'],
    pageId: 'admin-rates',
    adminOnly: true,
    keywords: ['fx', 'currency', 'rate', 'override', 'inr'],
  },
  {
    id: 'nav-admin-reports',
    label: 'Comprehensive Reports',
    description: 'Daily, monthly, and account-wise statements with exports',
    category: 'ADMIN',
    keys: ['A', 'R'],
    chord: ['a', 'r'],
    pageId: 'admin-reports',
    adminOnly: true,
    keywords: ['monthly', 'daily', 'account', 'pdf', 'excel'],
  },
  {
    id: 'nav-admin-logs',
    label: 'Activity Logs',
    description: 'Inspect immutable audit trail with before/after snapshots',
    category: 'ADMIN',
    keys: ['A', 'L'],
    chord: ['a', 'l'],
    pageId: 'admin-logs',
    adminOnly: true,
    keywords: ['audit', 'trail', 'logs', 'history'],
  },
  {
    id: 'nav-admin-support',
    label: 'Support Desk',
    description: 'Manage all staff and pre-login support tickets & replies',
    category: 'ADMIN',
    keys: ['A', 'U'],
    chord: ['a', 'u'],
    pageId: 'admin-support',
    adminOnly: true,
    keywords: ['support', 'tickets', 'inbox'],
  },
  {
    id: 'nav-admin-settings',
    label: 'System Settings',
    description: 'Configure currencies, rate schedule, markup, and permissions',
    category: 'ADMIN',
    keys: ['A', 'G'],
    chord: ['a', 'g'],
    pageId: 'admin-settings',
    adminOnly: true,
    keywords: ['permissions', 'timezone', 'settings', 'markup'],
  },

  // Global Quick Feature Actions
  {
    id: 'action-command-palette',
    label: 'Open Command Palette',
    description: 'Search and jump to any feature or action anywhere in WebX',
    category: 'ACTIONS',
    keys: ['Ctrl/⌘', 'K'],
    actionId: 'open-command-palette',
    keywords: ['search', 'palette', 'jump', 'find'],
  },
  {
    id: 'action-shortcut-help',
    label: 'Keyboard Shortcuts Reference',
    description: 'Show all available navigation and quick-action shortcuts',
    category: 'ACTIONS',
    keys: ['?'],
    singleKey: '?',
    actionId: 'open-shortcut-help',
    keywords: ['help', 'keys', 'cheatsheet'],
  },
  {
    id: 'action-new-entry',
    label: 'Quick Add New Entry',
    description: 'Jump directly to the new transaction entry form',
    category: 'ACTIONS',
    keys: ['N'],
    singleKey: 'n',
    pageId: 'new-entry',
    keywords: ['new', 'entry', 'credit', 'debit'],
  },
  {
    id: 'action-focus-search',
    label: 'Focus Page Search',
    description: 'Focus the search box on the current view (or open Command Palette)',
    category: 'ACTIONS',
    keys: ['/'],
    singleKey: '/',
    actionId: 'focus-search',
    keywords: ['filter', 'find', 'search'],
  },
  {
    id: 'action-toggle-currency',
    label: 'Toggle Display Currency (AED ↔ INR)',
    description: 'Switch primary KPI & ledger display between AED and INR (₹)',
    category: 'ACTIONS',
    keys: ['C'],
    singleKey: 'c',
    actionId: 'toggle-currency',
    keywords: ['aed', 'inr', 'currency', 'display'],
  },
  {
    id: 'action-toggle-converter',
    label: 'Toggle Quick Currency Converter',
    description: 'Open or close the live AED ↔ INR calculator popover',
    category: 'ACTIONS',
    keys: ['X'],
    singleKey: 'x',
    actionId: 'toggle-converter',
    keywords: ['converter', 'calculator', 'fx'],
  },
  {
    id: 'action-refresh-workspace',
    label: 'Refresh Live Data & Rates',
    description: 'Reload workspace rates, settings, and active view data',
    category: 'ACTIONS',
    keys: ['R'],
    singleKey: 'r',
    actionId: 'refresh-workspace',
    keywords: ['sync', 'reload', 'refresh'],
  },
  {
    id: 'action-open-support',
    label: 'Open Support Desk',
    description: 'Jump to your role support portal',
    category: 'ACTIONS',
    keys: ['S'],
    singleKey: 's',
    actionId: 'open-support',
    keywords: ['support', 'help', 'ticket'],
  },
  {
    id: 'action-print-page',
    label: 'Print Current View',
    description: 'Open browser print dialog for the current ledger or report',
    category: 'ACTIONS',
    keys: ['Shift', 'P'],
    singleKey: 'p',
    shift: true,
    actionId: 'print-page',
    keywords: ['print', 'report', 'pdf'],
  },
  {
    id: 'action-logout-prompt',
    label: 'Sign Out of WebX',
    description: 'Prompt confirmation to sign out of your current session',
    category: 'ACTIONS',
    keys: ['Shift', 'L'],
    singleKey: 'l',
    shift: true,
    actionId: 'logout-prompt',
    keywords: ['logout', 'exit', 'sign out'],
  },
];

export function getAvailableShortcuts(options: {
  isAdmin: boolean;
  staffCanViewReports: boolean;
}): ShortcutDefinition[] {
  return SHORTCUT_DEFINITIONS.filter((item) => {
    if (item.adminOnly && !options.isAdmin) return false;
    if (item.requiresStaffReports && !options.isAdmin && !options.staffCanViewReports) {
      return false;
    }
    return true;
  });
}

export function getShortcutForPage(
  pageId: string,
  options: { isAdmin: boolean; staffCanViewReports: boolean }
): ShortcutDefinition | undefined {
  return getAvailableShortcuts(options).find(
    (item) => item.pageId === pageId && Boolean(item.chord)
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  const role = el.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox';
}

export function hasOpenModalDialog(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

export function matchChordShortcut(
  firstKey: string,
  secondKey: string,
  options: { isAdmin: boolean; staffCanViewReports: boolean }
): ShortcutDefinition | undefined {
  const k1 = firstKey.toLowerCase();
  const k2 = secondKey.toLowerCase();
  return getAvailableShortcuts(options).find(
    (item) => item.chord && item.chord[0] === k1 && item.chord[1] === k2
  );
}

export function matchSingleShortcut(
  key: string,
  shiftKey: boolean,
  options: { isAdmin: boolean; staffCanViewReports: boolean }
): ShortcutDefinition | undefined {
  if (key === '?') {
    return getAvailableShortcuts(options).find((item) => item.singleKey === '?');
  }
  const lower = key.toLowerCase();
  return getAvailableShortcuts(options).find(
    (item) =>
      item.singleKey === lower &&
      Boolean(item.shift) === shiftKey
  );
}
