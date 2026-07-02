import { NextRequest, NextResponse } from 'next/server'
import { listPaymentsByStatus } from '@/server/repositories/payment.repository'
import type { PaymentStatus } from '@/server/payments/payment-state-machine'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { requireRole } from '@/server/auth/session'

const VALID_STATUSES: PaymentStatus[] = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED']

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = applyRateLimit(req, 'admin/payments', RATE_LIMITS.admin)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/payments' })
    return rateLimited
  }

  // FASE 26: admin role protection
  if (process.env.NODE_ENV === 'production') {
    try {
      await requireRole(req, 'ADMIN')
    } catch (e: any) {
      audit('unauthorized_access', { route: 'admin/payments', ip: getClientIp(req), actorRole: 'unknown' })
      return NextResponse.json({ message: e.message }, { status: 401 })
    }
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status') as PaymentStatus | null
  const status = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined
  const payments = await listPaymentsByStatus(status)
  return NextResponse.json({
    payments, count: payments.length,
    summary: {
      total: payments.length,
      totalAmount: payments.reduce((s, p) => s + p.amount, 0),
      totalPlatformFee: payments.reduce((s, p) => s + p.platformFee, 0),
      totalProviderPayout: payments.reduce((s, p) => s + p.providerPayout, 0),
      byStatus: VALID_STATUSES.reduce((acc, st) => { acc[st] = payments.filter((p) => p.status === st).length; return acc }, {} as Record<string, number>),
    },
  })
}
