import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

/**
 * GET /api/admin/payments/[id]/events
 * Returns the PaymentEvent audit trail for a specific PaymentRecord.
 * Admin-only — used in the financial detail view.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, 'ADMIN')
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.message?.startsWith('Forbidden') ? 403 : 401 },
    )
  }

  try {
    const { id } = await params
    const events = await db.paymentEvent.findMany({
      where: { paymentRecordId: id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      message: e.message,
      createdAt: e.createdAt.getTime(),
    })))
  } catch (error) {
    console.error('[api/admin/payments/[id]/events] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
