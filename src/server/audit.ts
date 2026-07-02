// Help Bibi — Audit Log helper (FASE 26)
// Lightweight in-memory + structured log audit trail.
// Option A: no DB model, just structured logs via logger.
// Critical events are logged with context but NO sensitive data.

import { logger } from '@/server/logger'

export type AuditEvent =
  | 'admin_login'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'provider_approved'
  | 'provider_rejected'
  | 'provider_blocked'
  | 'webhook_received'
  | 'webhook_invalid_signature'
  | 'webhook_duplicate'
  | 'payment_failed'
  | 'payment_invalid_transition'
  | 'rate_limit_exceeded'
  | 'unauthorized_access'

export type AuditContext = {
  actor?: string          // userId or 'anonymous'
  actorRole?: string      // CLIENT | PROVIDER | ADMIN
  ip?: string
  route?: string
  target?: string         // e.g. serviceRequestId, providerProfileId
  metadata?: Record<string, unknown>  // sanitized by logger
}

/**
 * Record an audit event. Goes through the secure logger which masks
 * sensitive data and redacts secrets.
 *
 * Note: not exported directly — the exported `audit` is the wrapped
 * `auditWithBuffer` defined below (also pushes to the in-memory buffer).
 * Exporting the same name twice causes a SyntaxError in bun/ESM.
 */
function audit(event: AuditEvent, context: AuditContext): void {
  logger.info('audit', event, {
    event,
    actor: context.actor || 'anonymous',
    actorRole: context.actorRole,
    ip: context.ip,
    route: context.route,
    target: context.target,
    metadata: context.metadata,
  })
}

// In-memory recent audit buffer (last 100 events) for quick admin inspection.
// In production, this would be persisted to DB or external log aggregator.
type AuditEntry = { event: AuditEvent; context: AuditContext; at: string }
const buffer: AuditEntry[] = []
const MAX_BUFFER = 100

function pushBuffer(event: AuditEvent, context: AuditContext): void {
  buffer.push({ event, context, at: new Date().toISOString() })
  while (buffer.length > MAX_BUFFER) buffer.shift()
}

export function getRecentAuditEvents(limit: number = 50): AuditEntry[] {
  return buffer.slice(-limit)
}

// Wrap audit() to also push to buffer
const _originalAudit = audit
function auditWithBuffer(event: AuditEvent, context: AuditContext): void {
  _originalAudit(event, context)
  pushBuffer(event, context)
}

export { auditWithBuffer as audit }
