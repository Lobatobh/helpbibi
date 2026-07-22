export type OperationalLocation = { lat: number; lng: number }

export function isValidOperationalLocation(value: unknown): value is OperationalLocation {
  if (!value || typeof value !== 'object') return false
  const { lat, lng } = value as Partial<OperationalLocation>
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}
