import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { POST as registerClient } from '@/app/api/auth/register-client/route'
import { POST as registerProvider } from '@/app/api/auth/register-provider/route'
import { PATCH as updateAvailability } from '@/app/api/provider/availability/route'
import { setSessionCookie } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { CURRENT_CONSENT_VERSIONS } from '@/server/consents/consent-versions'

const TEST_MARKER = 'f35-05-public-auth'

function uniqueEmail(kind: string) {
  return `${TEST_MARKER}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
}

function jsonRequest(url: string, body: unknown, cookie?: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function patchRequest(url: string, body: unknown, cookie?: string) {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function sessionCookie(userId: string, role: 'CLIENT' | 'PROVIDER' | 'ADMIN') {
  return setSessionCookie(userId, role).split(';')[0]
}

async function cleanupTestUsers() {
  await db.user.deleteMany({ where: { email: { contains: TEST_MARKER } } }).catch(() => {})
}

async function createProvider(approvalStatus: 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'APPROVED') {
  return db.user.create({
    data: {
      email: uniqueEmail(`provider-${approvalStatus.toLowerCase()}`),
      name: `F35 Provider ${approvalStatus}`,
      role: 'PROVIDER',
      status: 'ACTIVE',
      consentRecords: {
        create: ['TERMS', 'PRIVACY_NOTICE', 'PROVIDER_OPERATIONAL', 'LOCATION'].map((type) => ({
          type: type as any,
          version: CURRENT_CONSENT_VERSIONS[type as keyof typeof CURRENT_CONSENT_VERSIONS],
        })),
      },
      providerProfile: {
        create: {
          vehicle: 'Guincho Plataforma',
          plate: `F35${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          isAvailable: false,
          isVerified: approvalStatus === 'APPROVED',
          approvalStatus,
          documentStatus: approvalStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
          vehicleStatus: approvalStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
        },
      },
    },
    include: { providerProfile: true },
  })
}

beforeAll(cleanupTestUsers)
afterEach(cleanupTestUsers)
afterAll(cleanupTestUsers)

describe('F35-05 public registration and provider availability APIs', () => {
  test('public client registration creates a real CLIENT and ignores role/status input', async () => {
    const email = uniqueEmail('client')
    const response = await registerClient(jsonRequest('http://localhost/api/auth/register-client', {
      name: 'F35 Client',
      email,
      phone: '11999990000',
      password: 'Senha123!',
      acceptTerms: true,
      acceptPrivacy: true,
      role: 'ADMIN',
      status: 'SUSPENDED',
      isDemoProvider: true,
      approvalStatus: 'APPROVED',
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.role).toBe('CLIENT')
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(response.headers.get('set-cookie')).toContain('hb_session=')

    const user = await db.user.findUnique({
      where: { email },
      include: { clientProfile: true, providerProfile: true },
    })
    expect(user?.role).toBe('CLIENT')
    expect(user?.status).toBe('ACTIVE')
    expect(user?.clientProfile).toBeTruthy()
    expect(user?.providerProfile).toBeNull()
  })

  test('public provider registration creates a pending PROVIDER and ignores approval/demo input', async () => {
    const email = uniqueEmail('provider-api')
    const response = await registerProvider(jsonRequest('http://localhost/api/auth/register-provider', {
      name: 'F35 Provider',
      email,
      phone: '11999990001',
      password: 'Senha123!',
      vehicle: 'Guincho Plataforma',
      plate: 'F3505',
      city: 'Sao Paulo',
      acceptTerms: true,
      acceptPrivacy: true,
      acceptProviderOperational: true,
      role: 'ADMIN',
      status: 'ACTIVE',
      isAvailable: true,
      isVerified: true,
      isDemoProvider: true,
      approvalStatus: 'APPROVED',
      documentStatus: 'APPROVED',
      vehicleStatus: 'APPROVED',
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.role).toBe('PROVIDER')
    expect(payload.providerProfile.approvalStatus).toBe('PENDING')
    expect(payload.providerProfile.isAvailable).toBe(false)
    expect(payload.providerProfile.isVerified).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('passwordHash')

    const provider = await db.providerProfile.findFirst({
      where: { user: { email } },
      include: { user: true },
    })
    expect(provider?.user.role).toBe('PROVIDER')
    expect(provider?.approvalStatus).toBe('PENDING')
    expect(provider?.documentStatus).toBe('PENDING')
    expect(provider?.vehicleStatus).toBe('PENDING')
    expect(provider?.isAvailable).toBe(false)
    expect(provider?.isVerified).toBe(false)
    expect(provider?.isDemoProvider).toBe(false)
  })

  test('provider availability blocks unapproved providers and allows an approved provider with LOCATION consent', async () => {
    const pending = await createProvider('PENDING')
    const rejected = await createProvider('REJECTED')
    const suspended = await createProvider('SUSPENDED')
    const approved = await createProvider('APPROVED')

    const pendingResponse = await updateAvailability(patchRequest(
      'http://localhost/api/provider/availability',
      { online: true },
      sessionCookie(pending.id, 'PROVIDER')
    ))
    const rejectedResponse = await updateAvailability(patchRequest(
      'http://localhost/api/provider/availability',
      { online: true },
      sessionCookie(rejected.id, 'PROVIDER')
    ))
    const suspendedResponse = await updateAvailability(patchRequest(
      'http://localhost/api/provider/availability',
      { online: true },
      sessionCookie(suspended.id, 'PROVIDER')
    ))
    const approvedResponse = await updateAvailability(patchRequest(
      'http://localhost/api/provider/availability',
      { online: true },
      sessionCookie(approved.id, 'PROVIDER')
    ))
    const approvedPayload = await approvedResponse.json()

    expect(pendingResponse.status).toBe(403)
    expect(rejectedResponse.status).toBe(403)
    expect(suspendedResponse.status).toBe(403)
    expect(approvedResponse.status).toBe(200)
    expect(approvedPayload.isAvailable).toBe(true)

    const approvedProfile = await db.providerProfile.findUnique({ where: { userId: approved.id } })
    expect(approvedProfile?.isAvailable).toBe(true)
  })
})
