# Help Bibi — Admin Auth

> FASE 27 — Admin authentication and authorization.

## Overview

Admin access is protected by session-based authentication with role `ADMIN`. The admin UI is at `/admin`.

## Login

### Dev/Demo (ADMIN_SEED_ENABLED=true)
- URL: `/admin`
- Email: `admin@helpbibi.local`
- Password: `Admin123!`
- The seed admin user is created on first login if it doesn't exist.

### Production
- Seed credentials are **BLOCKED** (403 Forbidden).
- Production requires a real admin user in the database with `role: 'ADMIN'`.
- Create admin user via script (documented below) or direct DB insert.
- Set `ADMIN_SEED_ENABLED=false` in production.

## Creating Admin Users (Production)

```bash
# Option 1: Prisma script
bun -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.create({
  data: { email: process.env.ADMIN_EMAIL, name: 'Admin', role: 'ADMIN' }
}).then(u => { console.log('Admin created:', u.id); db.\$disconnect(); });
"

# Option 2: SQL
INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'admin@yourdomain.com', 'Admin', 'ADMIN', NOW(), NOW());
```

## Session

- Cookie: `hb_session` (HMAC-signed, HttpOnly, SameSite=Lax, Secure in production)
- TTL: 7 days
- `GET /api/auth/me` returns current user (401 if not authenticated)
- `POST /api/auth/logout` clears cookie

## Authorization

### API Routes (Production)
- `/api/admin/payments` — `requireRole(req, 'ADMIN')`
- `/api/admin/providers/[id]/approve` — `requireRole(req, 'ADMIN')`
- `/api/admin/audit` — `requireRole(req, 'ADMIN')`
- `/api/admin/login` — public (rate limited)

### API Routes (Dev)
- Admin routes use `NODE_ENV` guard (accessible without session in dev for demo)
- `admin/login` with seed credentials works only if `ADMIN_SEED_ENABLED=true`

## Audit Trail

All admin actions are audited:
- `admin_login` — successful admin login
- `login_failure` — failed login attempt
- `provider_approved` — provider verification changed
- `unauthorized_access` — non-admin attempted admin route
- `rate_limit_exceeded` — rate limit hit on admin route

Audit events are persisted to `AuditLog` table (when `AUDIT_LOG_BACKEND=database`) or in-memory buffer (default dev).

## Security

- IP addresses are hashed (SHA-256, truncated) before storage in audit logs
- Metadata is sanitized (secrets redacted, emails/phones masked)
- Rate limited: 10 login attempts per minute per IP
- No raw secrets in logs or audit
