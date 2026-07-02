// Help Bibi — History authorization logic (pure functions for testability)
export type HistoryActor = { userId: string; role: 'CLIENT' | 'PROVIDER' | 'ADMIN' }
export type HistoryService = { id: string; clientId: string; providerId?: string | null }

export function canUseDbUserIdQuery(env: string | undefined): boolean {
  return env !== 'production'
}

export function resolveHistoryActor(
  sessionUser: { id: string; role: string } | null,
  queryDbUserId: string | null,
  expectedRole: 'CLIENT' | 'PROVIDER',
  nodeEnv: string | undefined
): HistoryActor | null {
  if (sessionUser && sessionUser.role === expectedRole) {
    return { userId: sessionUser.id, role: expectedRole }
  }
  if (queryDbUserId && canUseDbUserIdQuery(nodeEnv)) {
    return { userId: queryDbUserId, role: expectedRole }
  }
  return null
}

export function canAccessClientService(actor: HistoryActor, service: HistoryService): boolean {
  if (actor.role !== 'CLIENT') return false
  return service.clientId === actor.userId
}

export function canAccessProviderService(
  actor: HistoryActor,
  service: HistoryService,
  actorProviderProfileId: string | null
): boolean {
  if (actor.role !== 'PROVIDER') return false
  if (!service.providerId) return false
  if (!actorProviderProfileId) return false
  return service.providerId === actorProviderProfileId
}

export function getUnauthorizedStatus(): number { return 404 }
export function getUnauthorizedMessage(): string { return 'Service not found or not authorized' }
