// Help Bibi — Socket.IO Hardening tests (FASE 26)
// Tests pure validation helpers + per-socket rate limiter extracted to validation.ts.
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  isValidLatLng, isValidText, isNonEmptyString,
  socketRateLimit, clearSocketRateBuckets,
} from '../validation'

describe('socket-hardening — isValidLatLng()', () => {
  test('1. valid coords within range return true', () => {
    expect(isValidLatLng({ lat: -23.55, lng: -46.63 })).toBe(true)
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true)
    expect(isValidLatLng({ lat: 90, lng: 180 })).toBe(true)
    expect(isValidLatLng({ lat: -90, lng: -180 })).toBe(true)
  })

  test('2. out-of-range latitude returns false', () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false)
    expect(isValidLatLng({ lat: -91, lng: 0 })).toBe(false)
  })

  test('3. out-of-range longitude returns false', () => {
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false)
    expect(isValidLatLng({ lat: 0, lng: -181 })).toBe(false)
  })

  test('4. non-number lat/lng returns false', () => {
    expect(isValidLatLng({ lat: 'x', lng: 0 })).toBe(false)
    expect(isValidLatLng({ lat: 0, lng: 'y' })).toBe(false)
    expect(isValidLatLng({ lat: NaN, lng: 0 })).toBe(false)
  })

  test('5. null/undefined pos returns false', () => {
    expect(isValidLatLng(null)).toBe(false)
    expect(isValidLatLng(undefined)).toBe(false)
    expect(isValidLatLng({})).toBe(false)
  })
})

describe('socket-hardening — isValidText()', () => {
  test('6. non-empty string within max returns true', () => {
    expect(isValidText('hello', 50)).toBe(true)
    expect(isValidText('  hi  ', 50)).toBe(true) // trims whitespace, still non-empty
  })

  test('7. empty string returns false', () => {
    expect(isValidText('', 50)).toBe(false)
    expect(isValidText('   ', 50)).toBe(false) // only whitespace
  })

  test('8. string longer than max returns false', () => {
    expect(isValidText('a'.repeat(101), 100)).toBe(false)
  })

  test('9. non-string value returns false', () => {
    expect(isValidText(123 as any, 50)).toBe(false)
    expect(isValidText(null as any, 50)).toBe(false)
    expect(isValidText(undefined as any, 50)).toBe(false)
    expect(isValidText({} as any, 50)).toBe(false)
  })
})

describe('socket-hardening — isNonEmptyString()', () => {
  test('10. valid string within default max returns true; empty/too long/non-string return false', () => {
    expect(isNonEmptyString('hello')).toBe(true)
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString('   ')).toBe(false)
    // Default maxLen=200
    expect(isNonEmptyString('a'.repeat(200))).toBe(true)
    expect(isNonEmptyString('a'.repeat(201))).toBe(false)
    expect(isNonEmptyString(123 as any)).toBe(false)
    expect(isNonEmptyString(null as any)).toBe(false)
    expect(isNonEmptyString(undefined as any)).toBe(false)
  })
})

describe('socket-hardening — socketRateLimit() per-socket limiter', () => {
  beforeEach(() => { clearSocketRateBuckets() })

  test('11. first N requests allowed, N+1 blocked', () => {
    const max = 3
    // First 3 should be allowed
    for (let i = 0; i < max; i++) {
      expect(socketRateLimit('sock_1', 'provider:position', max, 10_000)).toBe(true)
    }
    // 4th should be blocked
    expect(socketRateLimit('sock_1', 'provider:position', max, 10_000)).toBe(false)
  })

  test('12. resets after the window expires', async () => {
    const max = 1
    expect(socketRateLimit('sock_2', 'chat:send', max, 30)).toBe(true)
    expect(socketRateLimit('sock_2', 'chat:send', max, 30)).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    // After window expires, request should be allowed again (fresh bucket)
    expect(socketRateLimit('sock_2', 'chat:send', max, 30)).toBe(true)
  })
})
