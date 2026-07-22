import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('F35-05 authenticated operational workflow wiring', () => {
  test('public login page connects to real client/provider registration without admin registration', () => {
    const page = read('src/app/login/page.tsx')

    expect(page).toContain('/api/auth/login')
    expect(page).toContain('/api/auth/register-client')
    expect(page).toContain('/api/auth/register-provider')
    expect(page).toContain('/admin/login')
    expect(page).not.toContain('/api/auth/register-admin')
  })

  test('authenticated client page loads active DB snapshot before socket updates', () => {
    const page = read('src/app/cliente/page.tsx')

    expect(page).toContain('getCurrentUserFromCookies')
    expect(page).toContain("canAccessRole(user, 'CLIENT')")
    expect(page).toContain('findActiveServiceForClient')
    expect(page).toContain('AuthenticatedClientPanel')
  })

  test('authenticated provider page keeps approval gate and loads linked active service', () => {
    const page = read('src/app/prestador/page.tsx')

    expect(page).toContain("canAccessRole(user, 'PROVIDER')")
    expect(page).toContain('normalizeProviderApprovalStatus')
    expect(page).toContain('canProviderOperate')
    expect(page).toContain('findActiveServiceForProvider')
    expect(page).toContain('AuthenticatedProviderPanel')
  })

  test('Socket.IO authenticated path reuses signed session cookie and ignores frontend identity fields', () => {
    const service = read('mini-services/rescue-service/index.ts')

    expect(service).toContain('getSessionUserFromCookieHeader(cookieHeader)')
    expect(service).toContain('authenticatedSockets')
    expect(service).toContain('const currentActiveAuth = async ()')
    expect(service).toContain("user.status !== 'ACTIVE'")
    expect(service).toContain("socket.on('auth:client:request'")
    expect(service).toContain('const auth = await currentActiveAuth()')
    expect(service).toContain('clientId: auth.userId')
    expect(service).toContain("socket.on('client:register'")
    expect(service).toContain("socket.on('provider:register'")
  })

  test('real matching requires connected non-demo providers and persisted availability intent', () => {
    const service = read('mini-services/rescue-service/index.ts')

    expect(service).toContain('authenticatedCandidateProviders')
    expect(service).toContain('!provider.isDemoProvider')
    expect(service).toContain('!!provider.dbProviderProfileId')
    expect(service).toContain('online: false')
    expect(service).toContain('isAvailableIntent: consentsCurrent && profile.isAvailable')
    expect(service).toContain('locationConsentCurrent')
    expect(service).toContain('positionFresh')
    expect(service).toContain("data: { isAvailable: data.online === true }")
  })

  test('request creation is deduplicated and emits the persisted ServiceRequest id', () => {
    const service = read('mini-services/rescue-service/index.ts')
    const lifecycle = read('src/server/services/service-lifecycle.ts')

    expect(lifecycle).toContain('dedupeActive')
    expect(lifecycle).toContain('.findFirst')
    expect(service).toContain('{ dedupeActive: true')
    expect(service).toContain('id: dbSvc.id')
    expect(service).toContain('dbServiceId: dbSvc.id')
    expect(service).toContain('duplicate request blocked')
  })

  test('authenticated offers are persisted before socket emission and acceptance uses compare-and-set', () => {
    const service = read('mini-services/rescue-service/index.ts')
    const lifecycle = read('src/server/services/service-lifecycle.ts')

    expect(service).toContain('await registerServiceOffers')
    expect(service).toContain("io.to(provider.socketId).emit('auth:service:offer'")
    expect(lifecycle).toContain('isolationLevel')
    expect(lifecycle).toContain('Serializable')
    expect(lifecycle).toContain('.updateMany')
    expect(lifecycle).toContain('service_claim_conflict')
  })

  test('authenticated chat persists through the central service before socket emission', () => {
    const service = read('mini-services/rescue-service/index.ts')

    expect(service).toContain("socket.on('auth:chat:send'")
    expect(service).toContain("socket.on('auth:chat:history'")
    expect(service).toContain('createServiceChatMessage(data.serviceId, currentUserFromAuth(auth)')
    expect(service).toContain('const message = await createServiceChatMessage')
    expect(service).toContain('await emitAuthenticatedChatMessage(data.serviceId, message)')
    expect(service).toContain("io.to(socketId).emit('auth:chat:new', message)")
    expect(service).toContain("socket.on('chat:send'")
  })
})
