import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('F35-09B authenticated geolocation contract', () => {
  test('client uses explicit LOCATION consent and real browser coordinates without fixed fallback', () => {
    const panel = read('src/components/rescue/authenticated-client-panel.tsx')
    const hook = read('src/hooks/use-geolocation.ts')
    const api = read('src/app/api/client/services/route.ts')
    expect(panel).toContain("JSON.stringify({ types: ['LOCATION'] })")
    expect(panel).toContain('geolocation.requestPosition()')
    expect(panel).toContain('pickup: { lat: geolocation.coords.lat, lng: geolocation.coords.lng }')
    expect(panel).toContain('destination: null')
    expect(panel).not.toContain('defaultPickup')
    expect(panel).not.toContain('defaultDestination')
    expect(hook).not.toContain('__MOCK_GPS__')
    expect(hook).not.toContain('localizacao demo')
    expect(api).toContain("requireCurrentLocationConsent(req, 'CLIENT')")
    expect(api).toContain('isValidOperationalLocation(body?.pickup)')
  })

  test('provider starts watchPosition only after an explicit action and sends no identity fields', () => {
    const panel = read('src/components/rescue/authenticated-provider-panel.tsx')
    const hook = read('src/hooks/use-authenticated-rescue-socket.ts')
    const geolocation = read('src/hooks/use-geolocation.ts')
    expect(panel).toContain('startOperationalLocation')
    expect(panel).toContain('geolocation.startWatch()')
    expect(panel).toContain('onClick={() => online ? stopOperationalLocation()')
    expect(panel).toContain('geolocation.stopWatch()')
    expect(geolocation).toContain('navigator.geolocation.watchPosition')
    expect(geolocation).toContain('navigator.geolocation.clearWatch')
    const positionStart = hook.indexOf("emit('auth:provider:position'")
    const positionPayload = hook.slice(positionStart, positionStart + 240)
    expect(positionPayload).not.toContain('providerId')
    expect(positionPayload).not.toContain('userId')
    expect(positionPayload).not.toContain('role')
  })

  test('authenticated matching requires a fresh real position and LOCATION consent', () => {
    const rescue = read('mini-services/rescue-service/index.ts')
    const matching = read('mini-services/rescue-service/matching.ts')
    expect(rescue).toContain("socket.on('auth:provider:position'")
    expect(rescue).toContain("hasCurrentConsentType(auth.userId, 'LOCATION'")
    expect(rescue).toContain('authenticatedProviders.values()')
    expect(matching).toContain('AUTH_POSITION_MAX_AGE_MS')
    expect(matching).toContain('provider_location_stale')
    expect(matching).toContain('location_consent_required')
  })
})

describe('F35-09B demo and tracking isolation contract', () => {
  test('demo and authenticated sockets use separate state collections and real sessions cannot fall back to demo', () => {
    const rescue = read('mini-services/rescue-service/index.ts')
    expect(rescue).toContain('const authenticatedProviders = new Map')
    expect(rescue).toContain('const authenticatedClients = new Map')
    expect(rescue).toContain('const authenticatedServices = new Map')
    expect(rescue).toContain('const demoAllowed = !boundAuth && !hasSessionCookie')
    expect(rescue).toContain('if (demoAllowed) {')
    expect(rescue).toContain('const uid = (prefix = \'\') => `${prefix}${randomUUID()}`')

    const demoFlow = rescue.slice(
      rescue.indexOf('if (demoAllowed) {'),
      rescue.indexOf("socket.on('disconnect'"),
    )
    expect(demoFlow).not.toContain('db.')
    expect(demoFlow).not.toContain('createOperationalService')
    expect(demoFlow).not.toContain('persistServiceStatus')
  })

  test('authenticated provider flow has no random position or automatic movement', () => {
    const rescue = read('mini-services/rescue-service/index.ts')
    const authFlow = rescue.slice(
      rescue.indexOf('async function bindAuthenticatedClient'),
      rescue.indexOf('if (demoAllowed) {'),
    )
    expect(authFlow).toContain('position: null')
    expect(authFlow).not.toContain('Math.random')
    expect(authFlow).not.toContain('stepToward')
    expect(authFlow).not.toContain('p.destination = svc.pickup')
  })

  test('serviceId public route is a tombstone and token route is rate limited', () => {
    const legacyRoute = read('src/app/api/track/[serviceId]/route.ts')
    const tokenRoute = read('src/app/api/tracking/[token]/route.ts')
    const publicPanel = read('src/components/rescue/public-tracking.tsx')
    const demoClientPanel = read('src/components/rescue/client-panel.tsx')
    expect(legacyRoute).not.toContain('serviceRequest')
    expect(legacyRoute).not.toContain('getPublicTracking')
    expect(tokenRoute).toContain('RATE_LIMITS.track')
    expect(tokenRoute).toContain('getPublicTracking(token)')
    expect(publicPanel).toContain('/api/tracking/')
    expect(publicPanel).not.toContain('public:track')
    expect(publicPanel).not.toContain('serviceId')
    expect(demoClientPanel).not.toContain('?track=${svcId}')
  })
})
