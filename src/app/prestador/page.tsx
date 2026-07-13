import { redirect } from 'next/navigation'
import { AuthenticatedProviderPanel } from '@/components/rescue/authenticated-provider-panel'
import { canAccessRole, getCurrentUserFromCookies, getDefaultPathForRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { canProviderOperate, normalizeProviderApprovalStatus } from '@/server/providers/provider-approval'
import { findActiveServiceForProvider } from '@/server/repositories/service-requests.repository'
import { getConsentStatus } from '@/server/consents/consent-service'

export default async function PrestadorPage() {
  const user = await getCurrentUserFromCookies()

  if (!user) {
    redirect('/login?next=/prestador')
  }

  if (!canAccessRole(user, 'PROVIDER')) {
    redirect(getDefaultPathForRole(user.role))
  }

  const provider = await db.providerProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { status: true } } },
  })
  const [activeService, consentStatus] = await Promise.all([
    provider ? findActiveServiceForProvider(provider.id) : null,
    getConsentStatus(user.id, user.role),
  ])

  return (
    <AuthenticatedProviderPanel
      userName={user.name}
      provider={provider ? {
        vehicle: provider.vehicle,
        plate: provider.plate,
        city: provider.city,
        approvalStatus: normalizeProviderApprovalStatus(provider),
        approvalReason: provider.approvalReason,
        canOperate: canProviderOperate(provider),
        isAvailable: provider.isAvailable,
      } : null}
      initialService={activeService as any}
      initialConsents={consentStatus}
    />
  )
}
