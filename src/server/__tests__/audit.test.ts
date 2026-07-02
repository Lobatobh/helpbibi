// Help Bibi — Audit Log helper tests (FASE 26/27)
// FASE 27: getRecentAuditEvents is now async (may read from DB)
import { describe, test, expect } from 'bun:test'
import { audit, getRecentAuditEvents } from '@/server/audit'

describe('audit — basic API', () => {
  test('1. audit is a function', () => {
    expect(typeof audit).toBe('function')
  })

  test('2. getRecentAuditEvents returns an array', async () => {
    const events = await getRecentAuditEvents()
    expect(Array.isArray(events)).toBe(true)
  })
})

describe('audit — buffer push behavior', () => {
  test('3. audit pushes an event to the buffer (visible via getRecentAuditEvents)', async () => {
    const before = (await getRecentAuditEvents()).length
    audit('login_success', { actor: 'user_test_1', actorRole: 'CLIENT', ip: '127.0.0.1', route: '/api/auth/login' })
    const after = await getRecentAuditEvents()
    expect(after.length).toBeGreaterThanOrEqual(before)
    // The most recent event should be the one we just pushed
    const latest = after[after.length - 1]
    expect(latest.event).toBe('login_success')
    expect(latest.context.actor).toBe('user_test_1')
  })

  test('4. getRecentAuditEvents respects the limit parameter', async () => {
    // Push several events
    for (let i = 0; i < 5; i++) {
      audit('rate_limit_exceeded', { actor: `user_${i}`, route: `/r/${i}` })
    }
    const limited = await getRecentAuditEvents(2)
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

  test('6. audit does not crash with a minimal context (only event provided)', async () => {
    expect(() => {
      audit('logout', {} as any)
    }).not.toThrow()
    // The latest event should be 'logout'
    const events = await getRecentAuditEvents()
    const latest = events.slice(-1)[0]
    expect(latest.event).toBe('logout')
  })
})
