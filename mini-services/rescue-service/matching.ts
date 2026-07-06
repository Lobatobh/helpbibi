// Help Bibi — Matching logic (pure functions for testability)
export type LatLng = { lat: number; lng: number }
export type MatchingProvider = {
  id: string; name: string; online: boolean; position: LatLng; currentServiceId?: string | null;
  isDemoProvider: boolean; isVerified: boolean; documentStatus: string; vehicleStatus: string;
  userStatus: string; isGpsPosition?: boolean;
}
export type MatchingOptions = { isDevMode: boolean; demoMode?: boolean }

export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371; const dLat = ((b.lat - a.lat) * Math.PI) / 180; const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180; const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function createPublicDemoMatchingOptions(isProduction: boolean): MatchingOptions {
  return { isDevMode: !isProduction, demoMode: true }
}

export function getMatchingRejectionReason(provider: MatchingProvider, options: MatchingOptions): string | null {
  if (provider.userStatus !== 'ACTIVE') return 'user_not_active'
  if (!provider.online) return 'provider_offline'
  if (provider.currentServiceId) return 'provider_busy'
  if (provider.isDemoProvider) {
    if (!options.isDevMode && !options.demoMode) return 'demo_mode_disabled'
    return null
  }
  if (provider.isVerified !== true) return 'provider_not_verified'
  if (provider.documentStatus !== 'APPROVED') return 'documents_not_approved'
  if (provider.vehicleStatus !== 'APPROVED') return 'vehicle_not_approved'
  return null
}

export function isEligibleForMatching(provider: MatchingProvider, options: MatchingOptions): boolean {
  return getMatchingRejectionReason(provider, options) === null
}

export function rankProvidersByDistance(providers: MatchingProvider[], pickup: LatLng, options: MatchingOptions, limit: number = 3): MatchingProvider[] {
  return providers
    .filter((p) => isEligibleForMatching(p, options))
    .sort((a, b) => haversineDistance(a.position, pickup) - haversineDistance(b.position, pickup))
    .slice(0, limit)
}

export function getMatchingMode(pickupSource: string, provider: MatchingProvider | null): { matching: string; pickup: string; pos: string } {
  const pickup = pickupSource.toUpperCase() === 'GPS' ? 'GPS' : 'DEMO'
  const pos = provider?.isGpsPosition ? 'gps' : 'demo'
  const matching = pickup === 'GPS' ? 'gps' : 'demo'
  return { matching, pickup, pos }
}
