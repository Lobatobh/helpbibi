import { redirect } from 'next/navigation'
import { AuthenticatedClientPanel } from '@/components/rescue/authenticated-client-panel'
import { canAccessRole, getCurrentUserFromCookies, getDefaultPathForRole } from '@/server/auth/session'
import { findActiveServiceForClient } from '@/server/repositories/service-requests.repository'

export default async function ClientePage() {
  const user = await getCurrentUserFromCookies()

  if (!user) {
    redirect('/login?next=/cliente')
  }

  if (!canAccessRole(user, 'CLIENT')) {
    redirect(getDefaultPathForRole(user.role))
  }

  const activeService = await findActiveServiceForClient(user.id)

  return (
    <AuthenticatedClientPanel
      userName={user.name}
      initialService={activeService as any}
    />
  )
}
