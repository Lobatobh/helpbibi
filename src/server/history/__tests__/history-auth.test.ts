// Help Bibi — History authorization tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import {
  canUseDbUserIdQuery, resolveHistoryActor,
  canAccessClientService, canAccessProviderService,
  getUnauthorizedStatus, getUnauthorizedMessage,
} from '@/server/history/history-auth'

describe('history-auth — canUseDbUserIdQuery', () => {
  test('1. dev returns true', () => {
    expect(canUseDbUserIdQuery('development')).toBe(true)
  })

  test('2. production returns false', () => {
    expect(canUseDbUserIdQuery('production')).toBe(false)
  })

  test('3. undefined returns true (dev default)', () => {
    expect(canUseDbUserIdQuery(undefined)).toBe(true)
  })

  test('4. test env returns true (non-production)', () => {
    expect(canUseDbUserIdQuery('test')).toBe(true)
  })
})

describe('history-auth — resolveHistoryActor', () => {
  test('5. session user with matching role is used', () => {
    const actor = resolveHistoryActor({ id: 'u1', role: 'CLIENT' }, 'db_user_1', 'CLIENT', 'production')
    expect(actor).toEqual({ userId: 'u1', role: 'CLIENT' })
  })

  test('6. dbUserId fallback used in dev when no session', () => {
    const actor = resolveHistoryActor(null, 'db_user_1', 'CLIENT', 'development')
    expect(actor).toEqual({ userId: 'db_user_1', role: 'CLIENT' })
  })

  test('7. dbUserId is blocked in production', () => {
    const actor = resolveHistoryActor(null, 'db_user_1', 'CLIENT', 'production')
    expect(actor).toBe(null)
  })

  test('8. null session + null dbUserId returns null', () => {
    const actor = resolveHistoryActor(null, null, 'CLIENT', 'development')
    expect(actor).toBe(null)
  })

  test('9. role mismatch returns null', () => {
    // session user is PROVIDER, expected CLIENT → no fallback to dbUserId in prod
    const actor = resolveHistoryActor({ id: 'u1', role: 'PROVIDER' }, null, 'CLIENT', 'production')
    expect(actor).toBe(null)
  })

  test('10. role mismatch falls back to dbUserId in dev', () => {
    const actor = resolveHistoryActor({ id: 'u1', role: 'PROVIDER' }, 'db_user_2', 'CLIENT', 'development')
    expect(actor).toEqual({ userId: 'db_user_2', role: 'CLIENT' })
  })

  test('11. PROVIDER role session resolves correctly', () => {
    const actor = resolveHistoryActor({ id: 'u2', role: 'PROVIDER' }, null, 'PROVIDER', 'production')
    expect(actor).toEqual({ userId: 'u2', role: 'PROVIDER' })
  })
})

describe('history-auth — canAccessClientService', () => {
  test('12. own service returns true', () => {
    const actor = { userId: 'u1', role: 'CLIENT' as const }
    const service = { id: 'svc_1', clientId: 'u1', providerId: null }
    expect(canAccessClientService(actor, service)).toBe(true)
  })

  test('13. other client service returns false', () => {
    const actor = { userId: 'u1', role: 'CLIENT' as const }
    const service = { id: 'svc_1', clientId: 'u2', providerId: null }
    expect(canAccessClientService(actor, service)).toBe(false)
  })

  test('14. provider role returns false (CLIENT-only access)', () => {
    const actor = { userId: 'u1', role: 'PROVIDER' as const }
    const service = { id: 'svc_1', clientId: 'u1', providerId: null }
    expect(canAccessClientService(actor, service)).toBe(false)
  })
})

describe('history-auth — canAccessProviderService', () => {
  test('15. matching profileId returns true', () => {
    const actor = { userId: 'u1', role: 'PROVIDER' as const }
    const service = { id: 'svc_1', clientId: 'c1', providerId: 'profile_1' }
    expect(canAccessProviderService(actor, service, 'profile_1')).toBe(true)
  })

  test('16. non-matching profileId returns false', () => {
    const actor = { userId: 'u1', role: 'PROVIDER' as const }
    const service = { id: 'svc_1', clientId: 'c1', providerId: 'profile_1' }
    expect(canAccessProviderService(actor, service, 'profile_2')).toBe(false)
  })

  test('17. null profileId returns false', () => {
    const actor = { userId: 'u1', role: 'PROVIDER' as const }
    const service = { id: 'svc_1', clientId: 'c1', providerId: 'profile_1' }
    expect(canAccessProviderService(actor, service, null)).toBe(false)
  })

  test('18. null service.providerId returns false', () => {
    const actor = { userId: 'u1', role: 'PROVIDER' as const }
    const service = { id: 'svc_1', clientId: 'c1', providerId: null }
    expect(canAccessProviderService(actor, service, 'profile_1')).toBe(false)
  })

  test('19. CLIENT role returns false (PROVIDER-only access)', () => {
    const actor = { userId: 'u1', role: 'CLIENT' as const }
    const service = { id: 'svc_1', clientId: 'c1', providerId: 'profile_1' }
    expect(canAccessProviderService(actor, service, 'profile_1')).toBe(false)
  })
})

describe('history-auth — unauthorized response', () => {
  test('20. getUnauthorizedStatus returns 404', () => {
    expect(getUnauthorizedStatus()).toBe(404)
  })

  test('21. getUnauthorizedMessage returns not-found message', () => {
    expect(getUnauthorizedMessage()).toMatch(/not found|not authorized/i)
  })
})
