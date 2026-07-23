import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'

const read = (path: string) => readFileSync(path, 'utf8')
type AuthRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

describe('F35-01 auth foundation static contract', () => {
  test('schemas define auth fields and user roles needed by the real login flow', () => {
    for (const schemaPath of ['prisma/schema.prisma', 'prisma/schema.postgres.prisma']) {
      const schema = read(schemaPath)
      expect(schema).toContain('enum UserRole')
      expect(schema).toContain('CLIENT')
      expect(schema).toContain('PROVIDER')
      expect(schema).toContain('ADMIN')
      expect(schema).toContain('passwordHash')
      expect(schema).toContain('enum UserStatus')
      expect(schema).toMatch(/status\s+UserStatus/)
      expect(schema).toContain('city')
      expect(schema).toContain('isDemoProvider')
    }
  })

  test('auth.ts is a compatibility wrapper and does not use a second db session system', () => {
    const source = read('src/server/auth.ts')
    expect(source).not.toContain('db.session')
    expect(source).not.toContain('helpbibi_session')
    expect(source).toContain("from './auth/session'")
  })

  test('base pages for login and role dashboards exist', () => {
    expect(existsSync('src/app/login/page.tsx')).toBe(true)
    expect(existsSync('src/app/cliente/page.tsx')).toBe(true)
    expect(existsSync('src/app/prestador/page.tsx')).toBe(true)
    expect(existsSync('src/app/admin/login/page.tsx')).toBe(true)
    expect(existsSync('src/app/admin/(protected)/page.tsx')).toBe(true)
    expect(existsSync('src/app/admin/layout.tsx')).toBe(true)
    expect(existsSync('src/app/admin/(protected)/layout.tsx')).toBe(true)
  })

  test('public demo page remains public and imports the homologated demo panels', () => {
    const home = read('src/app/page.tsx')
    expect(home).toContain("from '@/components/rescue/client-panel'")
    expect(home).toContain("from '@/components/rescue/provider-panel'")
    expect(home).not.toContain("redirect('/login")
    expect(home).not.toContain('requireRole')
  })

  test('protected role pages redirect unauthenticated users instead of rendering private content', () => {
    for (const pagePath of ['src/app/cliente/page.tsx', 'src/app/prestador/page.tsx', 'src/app/admin/(protected)/layout.tsx']) {
      const page = read(pagePath)
      expect(page).toContain("from 'next/navigation'")
      expect(page).toContain('redirect(')
      expect(page).toContain('getCurrentUserFromCookies')
    }
  })

  test('admin login stays public while the admin route group remains protected by ADMIN role', () => {
    const publicAdminLayout = read('src/app/admin/layout.tsx')
    const protectedAdminLayout = read('src/app/admin/(protected)/layout.tsx')
    const adminLogin = read('src/app/admin/login/page.tsx')

    expect(publicAdminLayout).not.toContain('redirect(')
    expect(adminLogin).not.toContain("redirect('/admin/login')")
    expect(protectedAdminLayout).toContain("redirect('/admin/login')")
    expect(protectedAdminLayout).toContain("canAccessRole(user, 'ADMIN')")
    expect(protectedAdminLayout).toContain('getDefaultPathForRole(user.role)')
  })

  test('auth API routes use email/password login, logout cookie clearing, and me session lookup', () => {
    const login = read('src/app/api/auth/login/route.ts')
    expect(login).toContain('verifyPassword')
    expect(login).toContain('passwordHash')
    expect(login).toContain('setSessionCookie')
    expect(login).not.toContain('userId and role required')

    const logout = read('src/app/api/auth/logout/route.ts')
    expect(logout).toContain('clearSessionCookie')

    const me = read('src/app/api/auth/me/route.ts')
    expect(me).toContain('getCurrentUserFromRequest')
    expect(me).not.toContain('passwordHash')
  })

  test('admin login uses password verification and does not expose public admin registration', () => {
    const adminLogin = read('src/app/api/admin/login/route.ts')
    expect(adminLogin).toContain('verifyPassword')
    expect(adminLogin).toContain("role: 'ADMIN'")
    expect(adminLogin).toContain('setSessionCookie')
    expect(adminLogin).toContain('normalizeEmail')
    expect(adminLogin).not.toContain('NODE_ENV')
    expect(adminLogin).not.toMatch(/user\.(create|update|upsert)/)
    expect(adminLogin).not.toContain('Public admin registration')
  })
})

describe('F35-01 RBAC helpers', () => {
  test('ADMIN can access admin, CLIENT cannot, and PROVIDER cannot', async () => {
    const { canAccessRole } = await import('@/server/auth/session') as {
      canAccessRole?: (user: { id: string; role: string; name: string }, role: AuthRole) => boolean
    }
    expect(typeof canAccessRole).toBe('function')

    expect(canAccessRole({ id: 'admin_1', role: 'ADMIN', name: 'Admin' }, 'ADMIN')).toBe(true)
    expect(canAccessRole({ id: 'client_1', role: 'CLIENT', name: 'Cliente' }, 'ADMIN')).toBe(false)
    expect(canAccessRole({ id: 'provider_1', role: 'PROVIDER', name: 'Prestador' }, 'ADMIN')).toBe(false)
  })

  test('role default paths are explicit for CLIENT, PROVIDER and ADMIN', async () => {
    const { getDefaultPathForRole } = await import('@/server/auth/session') as {
      getDefaultPathForRole?: (role: AuthRole) => string
    }
    expect(typeof getDefaultPathForRole).toBe('function')

    const expected: Record<AuthRole, string> = {
      CLIENT: '/cliente',
      PROVIDER: '/prestador',
      ADMIN: '/admin',
    }
    expect(getDefaultPathForRole('CLIENT')).toBe(expected.CLIENT)
    expect(getDefaultPathForRole('PROVIDER')).toBe(expected.PROVIDER)
    expect(getDefaultPathForRole('ADMIN')).toBe(expected.ADMIN)
  })
})
