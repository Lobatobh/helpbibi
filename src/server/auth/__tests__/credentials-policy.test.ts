import { afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { POST as login } from '@/app/api/auth/login/route'
import { hashPassword, verifyPassword } from '@/server/auth'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  validateNewPassword,
} from '@/server/auth/credentials'
import { db } from '@/server/db/prisma'

const TEST_MARKER = 'f36-credentials-policy'

afterEach(async () => {
  await db.user.deleteMany({ where: { email: { contains: TEST_MARKER } } }).catch(() => {})
})

describe('central credential policy', () => {
  test('normalizes email with trim and lowercase', () => {
    expect(normalizeEmail('  Person.Name@Example.Invalid  ')).toBe('person.name@example.invalid')
    expect(normalizeEmail(null)).toBe('')
  })

  test('enforces password bounds and rejects blank values without echoing input', () => {
    const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    const validPassword = 'a'.repeat(PASSWORD_MIN_LENGTH)
    const longPassword = 'a'.repeat(PASSWORD_MAX_LENGTH + 1)

    expect(validateNewPassword('   ')).toMatchObject({ ok: false, code: 'PASSWORD_REQUIRED' })
    expect(validateNewPassword(shortPassword)).toMatchObject({ ok: false, code: 'PASSWORD_TOO_SHORT' })
    expect(validateNewPassword(validPassword)).toEqual({ ok: true })
    expect(validateNewPassword(longPassword)).toMatchObject({ ok: false, code: 'PASSWORD_TOO_LONG' })
    expect(JSON.stringify(validateNewPassword(shortPassword))).not.toContain(shortPassword)
    expect(JSON.stringify(validateNewPassword(longPassword))).not.toContain(longPassword)
  })

  test('existing shorter password hashes remain authenticatable', () => {
    const legacyPassword = 'OldPass1!'
    const hash = hashPassword(legacyPassword)

    expect(verifyPassword(legacyPassword, hash)).toBe(true)
  })

  test('login accepts email case differences and surrounding whitespace', async () => {
    const email = `${TEST_MARKER}-${crypto.randomUUID()}@example.invalid`
    const password = 'ExistingPass1!'
    await db.user.create({
      data: {
        email,
        name: 'Credential Policy User',
        role: 'CLIENT',
        status: 'ACTIVE',
        passwordHash: hashPassword(password),
      },
    })

    const response = await login(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `  ${email.toUpperCase()}  `, password }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.user.email).toBe(email)
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(JSON.stringify(payload)).not.toContain(password)
  })

  test('all account entry points use the central normalization and password policy', async () => {
    const sources = await Promise.all([
      'src/app/api/auth/register-client/route.ts',
      'src/app/api/auth/register-provider/route.ts',
      'src/app/api/auth/login/route.ts',
      'src/app/api/admin/login/route.ts',
      'scripts/bootstrap-admin.ts',
    ].map((path) => Bun.file(path).text()))

    for (const source of sources) expect(source).toContain('normalizeEmail')
    for (const source of sources.slice(0, 2)) expect(source).toContain('validateNewPassword')
    expect(sources[4]).toContain('validateNewPassword')
  })
})
