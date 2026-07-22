import { afterAll, beforeAll, afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { POST as registerProvider } from '@/app/api/auth/register-provider/route'
import { GET as listProviders } from '@/app/api/admin/providers/route'
import { GET as getProvider, PATCH as patchProvider } from '@/app/api/admin/providers/[id]/route'
import { setSessionCookie } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import {
  auditEventForProviderApproval,
  buildProviderApprovalUpdate,
  canProviderOperate,
  getProviderOperationBlockReason,
  serializeProviderForAdmin,
} from '@/server/providers/provider-approval'

const TEST_MARKER = 'f35-03'

function uniqueEmail(role: string) {
  return `${TEST_MARKER}-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
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

function adminRequest(cookie?: string) {
  return new NextRequest('http://localhost/api/admin/providers', {
    headers: cookie ? { cookie } : {},
  })
}

function patchRequest(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/admin/providers/provider_1', {
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

async function createUser(role: 'CLIENT' | 'PROVIDER' | 'ADMIN') {
  return db.user.create({
    data: {
      email: uniqueEmail(role.toLowerCase()),
      name: `F35 ${role}`,
      role,
      status: 'ACTIVE',
      ...(role === 'CLIENT' ? { clientProfile: { create: {} } } : {}),
      ...(role === 'PROVIDER'
        ? {
            providerProfile: {
              create: {
                vehicle: 'Guincho',
                plate: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
                isAvailable: false,
                isVerified: false,
                approvalStatus: 'PENDING',
                documentStatus: 'PENDING',
                vehicleStatus: 'PENDING',
              },
            },
          }
        : {}),
    },
    include: { providerProfile: true },
  })
}

async function createProviderViaApi() {
  const email = uniqueEmail('provider-api')
  const response = await registerProvider(jsonRequest('http://localhost/api/auth/register-provider', {
    name: 'F35 Provider API',
    email,
    phone: '11999990000',
    password: 'Senha1234!',
    vehicle: 'Guincho Plataforma',
    plate: 'F3503',
    city: 'Sao Paulo',
    acceptTerms: true,
    acceptPrivacy: true,
    acceptProviderOperational: true,
  }))
  const payload = await response.json()
  return { response, payload, email }
}

async function cleanupTestUsers() {
  await db.user.deleteMany({
    where: { email: { contains: TEST_MARKER } },
  }).catch(() => {})
}

beforeAll(async () => {
  await cleanupTestUsers()
})

afterEach(async () => {
  await cleanupTestUsers()
})

afterAll(async () => {
  await cleanupTestUsers()
})

describe('F35-03 provider approval rules', () => {
  test('provider approval helper blocks pending, rejected and suspended providers', () => {
    const baseProvider = {
      isVerified: false,
      documentStatus: 'PENDING',
      vehicleStatus: 'PENDING',
      user: { status: 'ACTIVE' },
    }

    expect(getProviderOperationBlockReason({ ...baseProvider, approvalStatus: 'PENDING' })).toBe('provider_pending')
    expect(getProviderOperationBlockReason({ ...baseProvider, approvalStatus: 'REJECTED' })).toBe('provider_rejected')
    expect(getProviderOperationBlockReason({ ...baseProvider, approvalStatus: 'SUSPENDED' })).toBe('provider_suspended')
  })

  test('approved provider can operate only with verified account and approved documents', () => {
    const provider = {
      approvalStatus: 'APPROVED',
      isVerified: true,
      documentStatus: 'APPROVED',
      vehicleStatus: 'APPROVED',
      user: { status: 'ACTIVE' },
    }

    expect(canProviderOperate(provider)).toBe(true)
    expect(canProviderOperate({ ...provider, user: { status: 'SUSPENDED' } })).toBe(false)
    expect(canProviderOperate({ ...provider, documentStatus: 'PENDING' })).toBe(false)
  })

  test('status changes are explicit, reasoned when required, and map to audit events', () => {
    const approved = buildProviderApprovalUpdate('approve', 'admin_1')
    expect(approved.approvalStatus).toBe('APPROVED')
    expect(approved.isVerified).toBe(true)
    expect(approved.isAvailable).toBe(false)
    expect(approved.approvalReason).toBeNull()

    expect(() => buildProviderApprovalUpdate('reject', 'admin_1')).toThrow(/Motivo/)
    expect(() => buildProviderApprovalUpdate('suspend', 'admin_1')).toThrow(/Motivo/)

    const rejected = buildProviderApprovalUpdate('reject', 'admin_1', 'documentacao inconsistente')
    expect(rejected.approvalStatus).toBe('REJECTED')
    expect(rejected.approvalReviewedById).toBe('admin_1')
    expect(rejected.approvalReason).toBe('documentacao inconsistente')

    expect(auditEventForProviderApproval('approve')).toBe('provider_approved')
    expect(auditEventForProviderApproval('reject')).toBe('provider_rejected')
    expect(auditEventForProviderApproval('suspend')).toBe('provider_suspended')
  })

  test('admin serialization does not expose passwordHash or sensitive account fields', () => {
    const serialized = serializeProviderForAdmin({
      id: 'provider_1',
      userId: 'user_1',
      vehicle: 'Guincho',
      plate: 'ABC1234',
      approvalStatus: 'APPROVED',
      isVerified: true,
      documentStatus: 'APPROVED',
      vehicleStatus: 'APPROVED',
      user: {
        id: 'user_1',
        name: 'Provider',
        email: 'provider@example.test',
        phone: '11999990000',
        status: 'ACTIVE',
      } as any,
    })

    expect(serialized.canOperate).toBe(true)
    expect(JSON.stringify(serialized)).not.toContain('passwordHash')
  })
})

describe('F35-03 provider approval API flow', () => {
  test('provider registration creates a pending provider that cannot operate and does not return passwordHash', async () => {
    const { response, payload, email } = await createProviderViaApi()
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
    expect(provider?.approvalStatus).toBe('PENDING')
    expect(canProviderOperate(provider!)).toBe(false)
  })

  test('CLIENT, PROVIDER and unauthenticated users cannot access provider administration', async () => {
    const client = await createUser('CLIENT')
    const provider = await createUser('PROVIDER')

    const anonymous = await listProviders(adminRequest())
    const clientAccess = await listProviders(adminRequest(sessionCookie(client.id, 'CLIENT')))
    const providerAccess = await listProviders(adminRequest(sessionCookie(provider.id, 'PROVIDER')))

    expect(anonymous.status).toBe(403)
    expect(clientAccess.status).toBe(403)
    expect(providerAccess.status).toBe(403)
  })

  test('ADMIN lists, approves, rejects and suspends providers with audited fields', async () => {
    const admin = await createUser('ADMIN')
    const cookie = sessionCookie(admin.id, 'ADMIN')
    const { payload } = await createProviderViaApi()
    const providerId = payload.providerProfile.id as string
    const params = { params: Promise.resolve({ id: providerId }) }

    const listResponse = await listProviders(adminRequest(cookie))
    const listPayload = await listResponse.json()
    expect(listResponse.status).toBe(200)
    expect(listPayload.providers.some((provider: any) => provider.id === providerId)).toBe(true)

    const detailResponse = await getProvider(adminRequest(cookie), params)
    const detailPayload = await detailResponse.json()
    expect(detailResponse.status).toBe(200)
    expect(detailPayload.provider.approvalStatus).toBe('PENDING')
    expect(detailPayload.provider.canOperate).toBe(false)

    const rejectWithoutReason = await patchProvider(patchRequest({ action: 'reject' }, cookie), params)
    expect(rejectWithoutReason.status).toBe(400)

    const approveResponse = await patchProvider(patchRequest({ action: 'approve' }, cookie), params)
    const approved = await approveResponse.json()
    expect(approveResponse.status).toBe(200)
    expect(approved.provider.approvalStatus).toBe('APPROVED')
    expect(approved.provider.isAvailable).toBe(false)
    expect(approved.provider.isVerified).toBe(true)
    expect(approved.provider.canOperate).toBe(true)
    expect(approved.provider.approvalReviewedById).toBe(admin.id)

    const rejectResponse = await patchProvider(patchRequest({ action: 'reject', reason: 'documento ilegivel' }, cookie), params)
    const rejected = await rejectResponse.json()
    expect(rejectResponse.status).toBe(200)
    expect(rejected.provider.approvalStatus).toBe('REJECTED')
    expect(rejected.provider.approvalReason).toBe('documento ilegivel')
    expect(rejected.provider.canOperate).toBe(false)

    await patchProvider(patchRequest({ action: 'approve' }, cookie), params)
    const suspendResponse = await patchProvider(patchRequest({ action: 'suspend', reason: 'violacao operacional' }, cookie), params)
    const suspended = await suspendResponse.json()
    expect(suspendResponse.status).toBe(200)
    expect(suspended.provider.approvalStatus).toBe('SUSPENDED')
    expect(suspended.provider.approvalReason).toBe('violacao operacional')
    expect(suspended.provider.canOperate).toBe(false)
  })
})
