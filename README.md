# Laboratory Management System (LMS)

A full-stack Laboratory Management System, covering
the **core patient → order → sample → result → report → billing workflow**
end-to-end. Built with Angular, Node/Express, and PostgreSQL.


## Stack

- **Backend:** Node.js + Express + TypeScript, PostgreSQL (via `pg`), JWT auth, PDFKit for reports
- **Frontend:** Angular 18 (standalone components), plain CSS (no UI framework)
- **Database:** PostgreSQL 16

## Quick start (Docker — recommended)

Requires Docker + Docker Compose.

```bash
cd lms
docker compose up --build -d

# Run once, after the containers are up:
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- Postgres: localhost:5432 (user/pass/db: `lms`/`lms`/`lms`)

Log in with any of the seeded demo accounts (password `password123`):

| Email                      | Role            |
|----------------------------|-----------------|
| admin@demo.lab             | super_admin     |
| manager@demo.lab           | lab_manager     |
| reception@demo.lab         | receptionist    |
| phlebotomist@demo.lab      | phlebotomist    |
| tech@demo.lab              | lab_technician  |
| pathologist@demo.lab       | pathologist     |
| accountant@demo.lab        | accountant      |

## Quick start (without Docker)

You need Node.js 20+ and a running PostgreSQL 16 instance.

```bash
# 1. Database
createdb lms
psql lms -c "CREATE USER lms WITH PASSWORD 'lms' SUPERUSER;"   # or use an existing user

# 2. Backend
cd backend
cp .env.example .env      # edit DATABASE_URL if needed
npm install
npm run migrate            # applies schema.sql
npm run seed                # creates demo org/branch/users/test catalog
npm run dev                 # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm start                   # http://localhost:4200
```

## The workflow this scaffold implements

1. **Register a patient** (with phone/ID duplicate detection) — Patients page
2. **Create an order**: pick tests, get an auto-generated order number and computed total — Orders page
3. **Generate specimens**: one barcode per specimen type in the order — Order Detail page
4. **Collect** the specimen (phlebotomist role) → **Accession/receive** it in the lab (lab_technician role), or **reject** it with a reason
5. **Enter results** against each test parameter — automatically flagged (normal/low/high/critical) against age- and gender-specific reference ranges
6. **Verify results** (pathologist role) — once every result on the order is verified, the order auto-completes
7. **Generate a PDF report** with a public verification link (`/verify/:token`, no login required)
8. **Bill it**: create an invoice from the order, record partial or full payments, track amount due

Every step enforces the relevant role via JWT (see `backend/src/middleware/auth.ts`).

## Project layout

```
lms/
├── backend/
│   ├── src/
│   │   ├── db/            # schema.sql, pool.ts, migrate.ts
│   │   ├── routes/        # one file per resource (patients, orders, specimens, results, reports, billing…)
│   │   ├── middleware/     # JWT auth + role guard
│   │   ├── helpers/        # order/barcode numbering, reference-range flagging logic
│   │   └── seed.ts
│   └── Dockerfile
├── frontend/
│   ├── src/app/
│   │   ├── core/           # api.service.ts, auth.service.ts, models, guards, interceptor
│   │   └── pages/          # login, shell (nav), patients, orders, order-detail, samples, report-verify
│   └── Dockerfile
└── docker-compose.yml
```

## What's implemented

**Phase 1 — core workflow:** patient registration, orders, specimens/barcodes, collection & accessioning,
result entry with reference-range flagging, verification, PDF reports with public verification link,
invoicing/payments, role-based access, audit logging.

**Phase 2:** user & doctor management, audit log viewer, in-app notifications, critical-value acknowledgment workflow.

**Phase 3:**
- Specimen redraw (replacement barcode for rejected specimens), test packages/panels, department CRUD, result amendment history
- Inventory (stock, transactions, low-stock and expiry alerts) and Quality Control (Westgard rule evaluation)
- Doctor portal (referring doctors see only their own patients' reports), multi-branch management
- CSV export, printable specimen labels, forgot/reset password, message log, patient portal OTP login

**Phase 4:**
- Real SMS (Twilio) and email (SendGrid) delivery, with `sent`/`failed` status and error stored in the message log
- OTP hardening: max 3 codes per number per 10 minutes, code locks after 5 wrong attempts
- Levey-Jennings chart on the QC page (mean, ±1/2/3 SD lines, out-of-control points highlighted)
- Branch switcher for super admins (re-issues the session token for the chosen branch; audited)
- Fixed: QC Westgard checks and results list were using the *oldest* data points instead of the latest

**Not yet implemented:** equipment/instrument management, HL7/analyzer interfacing, discounts/refunds/insurance
billing, cross-branch comparison reports, automated tests.

## Messaging configuration

Set these environment variables to enable real delivery. Without them, messages are only recorded as `queued`
in the message log (fine for development, but OTP and password-reset messages will not reach anyone).

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio credentials |
| `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` | SMS sender |
| `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Email via SendGrid |
| `DEFAULT_COUNTRY_CODE` | Prefix for local numbers starting with 0 (default `+92`) |
| `FRONTEND_URL` | Base URL used in password-reset links |

## Extending it

- New test types: `POST /api/catalog/tests` (supports nested parameters + reference ranges in one call)
- New role: add to the `role` CHECK constraint in `schema.sql` and to `requireRole(...)` calls where needed
- New report layout: `backend/src/routes/reports.ts` — PDF is generated with PDFKit, straightforward to restyle
