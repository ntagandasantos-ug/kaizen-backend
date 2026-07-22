# Kaizen Portal — Backend

A real Express + PostgreSQL API for the Kaizen Committee Portal, with Cloudflare R2 (or S3) for
photos, videos, and audit reports. This has been tested end-to-end: schema migration, seeding,
login, authenticated score submission, SQL-based rankings, and role-based rejection all verified
working against a live Postgres instance.

## Local development

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL, JWT_SECRET, S3_* values
npm run migrate              # creates all tables
npm run seed                 # creates your first admin user + default departments
npm run dev                  # starts the API on http://localhost:4000
```

Log in with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env`, then immediately
call `/api/auth/change-password` to set a real password.

## API summary

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Get a JWT |
| GET | `/api/auth/me` | any | Confirm current user |
| POST | `/api/auth/change-password` | any | Change your own password |
| GET | `/api/departments` | — | Public list |
| POST/PATCH/DELETE | `/api/departments` | admin | Manage departments |
| GET | `/api/committee` | — | Public list |
| POST/PATCH/DELETE | `/api/committee` | admin | Manage committee/auditors |
| GET | `/api/audits` | — | Public audit records |
| GET | `/api/audits/rankings` | — | YTD standings (computed in SQL) |
| GET | `/api/audits/monthly-winners` | — | Monthly winner per month |
| PUT | `/api/audits` | auditor/admin | Submit or update a score |
| GET | `/api/events` | — | Public calendar |
| POST/DELETE | `/api/events` | admin | Manage events |
| POST | `/api/media/upload-url` | auditor/admin | Get a signed upload URL |
| POST | `/api/media/confirm` | auditor/admin | Confirm upload, save reference |
| GET | `/api/media/audit/:auditId` | — | List media for an audit |
| GET | `/api/media/:id/view-url` | — | Signed URL to view a private file |
| DELETE | `/api/media/:id` | admin | Delete a file |

## Why files never touch this server

Uploads follow a **direct-to-storage** pattern: the browser asks this API for a signed URL,
then uploads the file straight to R2/S3. This server only ever stores a reference (URL) in
Postgres — which is what makes it safe to handle large video files without your API server
running out of memory or timing out.

## Deploying

See `../DEPLOYMENT.md` in the project root for the full walkthrough: provisioning Postgres,
creating the R2 bucket, deploying this API to Railway, deploying the frontend to Vercel, and
pointing a custom domain at the finished site.
