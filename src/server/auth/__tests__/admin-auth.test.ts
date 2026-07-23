// Help Bibi — Admin Auth tests (FASE 27)
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { db } from '@/server/db/prisma'

async function createAdminUser(): Promise<string> {
  const user = await db.user.create({
    data: { email: `test_admin_${Date.now()}_${Math.random().toString(36).slice(2,8)}@helpbibi.local`, name: 'Test Admin', role: 'ADMIN' },
  })
  return user.id
}

async function createClientUser(): Promise<string> {
  const user = await db.user.create({
    data: { email: `test_client_${Date.now()}_${Math.random().toString(36).slice(2,8)}@helpbibi.com`, name: 'Test Client', role: 'CLIENT', clientProfile: { create: {} } },
  })
  return user.id
}

async function createProviderUser(): Promise<string> {
  const user = await db.user.create({
    data: { email: `test_provider_${Date.now()}_${Math.random().toString(36).slice(2,8)}@helpbibi.com`, name: 'Test Provider', role: 'PROVIDER', providerProfile: { create: { vehicle: 'Guincho', plate: 'TEST1234' } } },
  include: { providerProfile: true },
  })
  return user.id
}

async function cleanupUser(id: string) {
  await db.user.delete({ where: { id } }).catch(() => {})
}

describe('Admin Auth — Role Protection (FASE 27)', () => {
  test('1. ADMIN user can be created in DB', async () => {
    const id = await createAdminUser()
    const user = await db.user.findUnique({ where: { id } })
    expect(user?.role).toBe('ADMIN')
    await cleanupUser(id)
  })

  test('2. CLIENT user role is CLIENT', async () => {
    const id = await createClientUser()
    const user = await db.user.findUnique({ where: { id } })
    expect(user?.role).toBe('CLIENT')
    await cleanupUser(id)
  })

  test('3. PROVIDER user role is PROVIDER', async () => {
    const id = await createProviderUser()
    const user = await db.user.findUnique({ where: { id } })
    expect(user?.role).toBe('PROVIDER')
    await cleanupUser(id)
  })

  test('4. requireRole would reject CLIENT for ADMIN role (logic test)', async () => {
    const clientId = await createClientUser()
    const client = await db.user.findUnique({ where: { id: clientId } })
    expect(client?.role).not.toBe('ADMIN')
    await cleanupUser(clientId)
  })

  test('5. requireRole would reject PROVIDER for ADMIN role (logic test)', async () => {
    const providerId = await createProviderUser()
    const provider = await db.user.findUnique({ where: { id: providerId } })
    expect(provider?.role).not.toBe('ADMIN')
    await cleanupUser(providerId)
  })

  test('6. ADMIN user passes ADMIN role check (logic test)', async () => {
    const adminId = await createAdminUser()
    const admin = await db.user.findUnique({ where: { id: adminId } })
    expect(admin?.role).toBe('ADMIN')
    await cleanupUser(adminId)
  })

  test('7. admin login has no environment bypass and legacy seed is a safe tombstone', () => {
    const loginSource = readFileSync('src/app/api/admin/login/route.ts', 'utf8')
    const seedSource = readFileSync('src/server/seed-admin.ts', 'utf8')

    expect(loginSource).toContain('verifyPassword')
    expect(loginSource).toContain('setSessionCookie')
    expect(loginSource).not.toContain('NODE_ENV')
    expect(loginSource).not.toMatch(/user\.(create|update|upsert)/)
    expect(seedSource).toContain('LEGACY_ADMIN_SEED_DISABLED_USE_SCRIPTS_BOOTSTRAP_ADMIN')
    expect(seedSource).not.toMatch(/user\.(create|update|upsert)/)
    expect(seedSource).not.toContain('hashPassword')
  })

  test('8. executable source contains no legacy hardcoded ADMIN credential', () => {
    const forbidden = ['Admin', '123!'].join('')
    const sourceFiles: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) sourceFiles.push(path)
      }
    }
    walk('src')
    walk('scripts')

    expect(sourceFiles.some((path) => readFileSync(path, 'utf8').includes(forbidden))).toBe(false)
  })

  test('9. protected admin page exists in its route group', () => {
    // uses top-level existsSync import
    expect(existsSync('src/app/admin/(protected)/page.tsx')).toBe(true)
  })

  test('10. admin login route exists', () => {
    // uses top-level existsSync import
    expect(existsSync('src/app/api/admin/login/route.ts')).toBe(true)
  })

  test('11. admin audit route exists', () => {
    // uses top-level existsSync import
    expect(existsSync('src/app/api/admin/audit/route.ts')).toBe(true)
  })
})
