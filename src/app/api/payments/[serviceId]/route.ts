import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/server/auth/session'
import {
  getPaymentViewForService,
  handleSimulatedPaymentError,
} from '@/server/payments/simulated-payment-workflow'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const user = await requireCurrentUser(req)
    const { serviceId } = await params
    const payment = await getPaymentViewForService(user, serviceId)
    return NextResponse.json(payment)
  } catch (error) {
    const mapped = handleSimulatedPaymentError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
