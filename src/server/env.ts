// Help Bibi — Environment Variable Validation
const INSECURE_VALUES = new Set(['dev_webhook_secret_change_me','change_me_to_a_random_64_char_string','change_me','dev_secret',''])

export type EnvValidationResult = { ok: boolean; missing: string[]; insecure: string[]; warnings: string[] }

export function validateEnv(): EnvValidationResult {
  const isProd = process.env.NODE_ENV === 'production'
  const required = ['DATABASE_URL','SESSION_SECRET','PAYMENT_WEBHOOK_SECRET']
  const publicRequired = ['NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SOCKET_URL']
  const missing: string[] = []; const insecure: string[] = []; const warnings: string[] = []
  for (const key of required) { const v = process.env[key]; if (!v) missing.push(key); else if (isProd && INSECURE_VALUES.has(v)) insecure.push(key) }
  for (const key of publicRequired) { if (!process.env[key]) warnings.push(`${key} not set — using default`) }
  if (isProd && !process.env.SOCKET_CORS_ORIGIN) warnings.push('SOCKET_CORS_ORIGIN not set in production — Socket.IO will block all origins')
  const gw = process.env.PAYMENT_GATEWAY_PROVIDER || 'simulated'
  if (isProd && gw === 'simulated') warnings.push('PAYMENT_GATEWAY_PROVIDER=simulated in production — no real payments will be processed')
  // FASE 27 — Production must use PostgreSQL, NOT SQLite
  const dbUrl = process.env.DATABASE_URL || ''
  if (isProd && dbUrl.startsWith('file:')) {
    insecure.push('DATABASE_URL (SQLite is NOT allowed in production — use PostgreSQL)')
  }
  if (isProd && !dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    if (!dbUrl.startsWith('file:')) insecure.push('DATABASE_URL (must be a postgresql:// URL in production)')
  }
  // FASE 27 — Rate limiting backend
  const rateLimitBackend = process.env.RATE_LIMIT_BACKEND || 'memory'
  if (isProd && rateLimitBackend === 'memory') {
    insecure.push('RATE_LIMIT_BACKEND=memory (in-memory rate limiting is NOT safe for multi-instance production — use redis)')
  }
  if (rateLimitBackend === 'redis' && !process.env.REDIS_URL && isProd) {
    missing.push('REDIS_URL (required when RATE_LIMIT_BACKEND=redis)')
  }
  // FASE 27 — Audit log backend
  const auditBackend = process.env.AUDIT_LOG_BACKEND || 'memory'
  if (isProd && auditBackend === 'memory') {
    warnings.push('AUDIT_LOG_BACKEND=memory (audit logs lost on restart — use database for production)')
  }
  const ok = missing.length === 0 && insecure.length === 0
  if (!ok && isProd) { const msgs = [...(missing.length?[`Missing: ${missing.join(', ')}`]:[]),...(insecure.length?[`Insecure: ${insecure.join(', ')}`]:[])]; throw new Error(`[env] Production validation failed:\n${msgs.join('\n')}`) }
  if (!isProd) { if (missing.length) console.warn(`[env] Missing (dev ok): ${missing.join(', ')}`); if (insecure.length) console.warn(`[env] Insecure (dev ok): ${insecure.join(', ')}`) }
  for (const w of warnings) console.warn(`[env] ${w}`)
  return { ok, missing, insecure, warnings }
}

export function requireEnv(key: string, fallback?: string): string {
  const v = process.env[key]; if (v) return v; if (fallback !== undefined) return fallback
  if (process.env.NODE_ENV === 'production') throw new Error(`[env] Required env var ${key} is not set`)
  return ''
}
