# WebX — Multi-Currency Bookkeeping Platform (AED / INR)

WebX is a production-ready, role-based web bookkeeping platform built with React, TypeScript, Tailwind CSS, Express, WebSockets (`ws`), Drizzle ORM, PostgreSQL (Cloud SQL), and Firebase Authentication. It operates with **AED** as the primary working currency, automatic **INR (₹)** conversion using live entry-time exchange rates, automated decimal running balances, immutable audit logs, daily closing locks, real-time synchronization across connected sessions, and PDF/Excel reporting.

---

## Core Architecture & Features

- **Role-Based Access Control (RBAC)**:
  - **Staff Panel**: Dashboard, searchable Account List, Add New Entry (with live AED ↔ INR preview), paginated Transaction History, automated Balance Management, Daily Ledger (Asia/Dubai GST), and Basic Reports (PDF, Excel, Print).
  - **Admin Panel**: Executive Overview & Staff Performance, Staff Management (CRUD, enable/disable, password reset), Account Management, Transaction Audit/Edit/Reversal (reason required, exact original-rate reversals), System-Wide Balance Recalculation, Daily Closing Lock/Reopen, Exchange Rate Management (live API fetch + manual overrides), Comprehensive Reports (with Rate-Variance analysis), Activity Logs (before/after JSON snapshots), and System Settings.
- **Deterministic Decimal Bookkeeping**:
  - Uses `decimal.js` (`ROUND_HALF_UP`, 2 decimal places) and PostgreSQL `numeric(18, 2)` / `numeric(18, 6)` — never IEEE-754 floats.
  - Transactions are never hard-deleted. Reversals create linked opposite entries at the original transaction's stored exchange rate so AED and INR offset exactly.
- **Live Multi-Currency Exchange Rate Engine**:
  - Fetches live AED → INR exchange rates from `EXCHANGE_RATE_API_URL` (defaulting to `https://open.er-api.com/v6/latest/AED`) with a background GST schedule check (`rateRefreshSchedule`).
  - Admin manual overrides take priority per effective date. If the external API is unreachable and a historical stored rate exists in PostgreSQL, WebX falls back to the last stored rate with an explicit warning banner; if no real rate exists at all, posting/closing is blocked rather than fabricating a rate.
  - Operating timezone defaults to `Asia/Dubai` (GST) for transaction dates, daily closing cutoffs, and reports.
- **Real-Time Synchronization (`/ws`)**:
  - Authenticated WebSocket server (`ws`) attached to the Express HTTP server pushes live invalidation events (`ledger:updated`, `accounts:updated`, `rates:updated`, `closing:updated`, `staff:updated`, `settings:updated`, `activity:updated`, `support:updated`) to active Staff and Admin sessions (enforcing `adminOnly` isolation for sensitive audit/staff events).
- **Integrated Support System (`adwebcomicllp@gmail.com`)**:
  - Covers Customer Support, Technical Support, New Staff Onboarding Support, Account Support, Administrative Support, and Billing & Payment Support.
  - Accessible pre-login from the sign-in portal as well as via Staff **Help & Support** and Admin **Support Desk**, with PostgreSQL ticket & thread tracking, real-time notifications, direct `mailto:` handoff, and optional SMTP dispatch to `adwebcomicllp@gmail.com`.

---

## First-Run Administrator Bootstrap & Authentication

WebX ships with **zero demo, mock, or pre-seeded data** in PostgreSQL:
- **First-Run Administrator Setup**: When no `ADMIN` user exists yet, the login screen renders a one-time **Initialize WebX Administrator** form (`POST /api/auth/bootstrap`) to claim the first admin account securely. Once an admin exists, the bootstrap endpoint locks permanently (`409 Conflict`).
- **Google Sign-In**: Enabled via Firebase Authentication (`ADMIN_OWNER_EMAIL` is automatically assigned `ADMIN` role on Google Sign-In; other Google sign-ins default to `STAFF`).
- **Staff Provisioning**: Administrators create and manage Staff/Admin credentials and role permissions from **Admin Panel → Staff Management**.

---

## Environment Variables

Configure runtime variables in your environment (see `.env.example`):

| Variable | Description |
|---|---|
| `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD` | Cloud SQL PostgreSQL runtime connection credentials |
| `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` | Cloud SQL admin credentials for Drizzle Kit schema pushes |
| `EXCHANGE_RATE_API_URL` | Exchange rate feed URL (defaults to `https://open.er-api.com/v6/latest/AED`) |
| `EXCHANGE_RATE_API_KEY` | Optional Bearer API key for paid exchange-rate providers |
| `SESSION_SECRET` | HMAC secret for credentials session tokens (falls back to a runtime random secret if unset) |
| `ADMIN_OWNER_EMAIL` | Optional Google email automatically assigned `ADMIN` role on Google Sign-In |
| `SUPPORT_EMAIL` | Official WebX Support Desk recipient email (defaults to `adwebcomicllp@gmail.com`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional SMTP relay settings for automated ticket email dispatch |

---

## Scripts & Verification

```bash
# Run development server (Express API + WebSockets + Vite SPA on port 3000)
npm run dev

# Build production frontend bundle
npm run build

# Start production server
npm start

# Type-check TypeScript
npm run lint

# Run unit tests (balance calculation, conversion, rounding, reversal rate lock, fallback/unavailable rate, closed-day lock)
npm test
```
