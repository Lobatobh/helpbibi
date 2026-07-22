import { readFileSync } from 'fs'
import { NextRequest } from 'next/server'
import { POST as registerClient } from '@/app/api/auth/register-client/route'
import { POST as registerProvider } from '@/app/api/auth/register-provider/route'
import { POST as login } from '@/app/api/auth/login/route'
import { GET as getConsents } from '@/app/api/consents/route'
import { POST as acceptConsents } from '@/app/api/consents/accept/route'
import { POST as createClientService } from '@/app/api/client/services/route'
import { PATCH as updateAvailability } from '@/app/api/provider/availability/route'
import { setSessionCookie } from '@/server/auth/session'
import { hashPassword } from '@/server/auth'
import { clearRateLimits } from '@/server/rate-limit'
import { db } from '@/server/db/prisma'
import {
  createUserWithCurrentConsents,
} from '@/server/consents/consent-registration'
import {
  CURRENT_CONSENT_VERSIONS,
  allowedConsentTypesForRole,
  PRIVACY_NOTICE_VERSION,
  PROVIDER_OPERATIONAL_VERSION,
  TERMS_VERSION,
} from '@/server/consents/consent-versions'
import { getConsentStatus } from '@/server/consents/consent-service'

const MARKER = 'f35-09a'
const createdUserIds: string[] = []

function email(kind: string) {
  return `${MARKER}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
}

function request(url: string, body?: unknown, cookie?: string, ip = `127.35.9.${Math.floor(Math.random() * 200) + 1}`) {
  return new NextRequest(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'x-forwarded-for': ip,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function patchRequest(url: string, body: unknown, cookie: string) {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie, 'x-forwarded-for': '127.35.9.240' },
    body: JSON.stringify(body),
  })
}

function cookie(userId: string, role: 'CLIENT' | 'PROVIDER') {
  return setSessionCookie(userId, role).split(';')[0]
}

async function cleanup() {
  const users = await db.user.findMany({
    where: { OR: [{ id: { in: createdUserIds } }, { email: { contains: MARKER } }] },
    select: { id: true },
  }).catch(() => [])
  const ids = Array.from(new Set([...createdUserIds, ...users.map((user) => user.id)]))
  if (ids.length) {
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } }).catch(() => {})
    await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
  }
  createdUserIds.length = 0
  await clearRateLimits()
}

beforeEach(cleanup)
afterEach(cleanup)

async function createLegacyUser(role: 'CLIENT' | 'PROVIDER') {
  const user = await db.user.create({
    data: {
      email: email(`legacy-${role.toLowerCase()}`),
      name: `Legacy ${role}`,
      passwordHash: hashPassword('Senha123!'),
      role,
      status: 'ACTIVE',
      ...(role === 'CLIENT' ? { clientProfile: { create: {} } } : {
        providerProfile: {
          create: {
            vehicle: 'Guincho',
            plate: `C${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
            isAvailable: false,
            isVerified: true,
            approvalStatus: 'APPROVED',
            documentStatus: 'APPROVED',
            vehicleStatus: 'APPROVED',
          },
        },
      }),
    },
    include: { providerProfile: true },
  })
  createdUserIds.push(user.id)
  return user
}

