import { NextRequest, NextResponse } from 'next/server'
import { listPaymentsByStatus } from '@/server/repositories/payment.repository'
import type { PaymentStatus } from '@/server/payments/payment-state-machine'

const VALID_STATUSES: PaymentStatus[] = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED']

export async function GET(req: NextRequest) {
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
