// Help Bibi — Audit Log helper tests (FASE 26)
import { describe, test, expect } from 'bun:test'
import { audit, getRecentAuditEvents } from '@/server/audit'

describe('audit — basic API', () => {
  test('1. audit is a function', () => {
    expect(typeof audit).toBe('function')
  })

  test('2. getRecentAuditEvents returns an array', () => {
    const events = getRecentAuditEvents()
    expect(Array.isArray(events)).toBe(true)
  })
})

describe('audit — buffer push behavior', () => {
  test('3. audit pushes an event to the buffer (visible via getRecentAuditEvents)', () => {
    const before = getRecentAuditEvents().length
    audit('login_success', { actor: 'user_test_1', actorRole: 'CLIENT', ip: '127.0.0.1', route: '/api/auth/login' })
    const after = getRecentAuditEvents()
    expect(after.length).toBeGreaterThan(before)
    // The most recent event should be the one we just pushed
    const latest = after[after.length - 1]
    expect(latest.event).toBe('login_success')
    expect(latest.context.actor).toBe('user_test_1')
  })

  test('4. getRecentAuditEvents respects the limit parameter', () => {
    // Push several events
    for (let i = 0; i < 5; i++) {
      audit('rate_limit_exceeded', { actor: `user_${i}`, route: `/r/${i}` })
    }
    const limited = getRecentAuditEvents(2)
    expect(limited.length).toBeLessThanOrEqual(2)
  })
})

describe('audit — robustness', () => {
  test('5. audit does not crash with undefined metadata', () => {
    expect(() => {
      audit('unauthorized_access', {
        actor: 'anonymous',
        metadata: undefined,
      })
    }).not.toThrow()
  })

  test('6. audit does not crash with a minimal context (only event provided)', () => {
    expect(() => {
      audit('logout', {} as any)
    }).not.toThrow()
    // The latest event should be 'logout'
    const latest = getRecentAuditEvents().slice(-1)[0]
    expect(latest.event).toBe('logout')
  })
})