describe('F35-09A versioned registration consent', () => {
  test('client requires terms and privacy', async () => {
    const base = { name: 'Cliente', email: email('missing'), password: 'Senha123!' }
    const missingTerms = await registerClient(request('http://localhost/api/auth/register-client', { ...base, acceptPrivacy: true }))
    const missingPrivacy = await registerClient(request('http://localhost/api/auth/register-client', { ...base, acceptTerms: true }))
    expect(missingTerms.status).toBe(422)
    expect(missingPrivacy.status).toBe(422)
  })

  test('client registration is atomic, normalizes email and persists only server versions', async () => {
    const rawEmail = `  ${email('client').toUpperCase()}  `
    const response = await registerClient(request('http://localhost/api/auth/register-client', {
      name: 'Cliente Consentido',
      email: rawEmail,
      password: 'Senha123!',
      acceptTerms: true,
      acceptPrivacy: true,
      consentVersion: 'attacker-version',
      acceptedAt: '1999-01-01T00:00:00.000Z',
      role: 'ADMIN',
    }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(JSON.stringify(payload)).not.toContain('passwordHash')

    const user = await db.user.findUniqueOrThrow({
      where: { email: rawEmail.trim().toLowerCase() },
      include: { consentRecords: true },
    })
    createdUserIds.push(user.id)
    expect(user.role).toBe('CLIENT')
    expect(user.consentRecords).toHaveLength(2)
    expect(user.consentRecords.map((item) => [item.type, item.version]).sort()).toEqual([
      ['PRIVACY_NOTICE', PRIVACY_NOTICE_VERSION],
      ['TERMS', TERMS_VERSION],
    ])
    expect(user.consentRecords.some((item) => item.type === 'LOCATION')).toBe(false)

    const mixedCaseLogin = await login(request('http://localhost/api/auth/login', {
      email: rawEmail.toLowerCase(),
      password: 'Senha123!',
    }))
    expect(mixedCaseLogin.status).toBe(200)
  })

  test('consent write failure rolls back the user', async () => {
    const rollbackEmail = email('rollback')
    await expect(createUserWithCurrentConsents({
      email: rollbackEmail,
      name: 'Rollback',
      passwordHash: hashPassword('Senha123!'),
      role: 'CLIENT',
      clientProfile: { create: {} },
    }, ['TERMS', 'TERMS'])).rejects.toBeTruthy()
    expect(await db.user.findUnique({ where: { email: rollbackEmail } })).toBeNull()
  })

  test('provider requires operational terms and starts PENDING with three current consents', async () => {
    const providerEmail = email('provider')
    const base = {
      name: 'Prestador', email: providerEmail, password: 'Senha123!', vehicle: 'Guincho', plate: 'F3509A',
      acceptTerms: true, acceptPrivacy: true,
    }
    const missing = await registerProvider(request('http://localhost/api/auth/register-provider', base))
    expect(missing.status).toBe(422)

    const response = await registerProvider(request('http://localhost/api/auth/register-provider', {
      ...base,
      acceptProviderOperational: true,
      consentVersion: 'spoofed',
      approvalStatus: 'APPROVED',
    }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.providerProfile.approvalStatus).toBe('PENDING')
    expect(JSON.stringify(payload)).not.toContain('passwordHash')

    const user = await db.user.findUniqueOrThrow({ where: { email: providerEmail }, include: { consentRecords: true } })
    createdUserIds.push(user.id)
    expect(user.consentRecords.map((item) => [item.type, item.version]).sort()).toEqual([
      ['PRIVACY_NOTICE', PRIVACY_NOTICE_VERSION],
      ['PROVIDER_OPERATIONAL', PROVIDER_OPERATIONAL_VERSION],
      ['TERMS', TERMS_VERSION],
    ])
    expect(user.consentRecords.some((item) => item.type === 'LOCATION')).toBe(false)
  })

  test('case-insensitive duplicate registration is rejected', async () => {
    const normalized = email('duplicate')
    const first = await registerClient(request('http://localhost/api/auth/register-client', {
      name: 'Primeiro', email: normalized, password: 'Senha123!', acceptTerms: true, acceptPrivacy: true,
    }))
    expect(first.status).toBe(200)
    const user = await db.user.findUniqueOrThrow({ where: { email: normalized } })
    createdUserIds.push(user.id)

    const duplicate = await registerClient(request('http://localhost/api/auth/register-client', {
      name: 'Segundo', email: normalized.toUpperCase(), password: 'Senha123!', acceptTerms: true, acceptPrivacy: true,
    }))
    expect(duplicate.status).toBe(409)
  })
})

describe('F35-09A reconsent and operational guards', () => {
  test('revoked current record is pending and repeated acceptance does not duplicate', async () => {
    const client = await createLegacyUser('CLIENT')
    const session = cookie(client.id, 'CLIENT')

    const first = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['TERMS', 'PRIVACY_NOTICE'],
      version: 'frontend-version',
    }, session))
    expect(first.status).toBe(400)

    const accepted = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['TERMS', 'PRIVACY_NOTICE'],
    }, session))
    const repeated = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['TERMS', 'PRIVACY_NOTICE'],
    }, session))
    expect(accepted.status).toBe(200)
    expect(repeated.status).toBe(200)
    expect(await db.consentRecord.count({ where: { userId: client.id } })).toBe(2)

    await db.consentRecord.update({
      where: { userId_type_version: { userId: client.id, type: 'TERMS', version: TERMS_VERSION } },
      data: { revokedAt: new Date() },
    })
    const status = await getConsentStatus(client.id, 'CLIENT')
    expect(status.find((item) => item.type === 'TERMS')?.accepted).toBe(false)

    const locationAttempt = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['LOCATION'],
    }, session))
    expect(locationAttempt.status).toBe(200)
    const locationRepeated = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['LOCATION'],
    }, session))
    expect(locationRepeated.status).toBe(200)
    expect(await db.consentRecord.count({ where: { userId: client.id } })).toBe(3)
  })

  test('legacy user can login and inspect consent status but cannot operate before accepting', async () => {
    const client = await createLegacyUser('CLIENT')
    const clientCookie = cookie(client.id, 'CLIENT')
    const loginResponse = await login(request('http://localhost/api/auth/login', {
      email: client.email,
      password: 'Senha123!',
    }))
    const consentResponse = await getConsents(request('http://localhost/api/consents', undefined, clientCookie))
    const serviceResponse = await createClientService(request('http://localhost/api/client/services', {
      type: 'reboque',
      pickup: { lat: -23.55, lng: -46.63 },
      pickupLabel: 'Origem piloto',
      destination: null,
      destinationLabel: 'Destino piloto',
      paymentMethod: 'pix',
    }, clientCookie))

    expect(loginResponse.status).toBe(200)
    expect(consentResponse.status).toBe(200)
    expect(serviceResponse.status).toBe(428)

    const accepted = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['TERMS', 'PRIVACY_NOTICE'],
    }, clientCookie))
    expect(accepted.status).toBe(200)
    const stillBlocked = await createClientService(request('http://localhost/api/client/services', {
      type: 'reboque',
      pickup: { lat: -23.55, lng: -46.63 },
      pickupLabel: 'Origem piloto',
      destination: null,
      destinationLabel: 'Destino piloto',
      paymentMethod: 'pix',
    }, clientCookie))
    expect(stillBlocked.status).toBe(428)
    expect(await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['LOCATION'],
    }, clientCookie))).toHaveProperty('status', 200)
    const allowed = await createClientService(request('http://localhost/api/client/services', {
      type: 'reboque',
      pickup: { lat: -23.55, lng: -46.63 },
      pickupLabel: 'Origem piloto',
      destination: null,
      destinationLabel: 'Destino piloto',
      paymentMethod: 'pix',
    }, clientCookie))
    expect(allowed.status).toBe(200)
  })

  test('legacy provider cannot become available until accepting all current documents', async () => {
    const provider = await createLegacyUser('PROVIDER')
    const providerCookie = cookie(provider.id, 'PROVIDER')
    const blocked = await updateAvailability(patchRequest('http://localhost/api/provider/availability', { online: true }, providerCookie))
    expect(blocked.status).toBe(428)

    const accepted = await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['TERMS', 'PRIVACY_NOTICE', 'PROVIDER_OPERATIONAL'],
    }, providerCookie))
    expect(accepted.status).toBe(200)
    const locationBlocked = await updateAvailability(patchRequest('http://localhost/api/provider/availability', { online: true }, providerCookie))
    expect(locationBlocked.status).toBe(428)
    expect(await acceptConsents(request('http://localhost/api/consents/accept', {
      types: ['LOCATION'],
    }, providerCookie))).toHaveProperty('status', 200)
    const allowed = await updateAvailability(patchRequest('http://localhost/api/provider/availability', { online: true }, providerCookie))
    expect(allowed.status).toBe(200)
  })

  test('registration routes are rate limited by the existing backend', async () => {
    const ip = '127.35.9.250'
    for (let index = 0; index < 10; index += 1) {
      const response = await registerClient(request('http://localhost/api/auth/register-client', {}, undefined, ip))
      expect(response.status).not.toBe(429)
    }
    const blocked = await registerClient(request('http://localhost/api/auth/register-client', {}, undefined, ip))
    expect(blocked.status).toBe(429)

    const providerIp = '127.35.9.251'
    for (let index = 0; index < 10; index += 1) {
      const response = await registerProvider(request('http://localhost/api/auth/register-provider', {}, undefined, providerIp))
      expect(response.status).not.toBe(429)
    }
    const providerBlocked = await registerProvider(request('http://localhost/api/auth/register-provider', {}, undefined, providerIp))
    expect(providerBlocked.status).toBe(429)
  })
})

