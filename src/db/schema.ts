import { relations } from 'drizzle-orm';
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('STAFF'), // 'ADMIN' | 'STAFF'
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'DISABLED'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  accountNumber: text('account_number').notNull().unique(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  contactAddress: text('contact_address'),
  baseCurrency: text('base_currency').notNull().default('AED'), // 'AED' | 'INR'
  openingBalance: numeric('opening_balance', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  currentBalance: numeric('current_balance', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'INACTIVE'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .references(() => accounts.id)
    .notNull(),
  type: text('type').notNull(), // 'CREDIT' | 'DEBIT'
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(), // In account's baseCurrency (AED)
  originalAmount: numeric('original_amount', { precision: 18, scale: 2 }).notNull(),
  originalCurrency: text('original_currency').notNull().default('AED'), // 'AED' | 'INR'
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull(), // 1 AED = X INR
  convertedAmountInr: numeric('converted_amount_inr', { precision: 18, scale: 2 }).notNull(),
  rateDate: text('rate_date').notNull(), // YYYY-MM-DD (Asia/Dubai)
  rateSource: text('rate_source').notNull().default('API'), // 'API' | 'MANUAL' | 'FALLBACK'
  date: text('date').notNull(), // YYYY-MM-DD (Asia/Dubai)
  description: text('description').notNull(),
  createdById: integer('created_by_id')
    .references(() => users.id)
    .notNull(),
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'REVERSED'
  reversalOfId: integer('reversal_of_id'),
  editReason: text('edit_reason'),
  runningBalance: numeric('running_balance', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dailyClosings = pgTable('daily_closings', {
  id: serial('id').primaryKey(),
  date: text('date').notNull().unique(), // YYYY-MM-DD (Asia/Dubai)
  totalAdditions: numeric('total_additions', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalDeductions: numeric('total_deductions', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  closingBalance: numeric('closing_balance', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalAdditionsInr: numeric('total_additions_inr', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalDeductionsInr: numeric('total_deductions_inr', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  closingBalanceInr: numeric('closing_balance_inr', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  appliedRate: numeric('applied_rate', { precision: 18, scale: 6 }).notNull(),
  status: text('status').notNull().default('OPEN'), // 'OPEN' | 'CLOSED'
  closedById: integer('closed_by_id').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  reopenReason: text('reopen_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const exchangeRates = pgTable('exchange_rates', {
  id: serial('id').primaryKey(),
  fromCurrency: text('from_currency').notNull().default('AED'),
  toCurrency: text('to_currency').notNull().default('INR'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
  effectiveDate: text('effective_date').notNull(), // YYYY-MM-DD
  source: text('source').notNull().default('API'), // 'API' | 'MANUAL'
  setById: integer('set_by_id').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  beforeSnapshot: jsonb('before_snapshot'),
  afterSnapshot: jsonb('after_snapshot'),
  reason: text('reason'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  ticketNumber: text('ticket_number').notNull().unique(),
  category: text('category').notNull(), // 'CUSTOMER_SUPPORT' | 'TECHNICAL_SUPPORT' | 'STAFF_ONBOARDING' | 'ACCOUNT_SUPPORT' | 'ADMIN_SUPPORT' | 'BILLING_PAYMENT'
  priority: text('priority').notNull().default('NORMAL'), // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: text('status').notNull().default('OPEN'), // 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  requesterUserId: integer('requester_user_id').references(() => users.id),
  requesterName: text('requester_name').notNull(),
  requesterEmail: text('requester_email').notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata'),
  routedToEmail: text('routed_to_email').notNull().default('adwebcomicllp@gmail.com'),
  emailDeliveryStatus: text('email_delivery_status').notNull().default('READY_FOR_DISPATCH'),
  emailMessageId: text('email_message_id'),
  assignedAdminId: integer('assigned_admin_id').references(() => users.id),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportMessages = pgTable('support_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .references(() => supportTickets.id, { onDelete: 'cascade' })
    .notNull(),
  senderUserId: integer('sender_user_id').references(() => users.id),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').notNull(), // 'ADMIN' | 'STAFF' | 'EXTERNAL'
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const monthlyBackups = pgTable('monthly_backups', {
  id: serial('id').primaryKey(),
  month: text('month').notNull().unique(), // YYYY-MM (Asia/Dubai GST)
  periodStart: text('period_start').notNull(), // YYYY-MM-01
  periodEnd: text('period_end').notNull(), // YYYY-MM-DD
  status: text('status').notNull().default('AVAILABLE'), // 'AVAILABLE' | 'SNAPSHOT_LOCKED'
  generationType: text('generation_type').notNull().default('MANUAL'), // 'AUTO_MONTH_END' | 'MANUAL'
  accountCount: integer('account_count').notNull().default(0),
  transactionCount: integer('transaction_count').notNull().default(0),
  dailyClosingCount: integer('daily_closing_count').notNull().default(0),
  exchangeRateCount: integer('exchange_rate_count').notNull().default(0),
  supportTicketCount: integer('support_ticket_count').notNull().default(0),
  totalCreditsAed: numeric('total_credits_aed', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalDebitsAed: numeric('total_debits_aed', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalCreditsInr: numeric('total_credits_inr', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  totalDebitsInr: numeric('total_debits_inr', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  closingBalanceAed: numeric('closing_balance_aed', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  sha256Checksum: text('sha256_checksum').notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  generatedById: integer('generated_by_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  activityLogs: many(activityLogs),
  dailyClosings: many(dailyClosings),
  exchangeRates: many(exchangeRates),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  createdBy: one(users, {
    fields: [transactions.createdById],
    references: [users.id],
  }),
}));

export const dailyClosingsRelations = relations(dailyClosings, ({ one }) => ({
  closedBy: one(users, {
    fields: [dailyClosings.closedById],
    references: [users.id],
  }),
}));

export const exchangeRatesRelations = relations(exchangeRates, ({ one }) => ({
  setBy: one(users, {
    fields: [exchangeRates.setById],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  requesterUser: one(users, {
    fields: [supportTickets.requesterUserId],
    references: [users.id],
  }),
  assignedAdmin: one(users, {
    fields: [supportTickets.assignedAdminId],
    references: [users.id],
  }),
  messages: many(supportMessages),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportMessages.ticketId],
    references: [supportTickets.id],
  }),
  senderUser: one(users, {
    fields: [supportMessages.senderUserId],
    references: [users.id],
  }),
}));

export const monthlyBackupsRelations = relations(monthlyBackups, ({ one }) => ({
  generatedBy: one(users, {
    fields: [monthlyBackups.generatedById],
    references: [users.id],
  }),
}));
