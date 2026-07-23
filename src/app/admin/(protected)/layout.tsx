import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { canAccessRole, getCurrentUserFromCookies, getDefaultPathForRole } from '@/server/auth/session'

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserFromCookies()

  if (!user) {
    redirect('/admin/login')
  }

  if (!canAccessRole(user, 'ADMIN')) {
    redirect(getDefaultPathForRole(user.role))
  }

  return children
}
