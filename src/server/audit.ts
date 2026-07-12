// Help Bibi — Audit Log helper (FASE 27 refactor)
// Supports an in-memory buffer (default) OR persistent AuditLog rows.
//
// Backend is selected via `AUDIT_LOG_BACKEND` env var:
//   - 'memory'    (default): only keep the in-memory ring buffer (last 100 events).
//   - 'database'           : also persist every event to the AuditLog Prisma model
//                            (fire-and-forget, non-blocking) AND keep the buffer.
//
// Security:
//   - Never store raw IPs in the database. IPs are hashed with SHA-256 (truncated
//     to 16 hex chars) before being persisted.
//   - Metadata is run through the logger's `sanitizeValue` to redact secrets /
//     mask PII before persistence.
//   - `audit()` itself NEVER throws — failures are logged but suppressed.

import { createHash } from 'crypto'
import { logger, sanitizeValue } from '@/server/logger'
import { db } from '@/server/db/prisma'

export type AuditEvent =
  | 'admin_login'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'provider_approved'
  | 'provider_rejected'
  | 'provider_blocked'
  | 'provider_suspended'
  | 'request_created'
  | 'offer_sent'
  | 'offer_accepted'
  | 'offer_declined'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'service_started'
  | 'service_completed'
  | 'service_cancelled'
  | 'webhook_received'
  | 'webhook_invalid_signature'
  | 'webhook_duplicate'
  | 'payment_failed'
  | 'payment_invalid_transition'
  | 'rate_limit_exceeded'
  | 'unauthorized_access'

export type AuditSeverity = 'info' | 'warning' | 'error'

export type AuditContext = {
  actor?: string          // userId or 'anonymous'
  actorRole?: string      // CLIENT | PROVIDER | ADMIN
  ip?: string
  route?: string
  target?: string         // e.g. serviceRequestId, providerProfileId
  userAgent?: string
  severity?: AuditSeverity
  metadata?: Record<string, unknown>  // sanitized by logger / sanitizeValue
}

// In-memory recent audit buffer (last 100 events) for quick admin inspection.
// Kept in BOTH backends — gives admin UI a fast, always-available view even if
// the DB read fails.
type AuditEntry = { event: AuditEvent; context: AuditContext; at: string }
const buffer: AuditEntry[] = []
const MAX_BUFFER = 100

function pushBuffer(event: AuditEvent, context: AuditContext): void {
  buffer.push({ event, context, at: new Date().toISOString() })
  while (buffer.length > MAX_BUFFER) buffer.shift()
}

/**
 * Resolve which audit backend is configured.
 * Unknown values fall back to 'memory' (safe default).
 */
export function getAuditBackend(): 'memory' | 'database' {
  const v = (process.env.AUDIT_LOG_BACKEND || 'memory').toLowerCase()
  return v === 'database' ? 'database' : 'memory'
}

/** Hash an IP address with SHA-256 (truncated to 16 hex chars). Never store raw IPs. */
function hashIp(ip?: string): string | null {
  if (!ip) return null
  try {
    return createHash('sha256').update(ip).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

/** Map an arbitrary actorRole string to the UserRole enum (or null). */
function normalizeActorRole(
  role?: string
): 'CLIENT' | 'PROVIDER' | 'ADMIN' | null {
  if (role === 'CLIENT' || role === 'PROVIDER' || role === 'ADMIN') return role
  return null
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function safeJsonParse(s: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(s)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Persist an audit event to the AuditLog Prisma model.
 * Fire-and-forget (non-blocking): `audit()` is sync by contract, so we never
 * await this. Errors are logged but never thrown.
 */
function persistToDatabase(event: AuditEvent, context: AuditContext): void {
  const sanitizedMeta = context.metadata
    ? sanitizeValue(context.metadata)
    : null
  const metadataJson = sanitizedMeta ? safeJsonStringify(sanitizedMeta) : null
  const severity: AuditSeverity = context.severity || 'info'

  // actorUserId: only persist real IDs (not 'anonymous' / undefined).
  const actorUserId =
    context.actor && context.actor !== 'anonymous' ? context.actor : null

  // Fire-and-forget — do NOT await.
  void db.auditLog
    .create({
      data: {
        eventType: event,
        actorUserId,
        actorRole: normalizeActorRole(context.actorRole),
        targetType: context.target ? 'entity' : null,
        targetId: context.target || null,
        severity,
        message: event,
        metadata: metadataJson,
        ipHash: hashIp(context.ip),
        userAgent: context.userAgent || null,
      },
    })
    .catch((err: unknown) => {
      // Never throw from audit persistence — just log.
      logger.error('audit', 'Failed to persist audit event to DB', {
        event,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

/**
 * Record an audit event.
 * - Always emits a structured log line via the secure logger (which masks PII).
 * - Always pushes to the in-memory buffer (for quick admin inspection).
 * - If AUDIT_LOG_BACKEND=database, also persists to the AuditLog Prisma model
 *   (fire-and-forget, non-blocking).
 *
 * Signature: `audit(event: AuditEvent, context: AuditContext): void` — unchanged
 * from FASE 26 so all existing callers keep working.
 */
export function audit(event: AuditEvent, context: AuditContext): void {
  logger.info('audit', event, {
    event,
    actor: context.actor || 'anonymous',
    actorRole: context.actorRole,
    ip: context.ip,
    route: context.route,
    target: context.target,
    metadata: context.metadata,
  })
  pushBuffer(event, context)
  if (getAuditBackend() === 'database') {
    persistToDatabase(event, context)
  }
}

/**
 * Read recent audit events.
 *
 * - If AUDIT_LOG_BACKEND=database: reads from the AuditLog Prisma model
 *   (most recent `limit`, then reversed to most-recent-last to match buffer
 *   semantics).
 * - Otherwise: reads from the in-memory buffer.
 *
 * Returns a normalized AuditEntry[] shape so callers (admin UI, tests) don't
 * need to care which backend is active. Async because the DB path is async.
 */
export async function getRecentAuditEvents(
  limit: number = 50
): Promise<AuditEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500))

  if (getAuditBackend() === 'database') {
    try {
      const rows = await db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
      })
      // Normalize to AuditEntry shape; reverse so newest is last (matches buffer).
      const entries: AuditEntry[] = rows
        .map((r) => ({
          event: r.eventType as AuditEvent,
          context: {
            actor: r.actorUserId || 'anonymous',
            actorRole: r.actorRole || undefined,
            // Never expose a raw IP — only the hash prefix (for correlation).
            ip: r.ipHash ? `hash:${r.ipHash}` : undefined,
            target: r.targetId || undefined,
            severity: (r.severity as AuditSeverity) || undefined,
            metadata: r.metadata ? safeJsonParse(r.metadata) : undefined,
          } as AuditContext,
          at: r.createdAt.toISOString(),
        }))
        .reverse()
      return entries
    } catch (err: unknown) {
      logger.error(
        'audit',
        'Failed to read audit events from DB; falling back to buffer',
        { error: err instanceof Error ? err.message : String(err) }
      )
      return buffer.slice(-safeLimit)
    }
  }

  return buffer.slice(-safeLimit)
}

/** Test/dev helper: clear the in-memory buffer. */
export function _clearAuditBufferForTests(): void {
  buffer.length = 0
}
