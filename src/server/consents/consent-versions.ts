import type { AuthRole } from '@/server/auth/session'

export const TERMS_VERSION = '2026-07-12-v1'
export const PRIVACY_NOTICE_VERSION = '2026-07-12-v1'
export const PROVIDER_OPERATIONAL_VERSION = '2026-07-12-v1'
export const LOCATION_CONSENT_VERSION = '2026-07-12-v1'

export const CONSENT_TYPES = [
  'TERMS',
  'PRIVACY_NOTICE',
  'LOCATION',
  'PROVIDER_OPERATIONAL',
] as const

export type ConsentTypeName = (typeof CONSENT_TYPES)[number]

export const CURRENT_CONSENT_VERSIONS: Record<ConsentTypeName, string> = {
  TERMS: TERMS_VERSION,
  PRIVACY_NOTICE: PRIVACY_NOTICE_VERSION,
  LOCATION: LOCATION_CONSENT_VERSION,
  PROVIDER_OPERATIONAL: PROVIDER_OPERATIONAL_VERSION,
}

export function requiredConsentTypesForRole(role: AuthRole | string): ConsentTypeName[] {
  if (role === 'CLIENT') return ['TERMS', 'PRIVACY_NOTICE']
  if (role === 'PROVIDER') return ['TERMS', 'PRIVACY_NOTICE', 'PROVIDER_OPERATIONAL']
  return []
}

export function isConsentTypeName(value: unknown): value is ConsentTypeName {
  return typeof value === 'string' && (CONSENT_TYPES as readonly string[]).includes(value)
}
