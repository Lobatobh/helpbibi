// Help Bibi — Secure Logger (FASE 26)
// Never logs: secrets, cookies, tokens, card data, full webhook payloads.
// Masks: email, phone, payment card numbers if present.

const SENSITIVE_KEYS = [
  'password', 'secret', 'token', 'cookie', 'authorization', 'apikey', 'api_key',
  'session', 'sessionId', 'cvv', 'cardNumber', 'card_number', 'security_code',
  'access_token', 'refresh_token', 'privateKey', 'private_key',
]

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(\+?\d{2,3})?\s?(\d{2})\s?(\d{4,5})-?(\d{4})/g
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g

function maskEmail(s: string): string {
  return s.replace(EMAIL_RE, (m) => {
    const [user, domain] = m.split('@')
    if (!domain) return m
    const maskedUser = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '*'.repeat(Math.max(1, user.length - 2))
    return `${maskedUser}@${domain}`
  })
}

function maskPhone(s: string): string {
  return s.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, '')
    if (digits.length < 8) return m
    return digits.slice(0, 2) + ' ****-' + digits.slice(-4)
  })
}

function maskCard(s: string): string {
  return s.replace(CARD_RE, (m) => {
    const digits = m.replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19) return m
    return digits.slice(0, 6) + '*'.repeat(digits.length - 10) + digits.slice(-4)
  })
}

function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 5) return '[max depth]'
  if (val === null || val === undefined) return val
  if (typeof val === 'string') {
    let s = val
    s = maskCard(s)
    s = maskEmail(s)
    s = maskPhone(s)
    // Redact long strings that might be tokens/secrets
    if (s.length > 500) return s.slice(0, 100) + '...[redacted long string]'
    return s
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val
  if (val instanceof Date) return val.toISOString()
  if (val instanceof Error) return { name: val.name, message: val.message }
  if (Array.isArray(val)) return val.slice(0, 20).map((v) => sanitizeValue(v, depth + 1))
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      const lowerKey = k.toLowerCase()
      if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
        out[k] = '[redacted]'
      } else {
        out[k] = sanitizeValue(v, depth + 1)
      }
    }
    return out
  }
  return val
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatLog(level: LogLevel, context: string, message: string, data?: unknown): string {
  const ts = new Date().toISOString()
  const base = `[${ts}] [${level.toUpperCase()}] [${context}] ${message}`
  if (data === undefined) return base
  const sanitized = sanitizeValue(data)
  try {
    return `${base} ${JSON.stringify(sanitized)}`
  } catch {
    return `${base} [unserializable data]`
  }
}

export const logger = {
  debug(context: string, message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug') return
    console.debug(formatLog('debug', context, message, data))
  },
  info(context: string, message: string, data?: unknown): void {
    console.info(formatLog('info', context, message, data))
  },
  warn(context: string, message: string, data?: unknown): void {
    console.warn(formatLog('warn', context, message, data))
  },
  error(context: string, message: string, data?: unknown): void {
    console.error(formatLog('error', context, message, data))
  },
}

// Exported for testing
export { sanitizeValue, maskEmail, maskPhone, maskCard, SENSITIVE_KEYS }
