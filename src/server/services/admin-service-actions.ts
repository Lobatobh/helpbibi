import type { PaymentStatus, Prisma, ServiceStatus } from '@prisma/client'
import { db } from '@/server/db/prisma'
import { audit, type AuditContext, type AuditEvent } from '@/server/audit'
import type { CurrentUser } from '@/server/auth/session'
import { deriveProviderAdminOperationalState } from '@/server/providers/provider-approval'
import { validateTransition } from '@/server/payments/payment-state-machine'
import { ACTIVE_SERVICE_STATUSES, isTerminalServiceStatus } from '@/server/services/service-status'
import { transitionServiceStatus, type LifecycleAudit, type OperationalAuditEvent } from './service-lifecycle'

export type AdminServiceAction = 'cancel' | 'fail' | 'complete'
export type AdminProviderAction = 'force_offline'
export type AdminClientAction = 'suspend'

type AdminActionWarning = {
  code: string
  message: string
  serviceId?: string
  paymentRecordId?: string
}

type QueuedAudit = { event: AuditEvent; context: AuditContext }

export class AdminOperationalActionError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AdminOperationalActionError'
    this.status = status
    this.code = code
  }
}

export function isAdminServiceAction(value: unknown): value is AdminServiceAction {
  return value === 'cancel' || value === 'fail' || value === 'complete'
}

export function validateAdminActionReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : ''
  if (!reason) {
    throw new AdminOperationalActionError(400, 'reason_required', 'Motivo administrativo obrigatorio.')
  }
  if (reason.length < 10) {
    throw new AdminOperationalActionError(400, 'reason_too_short', 'Motivo deve ter pelo menos 10 caracteres.')
  }
  if (reason.length > 500) {
    throw new AdminOperationalActionError(400, 'reason_too_long', 'Motivo deve ter no maximo 500 caracteres.')
  }
  return reason
}

function queueAudit(queue: QueuedAudit[], event: AuditEvent, context: AuditContext) {
  queue.push({ event, context })
}

function flushAudit(queue: QueuedAudit[]) {
  for (const entry of queue) audit(entry.event, entry.context)
}

function adminLifecycleAudit(
  queue: QueuedAudit[],
  extras: Pick<AuditContext, 'ip' | 'route'>,
): LifecycleAudit {
  return (event: OperationalAuditEvent, context) => {
    queueAudit(queue, event as AuditEvent, {
      ...context,
      actor: context.actor,
      actorRole: context.actorRole,
      ip: extras.ip,
      route: extras.route,
      target: context.target,
      severity: context.severity,
      metadata: context.metadata,
    })
  }
}

function actionTargetStatus(action: AdminServiceAction): ServiceStatus {
  switch (action) {
    case 'cancel':
      return 'CANCELED'
    case 'fail':
      return 'FAILED'
    case 'complete':
      return 'COMPLETED'
  }
}

function actionAuditEvent(action: AdminServiceAction): OperationalAuditEvent {
  switch (action) {
    case 'cancel':
      return 'admin_service_cancelled'
    case 'fail':
      return 'admin_service_failed'
    case 'complete':
      return 'admin_service_completed'
  }
}

