export const PROVIDER_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const

export type ProviderApprovalStatus = (typeof PROVIDER_APPROVAL_STATUSES)[number]
export type ProviderApprovalAction = 'approve' | 'reject' | 'suspend'

type ProviderUserSnapshot = {
  id?: string
  name?: string
  email?: string | null
  phone?: string | null
  status?: string | null
  createdAt?: Date | string
}

export type ProviderOperationalSnapshot = {
  id?: string
  userId?: string
  user?: ProviderUserSnapshot | null
  vehicle?: string
  plate?: string
  city?: string | null
  rating?: number
  completedCount?: number
  isAvailable?: boolean
  isVerified?: boolean
  isDemoProvider?: boolean
  approvalStatus?: string | null
  approvalReviewedAt?: Date | string | null
  approvalReviewedById?: string | null
  approvalReason?: string | null
  documentStatus?: string | null
  vehicleStatus?: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
}

export function isProviderApprovalStatus(value: string | null | undefined): value is ProviderApprovalStatus {
  return PROVIDER_APPROVAL_STATUSES.includes(value as ProviderApprovalStatus)
}

export function normalizeProviderApprovalStatus(provider: ProviderOperationalSnapshot): ProviderApprovalStatus {
  if (isProviderApprovalStatus(provider.approvalStatus)) return provider.approvalStatus
  if (provider.documentStatus === 'REJECTED' || provider.vehicleStatus === 'REJECTED') return 'REJECTED'
  if (
    provider.isVerified === true
    && provider.documentStatus === 'APPROVED'
    && provider.vehicleStatus === 'APPROVED'
  ) {
    return 'APPROVED'
  }
  return 'PENDING'
}

export function getProviderOperationBlockReason(
  provider: ProviderOperationalSnapshot,
  options: { allowDemo?: boolean } = {},
): string | null {
  if (provider.user?.status && provider.user.status !== 'ACTIVE') return 'user_not_active'
  if (provider.isDemoProvider && options.allowDemo) return null

  const approvalStatus = normalizeProviderApprovalStatus(provider)
  if (approvalStatus !== 'APPROVED') return `provider_${approvalStatus.toLowerCase()}`
  if (provider.isVerified !== true) return 'provider_not_verified'
  if (provider.documentStatus !== 'APPROVED') return 'documents_not_approved'
  if (provider.vehicleStatus !== 'APPROVED') return 'vehicle_not_approved'
  return null
}

export function canProviderOperate(
  provider: ProviderOperationalSnapshot,
  options: { allowDemo?: boolean } = {},
): boolean {
  return getProviderOperationBlockReason(provider, options) === null
}

export function requiresProviderApprovalReason(action: ProviderApprovalAction): boolean {
  return action === 'reject' || action === 'suspend'
}

export function normalizeProviderApprovalReason(
  action: ProviderApprovalAction,
  reason: unknown,
): string | null {
  const value = typeof reason === 'string' ? reason.trim() : ''
  if (requiresProviderApprovalReason(action) && !value) {
    throw new Error('Motivo obrigatorio para rejeitar ou suspender prestador')
  }
  if (value.length > 500) throw new Error('Motivo deve ter no maximo 500 caracteres')
  return value || null
}

export function buildProviderApprovalUpdate(
  action: ProviderApprovalAction,
  adminUserId: string,
  reasonInput?: unknown,
) {
  const reason = normalizeProviderApprovalReason(action, reasonInput)
  const reviewed = {
    approvalReviewedAt: new Date(),
    approvalReviewedById: adminUserId,
    approvalReason: reason,
  }

  switch (action) {
    case 'approve':
      return {
        approvalStatus: 'APPROVED' as const,
        isVerified: true,
        isAvailable: false,
        documentStatus: 'APPROVED' as const,
        vehicleStatus: 'APPROVED' as const,
        ...reviewed,
        approvalReason: null,
      }
    case 'reject':
      return {
        approvalStatus: 'REJECTED' as const,
        isVerified: false,
        isAvailable: false,
        documentStatus: 'REJECTED' as const,
        vehicleStatus: 'REJECTED' as const,
        ...reviewed,
      }
    case 'suspend':
      return {
        approvalStatus: 'SUSPENDED' as const,
        isVerified: false,
        isAvailable: false,
        ...reviewed,
      }
  }
}

export function auditEventForProviderApproval(action: ProviderApprovalAction) {
  switch (action) {
    case 'approve':
      return 'provider_approved' as const
    case 'reject':
      return 'provider_rejected' as const
    case 'suspend':
      return 'provider_suspended' as const
  }
}

export function serializeProviderForAdmin(provider: ProviderOperationalSnapshot) {
  const approvalStatus = normalizeProviderApprovalStatus(provider)
  return {
    id: provider.id,
    userId: provider.userId,
    name: provider.user?.name ?? null,
    email: provider.user?.email ?? null,
    phone: provider.user?.phone ?? null,
    vehicle: provider.vehicle,
    plate: provider.plate,
    city: provider.city,
    rating: provider.rating,
    completedCount: provider.completedCount,
    isAvailable: provider.isAvailable,
    isVerified: provider.isVerified,
    isDemoProvider: provider.isDemoProvider,
    approvalStatus,
    approvalReviewedAt: provider.approvalReviewedAt,
    approvalReviewedById: provider.approvalReviewedById,
    approvalReason: provider.approvalReason,
    documentStatus: provider.documentStatus,
    vehicleStatus: provider.vehicleStatus,
    userStatus: provider.user?.status ?? null,
    canOperate: canProviderOperate(provider),
    createdAt: provider.user?.createdAt ?? provider.createdAt,
    updatedAt: provider.updatedAt,
  }
}
