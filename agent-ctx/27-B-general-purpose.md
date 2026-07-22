# Task 27-B — Agent Work Record

**Task ID:** 27-B
**Agent:** general-purpose
**Task:** Audit persistence (AuditLog model) + admin auth UI + admin login/audit routes

## Files Created / Modified

### Modified
- `src/server/audit.ts` — full refactor: memory + database backends, IP hashing, metadata sanitization, async `getRecentAuditEvents`.
- `.env` — added `ADMIN_SEED_ENABLED=true` (dev only) and `AUDIT_LOG_BACKEND=memory` (default).

### Created
- `src/app/api/admin/login/route.ts` — POST admin login (dev seed + prod block + rate limit + audit).
- `src/app/api/admin/audit/route.ts` — GET recent audit events (prod: ADMIN role required).
- `src/app/admin/page.tsx` — client admin console (login form + dashboard with financial summary + audit feed).

## Key Decisions / Notes for Other Agents

### `getRecentAuditEvents` is now ASYNC
The signature changed from `(limit?) => AuditEntry[]` to `(limit?) => Promise<AuditEntry[]>`.

**Why:** Reading from the AuditLog Prisma model requires `await db.auditLog.findMany(...)`. To keep a single consistent signature across both backends, the function is now always async.

**Impact on tests:** `src/server/__tests__/audit.test.ts` calls it synchronously and will fail. The test agent MUST update those tests to `await getRecentAuditEvents()` and `await getRecentAuditEvents(2)`. The buffer semantics (newest-last, limit-respecting) are unchanged in 'memory' mode.

**Impact on callers:** Only `src/app/api/admin/audit/route.ts` uses it in production code, and it already uses `await`. No other production callers.

### `audit()` signature is UNCHANGED
`audit(event: AuditEvent, context: AuditContext): void` — same as FASE 26. The DB write is fire-and-forget (`void db.auditLog.create().catch(...)`), so callers never block and never see DB errors.

### New optional `AuditContext` fields
Added `severity?: 'info' | 'warning' | 'error'` and `userAgent?: string` to `AuditContext`. Both optional, backward compatible. Existing callers keep working unchanged.

### IP hashing (DB persistence only)
- Raw IPs are NEVER persisted to the AuditLog table.
- `hashIp(ip)` = `crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)`.
- When `getRecentAuditEvents` reads from DB, it returns the hash prefixed with `hash:` (e.g. `hash:a1b2c3d4e5f6a7b8`) — never the raw IP.
- The in-memory buffer still stores the raw `context.ip` for dev convenience (buffer is per-process, never shared, never persisted). This preserves existing behavior — if a future agent wants the buffer to also hash, that's a separate change.

### Metadata sanitization
- Before DB persistence, `context.metadata` is run through `sanitizeValue` (exported from `@/server/logger`) which redacts `password`, `secret`, `token`, `cookie`, `authorization`, etc., and masks emails/phones/cards.
- The sanitized object is `JSON.stringify`'d into the `metadata` String column (SQLite-safe).
- On read, it's `JSON.parse`'d back into the `metadata` field of the returned `AuditEntry.context`.

### Backend selection
- `getAuditBackend()` reads `process.env.AUDIT_LOG_BACKEND` (default `'memory'`). Any value other than `'database'` falls back to `'memory'`.
- Default `.env` ships with `AUDIT_LOG_BACKEND=memory` so dev behavior is unchanged from FASE 26.
- To exercise DB persistence: set `AUDIT_LOG_BACKEND=database` and the existing AuditLog table (already in schema, already pushed via `bun run db:push`) will receive rows.

### Admin login flow
- `POST /api/admin/login` accepts `{ email, password }`.
- **Production:** ALWAYS returns 403 for any seed credential attempt (logs `login_failure` with `reason: 'seed_blocked_in_prod'`).
- **Discontinued legacy dev seed:** formerly accepted `admin@helpbibi.local` / `<REMOVED_LEGACY_DEV_PASSWORD>`. This flow is retained only as historical context; `scripts/bootstrap-admin.ts` is the only permitted admin bootstrap.
- **Dev with `ADMIN_SEED_ENABLED` not set / false:** returns 401 with a hint message. Audits `login_failure` with `reason: 'seed_disabled'`.
- Rate limited: `RATE_LIMITS.login` (10/min per IP).

### Admin audit route
- `GET /api/admin/audit` returns `{ events, count }` (last 50).
- Production: requires ADMIN session (`requireRole(req, 'ADMIN')`); 401 + `unauthorized_access` audit on failure.
- Dev: open (matches the existing guard pattern in `/api/admin/payments` and `/api/admin/providers/[id]/approve`).
- Rate limited: `RATE_LIMITS.admin` (60/min per IP).

### Admin page (/admin)
- Client component, checks `/api/auth/me` on mount.
- Not authenticated → login form (email + password + "Entrar como Admin" button).
- Authenticated but not ADMIN → "Acesso negado" warning card + login form.
- Authenticated as ADMIN → dashboard:
  - Header with "Help Bibi Admin" + user name + ADMIN badge + Logout button.
  - Quick-link cards: Financeiro, Prestadores, Dashboard.
  - Financial summary card (from `/api/admin/payments`): total payments, platform fee, provider payout, by-status breakdown, recent payments table.
  - Audit feed card (from `/api/admin/audit`): last 20 events with eventType, actor, severity badge, timestamp.
- Colors: neutral/slate/emerald (NO indigo/blue per spec).
- Responsive (mobile-first, `sm:`/`lg:` breakpoints), sticky footer, accessible labels.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- `bun run build` → ✓ compiled, all 17 routes generated including `/admin`, `/api/admin/audit`, `/api/admin/login`.
- `bun run db:push` → schema already in sync (AuditLog table exists).
- Dev server log shows normal operation after `.env` reload (no errors).

## What Other Agents May Need to Know
- **Test agent:** update `src/server/__tests__/audit.test.ts` to `await getRecentAuditEvents()` everywhere. Consider adding a test for DB persistence (set `AUDIT_LOG_BACKEND=database` env in test, verify `db.auditLog` row is created) and for IP hashing (verify `ipHash` is a 16-char hex string, not the raw IP).
- **Test agent:** the legacy `ADMIN_SEED_ENABLED` flow is discontinued. Use admins provisioned exclusively through `scripts/bootstrap-admin.ts` in controlled test setup.
- **Frontend agent:** the `/admin` page is fully self-contained — no new shared components were extracted. If you want to reuse the `MetricCard` / `QuickLinkCard` / severity badge helpers, they're defined inline in `src/app/admin/page.tsx`.
