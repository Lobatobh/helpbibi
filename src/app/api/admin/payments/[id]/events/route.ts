import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { db } from '@/server/db/prisma'

/**
 * GET /api/admin/payments/[id]/events
 * Returns the PaymentEvent audit trail for a specific PaymentRecord.
 * Admin-only — used in the financial detail view.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

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
      rawPayload: e.rawPayload,
      createdAt: e.createdAt.getTime(),
    })))
  } catch (error) {
    console.error('[api/admin/payments/[id]/events] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
