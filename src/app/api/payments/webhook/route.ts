import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/server/repositories/payment.repository'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'

export async function POST(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = applyRateLimit(req, 'payments/webhook', RATE_LIMITS.webhook)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'payments/webhook' })
    return rateLimited
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-helpbibi-signature') || req.headers.get('x-signature') || ''
    logger.info('webhook', 'received', { ip: getClientIp(req), signaturePresent: !!signature })
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => { headers[k] = v })
    const result = await processWebhook(rawBody, signature, headers)

    if (result.processed) {
      audit('webhook_received', { ip: getClientIp(req), route: 'payments/webhook', target: result.recordId })
      return NextResponse.json({ ok: true, message: result.reason, recordId: result.recordId })
    }

    // Distinguish invalid signature vs duplicate vs other failures via reason text
    if (result.reason && result.reason.startsWith('Signature invalid')) {
      logger.warn('webhook', 'invalid signature', { ip: getClientIp(req) })
      audit('webhook_invalid_signature', { ip: getClientIp(req), route: 'payments/webhook' })
    } else if (result.reason && result.reason.startsWith('Duplicate webhook')) {
      audit('webhook_duplicate', { ip: getClientIp(req), route: 'payments/webhook', target: result.recordId })
    }

    return NextResponse.json({ ok: false, message: result.reason, recordId: result.recordId }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || 'Webhook error' }, { status: 500 })
  }
}
