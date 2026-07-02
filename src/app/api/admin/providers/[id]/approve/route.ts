import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'
import { requireRole } from '@/server/auth/session'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // FASE 26: rate limiting
  const rateLimited = applyRateLimit(req, 'admin/approve', RATE_LIMITS.admin)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/approve' })
    return rateLimited
  }

  // FASE 26: admin role protection
  if (process.env.NODE_ENV === 'production') {
    try {
      await requireRole(req, 'ADMIN')
    } catch (e: any) {
      audit('unauthorized_access', { route: 'admin/approve', ip: getClientIp(req), actorRole: 'unknown' })
      return NextResponse.json({ message: e.message }, { status: 401 })
    }
  }
  // dev: no auth check (matches prior NODE_ENV guard behavior); audit logged below on success.

  const { id } = await params
  try {
    const body = await req.json()
    const { documentStatus, vehicleStatus, isVerified } = body
    const data: Record<string, unknown> = {}
    if (documentStatus) data.documentStatus = documentStatus
    if (vehicleStatus) data.vehicleStatus = vehicleStatus
    if (typeof isVerified === 'boolean') data.isVerified = isVerified
    const updated = await db.providerProfile.update({ where: { id }, data, include: { user: true } })
    logger.info('admin', 'provider approval', { providerId: id, documentStatus, vehicleStatus, ip: getClientIp(req) })
    audit('provider_approved', { actor: 'admin', actorRole: 'ADMIN', ip: getClientIp(req), route: 'admin/approve', target: id, metadata: { documentStatus, vehicleStatus } })
    return NextResponse.json({ ok: true, provider: updated })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || 'Approval error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // FASE 26: rate limiting
  const rateLimited = applyRateLimit(req, 'admin/approve', RATE_LIMITS.admin)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/approve' })
    return rateLimited
  }

  // FASE 26: admin role protection
  if (process.env.NODE_ENV === 'production') {
    try {
      await requireRole(req, 'ADMIN')
    } catch (e: any) {
      audit('unauthorized_access', { route: 'admin/approve', ip: getClientIp(req), actorRole: 'unknown' })
      return NextResponse.json({ message: e.message }, { status: 401 })
    }
  }

  const { id } = await params
  const provider = await db.providerProfile.findUnique({ where: { id }, include: { user: true } }).catch(() => null)
  if (!provider) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  return NextResponse.json({ provider })
}