describe('F35-09A public legal and static security contract', () => {
  test('legal pages exist, links are functional and registration checkboxes are opt-in', () => {
    const terms = readFileSync('src/app/termos/page.tsx', 'utf8')
    const privacy = readFileSync('src/app/privacidade/page.tsx', 'utf8')
    const loginPage = readFileSync('src/app/login/page.tsx', 'utf8')
    const landing = readFileSync('src/app/page.tsx', 'utf8')
    expect(terms).toContain('TERMS_VERSION')
    expect(privacy).toContain('PRIVACY_NOTICE_VERSION')
    expect(loginPage).toContain('href="/termos"')
    expect(loginPage).toContain('href="/privacidade"')
    expect(loginPage).not.toContain('defaultChecked')
    expect(landing).not.toContain('href="#"')
  })

  test('socket operations use the central consent guard and public demo remains available', () => {
    const socket = readFileSync('mini-services/rescue-service/index.ts', 'utf8')
    const home = readFileSync('src/app/page.tsx', 'utf8')
    expect(socket).toContain('const currentOperationalAuth = async ()')
    expect(socket).toContain('hasCurrentConsents')
    expect(socket).toContain("socket.on('auth:client:request'")
    expect(home).toContain('ClientPanel')
    expect(home).toContain('ProviderPanel')
  })

  test('REST operational routes and critical provider actions use consent and confirmation guards', () => {
    const serviceCreate = readFileSync('src/app/api/client/services/route.ts', 'utf8')
    const availability = readFileSync('src/app/api/provider/availability/route.ts', 'utf8')
    const chat = readFileSync('src/app/api/services/[id]/chat/route.ts', 'utf8')
    const ratings = readFileSync('src/app/api/services/[id]/ratings/route.ts', 'utf8')
    const payment = readFileSync('src/app/api/payments/simulate/route.ts', 'utf8')
    const providerAdmin = readFileSync('src/app/admin/providers/[id]/page.tsx', 'utf8')
    for (const source of [availability, chat, ratings, payment]) {
      expect(source).toContain('requireCurrentConsents')
    }
    expect(serviceCreate).toContain('requireCurrentLocationConsent')
    expect(availability).toContain("hasCurrentConsentType(user.id, 'LOCATION')")
    expect(providerAdmin).toContain('window.confirm')
  })

  test('canonical LOCATION version is server-defined and separate from registration requirements', () => {
    expect(CURRENT_CONSENT_VERSIONS.TERMS).toBe(TERMS_VERSION)
    expect(CURRENT_CONSENT_VERSIONS.PRIVACY_NOTICE).toBe(PRIVACY_NOTICE_VERSION)
    expect(CURRENT_CONSENT_VERSIONS.PROVIDER_OPERATIONAL).toBe(PROVIDER_OPERATIONAL_VERSION)
    expect(CURRENT_CONSENT_VERSIONS.LOCATION).toBeTruthy()
    expect(allowedConsentTypesForRole('CLIENT')).toContain('LOCATION')
    expect(allowedConsentTypesForRole('PROVIDER')).toContain('LOCATION')
    expect(readFileSync('src/app/api/auth/register-client/route.ts', 'utf8')).not.toContain('LOCATION')
    expect(readFileSync('src/app/api/auth/register-provider/route.ts', 'utf8')).not.toContain('LOCATION')
  })
})
