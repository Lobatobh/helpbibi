import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { getClientIp } from '@/server/rate-limit'
import {
  changeProviderApprovalStatus,
  findProviderForAdmin,
} from '@/server/repositories/providers.repository'
import {
  auditEventForProviderApproval,
  type ProviderApprovalAction,
} from '@/server/providers/provider-approval'

const ACTIONS = new Set<ProviderApprovalAction>(['approve', 'reject', 'suspend'])

async function requireAdmin(req: NextRequest) {
  try {
    return await requireRole(req, 'ADMIN')
  } catch {
    audit('unauthorized_access', {
      actor: 'anonymous',
      actorRole: 'unknown',
      ip: getClientIp(req),
      route: 'admin/providers/:id',
      severity: 'warning',
    })
    return null
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const provider = await findProviderForAdmin(id)
  if (!provider) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  return NextResponse.json({ provider })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action as ProviderApprovalAction
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Invalid provider action' }, { status: 400 })
  }

  const before = await findProviderForAdmin(id)
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  try {
    const provider = await changeProviderApprovalStatus(id, action, admin.id, body?.reason)
    const warnings = action === 'suspend' && (provider as any).activeService
      ? [{
          code: 'active_service_not_cancelled',
          message: 'Prestador possui servico ativo. Nenhum atendimento foi cancelado automaticamente.',
          serviceId: (provider as any).activeService.id,
        }]
      : []
    audit(auditEventForProviderApproval(action), {
      actor: admin.id,
      actorRole: admin.role,
      ip: getClientIp(req),
      route: 'admin/providers/:id',
      target: id,
      metadata: {
        action,
        previousStatus: before.approvalStatus,
        nextStatus: provider.approvalStatus,
        reason: provider.approvalReason,
        activeServiceId: (provider as any).activeService?.id || null,
      },
    })
    return NextResponse.json({ ok: true, provider, warnings })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Provider update failed' },
      { status: 400 },
    )
  }
}
