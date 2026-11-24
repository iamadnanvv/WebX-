export const OFFICIAL_SUPPORT_EMAIL = 'adwebcomicllp@gmail.com';

export const SUPPORT_CATEGORIES = [
  'CUSTOMER_SUPPORT',
  'TECHNICAL_SUPPORT',
  'STAFF_ONBOARDING',
  'ACCOUNT_SUPPORT',
  'ADMIN_SUPPORT',
  'BILLING_PAYMENT',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export interface SupportServiceDefinition {
  id: SupportCategory;
  title: string;
  shortLabel: string;
  description: string;
  scopeBullets: string[];
  responseTarget: string;
  defaultPriority: SupportPriority;
  subjectPlaceholder: string;
  detailFieldLabel: string;
  detailFieldPlaceholder: string;
}

export const SUPPORT_SERVICES: SupportServiceDefinition[] = [
  {
    id: 'CUSTOMER_SUPPORT',
    title: 'Customer Support',
    shortLabel: 'Customer',
    description:
      'Customer queries, service complaints, feature feedback, and general bookkeeping platform assistance.',
    scopeBullets: [
      'Customer queries & service complaints',
      'Product feedback & feature suggestions',
      'General workflow & ledger guidance',
    ],
    responseTarget: 'Within 4 business hours',
    defaultPriority: 'NORMAL',
    subjectPlaceholder: 'e.g., Question regarding multi-currency ledger statement',
    detailFieldLabel: 'Account Name / Customer Reference (optional)',
    detailFieldPlaceholder: 'e.g., ACC-1004 or Client Inquiry Ref',
  },
  {
    id: 'TECHNICAL_SUPPORT',
    title: 'Technical Support',
    shortLabel: 'Technical',
    description:
      'Technical issues, troubleshooting, bug reports, export formatting issues, and platform connectivity problems.',
    scopeBullets: [
      'Bug reports & error diagnostics',
      'PDF / Excel export & print troubleshooting',
      'Real-time sync & exchange-rate feed issues',
    ],
    responseTarget: 'Within 2 business hours',
    defaultPriority: 'HIGH',
    subjectPlaceholder: 'e.g., Unable to export monthly PDF report for AED view',
    detailFieldLabel: 'Affected Module / Page & Error Message (optional)',
    detailFieldPlaceholder: 'e.g., Reports Page / HTTP 500 or Browser console error',
  },
  {
    id: 'STAFF_ONBOARDING',
    title: 'New Staff Onboarding Support',
    shortLabel: 'Staff Onboarding',
    description:
      'Assistance with new staff registration, workspace account creation, role assignment, and onboarding orientation.',
    scopeBullets: [
      'New staff registration & provisioning requests',
      'Role assignment (Staff vs Admin access)',
      'First-day bookkeeping & closing orientation',
    ],
    responseTarget: 'Same business day',
    defaultPriority: 'NORMAL',
    subjectPlaceholder: 'e.g., Provision new Staff login for Dubai Operations Clerk',
    detailFieldLabel: 'Proposed Staff Name, Email & Role Needed',
    detailFieldPlaceholder: 'e.g., Fatima Al Mansoori · fatima@company.ae · STAFF role',
  },
  {
    id: 'ACCOUNT_SUPPORT',
    title: 'Account Support',
    shortLabel: 'Account & Access',
    description:
      'Login issues, password recovery requests, profile updates, Google SSO troubleshooting, and access restoration.',
    scopeBullets: [
      'Sign-in lockouts & credential troubleshooting',
      'Password recovery & credential resets',
      'Profile updates & disabled account review',
    ],
    responseTarget: 'Within 2 business hours',
    defaultPriority: 'HIGH',
    subjectPlaceholder: 'e.g., Password reset & sign-in assistance for staff account',
    detailFieldLabel: 'Account Email & Issue Type',
    detailFieldPlaceholder: 'e.g., Password Reset / Google Sign-In / Account Reactivation',
  },
  {
    id: 'ADMIN_SUPPORT',
    title: 'Administrative Support',
    shortLabel: 'Administrative',
    description:
      'Staff management policies, role permissions, system configuration, daily closing rules, and operational queries.',
    scopeBullets: [
      'Staff permissions & daily closing governance',
      'Exchange rate markup & policy configuration',
      'Audit trail, balance check & compliance queries',
    ],
    responseTarget: 'Within 4 business hours',
    defaultPriority: 'NORMAL',
    subjectPlaceholder: 'e.g., Assistance reopening closed ledger date or updating markup policy',
    detailFieldLabel: 'Policy / Setting or Operational Date (optional)',
    detailFieldPlaceholder: 'e.g., Daily Closing 2026-11-23 / Staff Export Permission',
  },
  {
    id: 'BILLING_PAYMENT',
    title: 'Billing & Payment Support',
    shortLabel: 'Billing & Payment',
    description:
      'Invoices, payment-related queries, subscription plans, AED/INR settlement reconciliation, and transaction assistance.',
    scopeBullets: [
      'Invoice copies & billing statement queries',
      'Subscription renewals & plan adjustments',
      'Payment settlement & transaction assistance',
    ],
    responseTarget: 'Within 4 business hours',
    defaultPriority: 'HIGH',
    subjectPlaceholder: 'e.g., Request copy of monthly subscription invoice & payment status',
    detailFieldLabel: 'Invoice / Payment Reference & Currency (optional)',
    detailFieldPlaceholder: 'e.g., INV-2026-1102 · AED 1,500.00 / INR Bank Transfer',
  },
];

export function getSupportServiceMeta(category: string): SupportServiceDefinition {
  return (
    SUPPORT_SERVICES.find((s) => s.id === category) || SUPPORT_SERVICES[0]
  );
}

export function buildSupportMailtoUrl(params: {
  category?: string;
  subject?: string;
  ticketNumber?: string;
  requesterName?: string;
  requesterEmail?: string;
  description?: string;
  detailValue?: string;
}): string {
  const service = getSupportServiceMeta(params.category || 'CUSTOMER_SUPPORT');
  const subjectPrefix = params.ticketNumber ? `[${params.ticketNumber}] ` : '';
  const fullSubject = `${subjectPrefix}[WebX ${service.title}] ${
    params.subject?.trim() || 'Support Request'
  }`;

  const lines = [
    `WebX Support Request — ${service.title}`,
    `Official Support Desk: ${OFFICIAL_SUPPORT_EMAIL}`,
    params.ticketNumber ? `Ticket Reference: ${params.ticketNumber}` : null,
    params.requesterName ? `Requester Name: ${params.requesterName}` : null,
    params.requesterEmail ? `Requester Email: ${params.requesterEmail}` : null,
    params.detailValue ? `${service.detailFieldLabel}: ${params.detailValue}` : null,
    '',
    'Request Details:',
    params.description?.trim() || '(Please describe your query below)',
  ].filter((l): l is string => l !== null);

  return `mailto:${OFFICIAL_SUPPORT_EMAIL}?subject=${encodeURIComponent(
    fullSubject
  )}&body=${encodeURIComponent(lines.join('\n'))}`;
}
