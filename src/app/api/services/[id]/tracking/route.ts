import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/server/auth/session'
import { createTrackingShare, revokePublicTrackingShare } from '@/server/repositories/tracking.repository'

function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('Unauthorized')) return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.includes('not found')) return 404
  return 400
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser(req)
    const { id } = await params
    const share = await createTrackingShare(id, { id: user.id, role: user.role })
    return NextResponse.json({
      trackingPath: `/tracking/${share.token}`,
      expiresAt: share.expiresAt?.toISOString() || null,
    })
  } catch (error) {
    return NextResponse.json(
      { message: 'Nao foi possivel disponibilizar o rastreamento.' },
      { status: statusForError(error) },
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser(req)
    const { id } = await params
    const result = await revokePublicTrackingShare(id, { id: user.id, role: user.role })
    return NextResponse.json({ ok: true, changed: result.changed })
  } catch (error) {
    return NextResponse.json(
      { message: 'Nao foi possivel revogar o rastreamento.' },
      { status: statusForError(error) },
    )
  }
}
