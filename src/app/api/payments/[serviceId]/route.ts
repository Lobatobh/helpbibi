import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'

/**
 * GET /api/payments/[serviceId]
 * Returns the latest PaymentRecord for a service. Used by client/admin to check payment status.
 * Note: this endpoint is NOT public-tracking safe — only the client/provider/admin should call it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const { serviceId } = await params
    const payment = await db.paymentRecord.findFirst({
      where: { serviceRequestId: serviceId },
      orderBy: { createdAt: 'desc' },
    })
    if (!payment) {
      return NextResponse.json({ available: false, message: 'Nenhum registro de pagamento.' })
    }
    return NextResponse.json({
      available: true,
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      platformFee: payment.platformFee,
      providerPayout: payment.providerPayout,
      discountAmount: payment.discountAmount,
      couponCode: payment.couponCode,
      simulatedTransactionId: payment.simulatedTransactionId,
      paidAt: payment.paidAt?.getTime() || null,
      failedAt: payment.failedAt?.getTime() || null,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.getTime(),
    })
  } catch (error) {
    console.error('[api/payments] Error:', error)
    return NextResponse.json({ available: false, message: 'Erro ao buscar pagamento.' }, { status: 500 })
  }
}