function actionLabel(action: AdminServiceAction, reason: string) {
  switch (action) {
    case 'cancel':
      return `Atendimento cancelado pelo ADMIN: ${reason}`
    case 'fail':
      return `Atendimento marcado como falho pelo ADMIN: ${reason}`
    case 'complete':
      return `Atendimento concluido manualmente pelo ADMIN: ${reason}`
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function sanitizeService(service: any) {
  return {
    id: service.id,
    status: service.status,
    paymentStatus: service.paymentStatus,
    clientId: service.clientId,
    providerId: service.providerId,
    canceledAt: service.canceledAt,
    canceledByRole: service.canceledByRole,
    canceledByUserId: service.canceledByUserId,
    cancellationReason: service.cancellationReason,
    completedAt: service.completedAt,
    updatedAt: service.updatedAt,
  }
}

async function cancelEligibleSimulatedPayment(
  tx: Prisma.TransactionClient,
  serviceId: string,
  action: AdminServiceAction,
  reason: string,
): Promise<{
  changed: boolean
  status: PaymentStatus | null
  previousStatus: PaymentStatus | null
  paymentRecordId: string | null
  warnings: AdminActionWarning[]
}> {
  const payment = await tx.paymentRecord.findFirst({
    where: { serviceRequestId: serviceId },
    orderBy: { createdAt: 'desc' },
  })

  if (!payment) {
    return { changed: false, status: null, previousStatus: null, paymentRecordId: null, warnings: [] }
  }

  const status = payment.status as PaymentStatus
  if (payment.provider !== 'simulated') {
    return {
      changed: false,
      status,
      previousStatus: status,
      paymentRecordId: payment.id,
      warnings: [{
        code: 'non_simulated_payment_untouched',
        message: 'Pagamento nao simulado nao foi alterado nesta fase.',
        paymentRecordId: payment.id,
      }],
    }
  }

  if (status === 'PAID') {
    return {
      changed: false,
      status,
      previousStatus: status,
      paymentRecordId: payment.id,
      warnings: [{
        code: 'paid_payment_not_refunded',
        message: 'Pagamento PAID foi mantido. Nenhum refund automatico foi executado.',
        paymentRecordId: payment.id,
      }],
    }
  }

  if (status === 'CANCELED') {
    return { changed: false, status, previousStatus: status, paymentRecordId: payment.id, warnings: [] }
  }

  if (status !== 'PENDING' && status !== 'AUTHORIZED') {
    return {
      changed: false,
      status,
      previousStatus: status,
      paymentRecordId: payment.id,
      warnings: [{
        code: 'payment_status_untouched',
        message: `Pagamento em status ${status} nao foi alterado pela acao administrativa.`,
        paymentRecordId: payment.id,
      }],
    }
  }

  const validation = validateTransition(status, 'CANCELED')
  if (!validation.valid) {
    return {
      changed: false,
      status,
      previousStatus: status,
      paymentRecordId: payment.id,
      warnings: [{
        code: 'payment_transition_blocked',
        message: validation.message,
        paymentRecordId: payment.id,
      }],
    }
  }

  await tx.paymentRecord.update({
    where: { id: payment.id },
    data: {
      status: 'CANCELED',
      events: {
        create: {
          eventType: 'CANCELED',
          fromStatus: status,
          toStatus: 'CANCELED',
          message: `Pagamento simulado cancelado por acao ADMIN ${action}.`,
          rawPayload: safeJson({ provider: 'simulated', adminAction: action, serviceRequestId: serviceId, reason }),
        },
      },
    },
  })
  await tx.serviceRequest.update({
    where: { id: serviceId },
    data: { paymentStatus: 'CANCELED' },
  })

  return {
    changed: true,
    status: 'CANCELED',
    previousStatus: status,
    paymentRecordId: payment.id,
    warnings: [],
  }
}

function assertServiceActionAllowed(service: { status: ServiceStatus }, action: AdminServiceAction) {
  const target = actionTargetStatus(action)

  if (service.status === target && isTerminalServiceStatus(service.status)) return

  if (isTerminalServiceStatus(service.status)) {
    throw new AdminOperationalActionError(
      409,
      'service_terminal',
      `Servico em status terminal ${service.status} nao aceita acao ${action}.`,
    )
  }

  if (action === 'complete' && service.status !== 'IN_PROGRESS') {
    throw new AdminOperationalActionError(
      409,
      'service_not_in_progress',
      'Conclusao manual pelo ADMIN so e permitida a partir de IN_PROGRESS.',
    )
  }
}

export async function performAdminServiceAction(params: {
  serviceId: string
  action: unknown
  reason: unknown
  admin: CurrentUser
  ip?: string
}) {
  if (!isAdminServiceAction(params.action)) {
    throw new AdminOperationalActionError(400, 'invalid_action', 'Acao administrativa invalida.')
  }
  const action = params.action
  const reason = validateAdminActionReason(params.reason)
  const targetStatus = actionTargetStatus(action)
  const auditQueue: QueuedAudit[] = []

  const result = await db.$transaction(async (tx) => {
    const service = await tx.serviceRequest.findUnique({ where: { id: params.serviceId } })
    if (!service) {
      throw new AdminOperationalActionError(404, 'service_not_found', 'Servico nao encontrado.')
    }

    assertServiceActionAllowed(service, action)

    if (service.status === targetStatus && isTerminalServiceStatus(service.status)) {
      return {
        ok: true,
        action,
        changed: false,
        service: sanitizeService(service),
        payment: {
          changed: false,
          status: service.paymentStatus,
          previousStatus: service.paymentStatus,
          paymentRecordId: null,
        },
        warnings: [] as AdminActionWarning[],
      }
    }

    const transitioned = await transitionServiceStatus(tx as any, service.id, targetStatus, {
      label: actionLabel(action, reason),
      eventType: actionAuditEvent(action),
      actorRole: 'ADMIN',
      actorUserId: params.admin.id,
      canceledByRole: action === 'cancel' ? 'ADMIN' : undefined,
      canceledByUserId: action === 'cancel' ? params.admin.id : undefined,
      cancellationReason: action === 'cancel' ? reason : undefined,
      metadata: { adminAction: action, reason },
      audit: adminLifecycleAudit(auditQueue, { ip: params.ip, route: 'admin/services/:id/actions' }),
    })

    const payment = action === 'complete'
      ? {
          changed: false,
          status: transitioned.service.paymentStatus,
          previousStatus: transitioned.service.paymentStatus,
          paymentRecordId: null,
          warnings: [] as AdminActionWarning[],
        }
      : await cancelEligibleSimulatedPayment(tx, service.id, action, reason)

    const updated = await tx.serviceRequest.findUnique({ where: { id: service.id } })
    return {
      ok: true,
      action,
      changed: transitioned.changed,
      service: sanitizeService(updated || transitioned.service),
      payment: {
        changed: payment.changed,
        status: payment.status,
        previousStatus: payment.previousStatus,
        paymentRecordId: payment.paymentRecordId,
      },
      warnings: payment.warnings,
    }
  })

  flushAudit(auditQueue)
  return result
}

export async function forceProviderOffline(params: {
  providerId: string
  admin: CurrentUser
  ip?: string
}) {
  const auditQueue: QueuedAudit[] = []
  const result = await db.$transaction(async (tx) => {
    const provider = await tx.providerProfile.findUnique({
      where: { id: params.providerId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } },
        services: {
          where: { status: { in: ACTIVE_SERVICE_STATUSES } },
          select: { id: true, status: true, type: true, client: { select: { id: true, name: true, email: true } }, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!provider) {
      throw new AdminOperationalActionError(404, 'provider_not_found', 'Prestador nao encontrado.')
    }

    const active = provider.services[0] || null
    const changed = provider.isAvailable === true
    const updated = changed
      ? await tx.providerProfile.update({
          where: { id: provider.id },
          data: { isAvailable: false },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } },
            services: {
              where: { status: { in: ACTIVE_SERVICE_STATUSES } },
              select: { id: true, status: true, type: true, client: { select: { id: true, name: true, email: true } }, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        })
      : provider

    if (changed) {
      queueAudit(auditQueue, 'provider_forced_offline', {
        actor: params.admin.id,
        actorRole: params.admin.role,
        ip: params.ip,
        route: 'admin/providers/:id/actions',
        target: provider.id,
        metadata: { action: 'force_offline', activeServiceId: active?.id || null },
      })
    }

    const activeService = updated.services[0]
      ? {
          id: updated.services[0].id,
          status: updated.services[0].status,
          type: updated.services[0].type,
          clientId: updated.services[0].client?.id || null,
          clientName: updated.services[0].client?.name || null,
          clientEmail: updated.services[0].client?.email || null,
          createdAt: updated.services[0].createdAt,
        }
      : null

    return {
      ok: true,
      action: 'force_offline' as const,
      changed,
      provider: {
        id: updated.id,
        userId: updated.userId,
        name: updated.user?.name ?? null,
        email: updated.user?.email ?? null,
        phone: updated.user?.phone ?? null,
        vehicle: updated.vehicle,
        plate: updated.plate,
        isAvailable: updated.isAvailable,
        isVerified: updated.isVerified,
        approvalStatus: updated.approvalStatus,
        userStatus: updated.user?.status ?? null,
        activeService,
        operationalState: deriveProviderAdminOperationalState({
          id: updated.id,
          userId: updated.userId,
          isAvailable: updated.isAvailable,
          isVerified: updated.isVerified,
          approvalStatus: updated.approvalStatus,
          documentStatus: updated.documentStatus,
          vehicleStatus: updated.vehicleStatus,
          userStatus: updated.user?.status ?? null,
          user: updated.user,
        }, activeService),
      },
      warnings: activeService
        ? [{
            code: 'active_service_not_cancelled',
            message: 'Prestador possui servico ativo. Nenhum atendimento foi cancelado automaticamente.',
            serviceId: activeService.id,
          }]
        : [],
    }
  })

  flushAudit(auditQueue)
  return result
}

export async function suspendClient(params: {
  clientId: string
  admin: CurrentUser
  ip?: string
}) {
  const reason = 'Suspensao administrativa de cliente'
  const auditQueue: QueuedAudit[] = []
  const result = await db.$transaction(async (tx) => {
    const client = await tx.user.findUnique({
      where: { id: params.clientId },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        servicesRequested: {
          where: { status: { in: ACTIVE_SERVICE_STATUSES } },
          select: { id: true, status: true, type: true, providerId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!client || client.role !== 'CLIENT') {
      throw new AdminOperationalActionError(404, 'client_not_found', 'Cliente nao encontrado.')
    }

    const activeService = client.servicesRequested[0] || null
    const changed = client.status !== 'SUSPENDED'
    const updated = changed
      ? await tx.user.update({
          where: { id: client.id },
          data: { status: 'SUSPENDED' },
          select: { id: true, name: true, role: true, status: true },
        })
      : { id: client.id, name: client.name, role: client.role, status: client.status }

    if (changed) {
      queueAudit(auditQueue, 'client_suspended', {
        actor: params.admin.id,
        actorRole: params.admin.role,
        ip: params.ip,
        route: 'admin/clients/:id/actions',
        target: client.id,
        metadata: { action: 'suspend', reason, activeServiceId: activeService?.id || null },
      })
    }

    return {
      ok: true,
      action: 'suspend' as const,
      changed,
      client: updated,
      warnings: activeService
        ? [{
            code: 'active_service_not_cancelled',
            message: 'Cliente possui servico ativo. Nenhum atendimento foi cancelado automaticamente.',
            serviceId: activeService.id,
          }]
        : [],
    }
  })

  flushAudit(auditQueue)
  return result
}
