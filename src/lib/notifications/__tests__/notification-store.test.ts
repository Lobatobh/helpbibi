// Help Bibi — Notification Store tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import {
  addNotificationToList, markNotificationRead, markAllNotificationsRead, clearNotifications,
  countUnread, shouldNotifyChatMessage, isDuplicate,
  chatDedupKey, statusDedupKey, paymentDedupKey,
  type AppNotification,
} from '@/lib/notifications/notification-store'

const baseNotifInput = (overrides: Partial<Omit<AppNotification, 'id' | 'createdAt' | 'read' | 'role'>> = {}) => ({
  type: 'status',
  title: 'Status update',
  message: 'Service status changed',
  severity: 'info' as const,
  serviceId: 'svc_1',
  ...overrides,
})

describe('notification-store — addNotificationToList', () => {
  test('1. adds notification to front of list', () => {
    const list: AppNotification[] = []
    const seen = new Set<string>()
    const result = addNotificationToList(list, baseNotifInput({ title: 'First', deduplicationKey: 'k_1' }), 'CLIENT', seen)
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('First')
    // Add a second → it should be at the front
    const result2 = addNotificationToList(result, baseNotifInput({ title: 'Second', deduplicationKey: 'k_2' }), 'CLIENT', seen)
    expect(result2.length).toBe(2)
    expect(result2[0].title).toBe('Second')
    expect(result2[1].title).toBe('First')
  })

  test('2. deduplicates by deduplicationKey (same key = not added)', () => {
    const list: AppNotification[] = []
    const seen = new Set<string>()
    const input = baseNotifInput({ deduplicationKey: 'dup_key_1', title: 'Original' })
    const result1 = addNotificationToList(list, input, 'CLIENT', seen)
    expect(result1.length).toBe(1)
    // Same deduplicationKey → not added
    const input2 = baseNotifInput({ deduplicationKey: 'dup_key_1', title: 'Duplicate' })
    const result2 = addNotificationToList(result1, input2, 'CLIENT', seen)
    expect(result2.length).toBe(1)
    expect(result2[0].title).toBe('Original')
  })

  test('3. auto-generates deduplicationKey from type:serviceId when not provided', () => {
    const list: AppNotification[] = []
    const seen = new Set<string>()
    const input = baseNotifInput({ type: 'status', serviceId: 'svc_42' })
    const result1 = addNotificationToList(list, input, 'CLIENT', seen)
    expect(result1.length).toBe(1)
    // Same type+serviceId → auto-dedup key matches → not added again
    const input2 = baseNotifInput({ type: 'status', serviceId: 'svc_42', title: 'Different title' })
    const result2 = addNotificationToList(result1, input2, 'CLIENT', seen)
    expect(result2.length).toBe(1)
  })

  test('4. list capped at 50 (MAX_NOTIFICATIONS)', () => {
    const list: AppNotification[] = []
    const seen = new Set<string>()
    let current = list
    for (let i = 0; i < 60; i++) {
      current = addNotificationToList(current, baseNotifInput({ title: `Notif ${i}`, serviceId: `svc_${i}`, deduplicationKey: `key_${i}` }), 'CLIENT', seen)
    }
    expect(current.length).toBe(50)
    // The most recent (Notif 59) should be at the front
    expect(current[0].title).toBe('Notif 59')
    // The oldest one kept should be Notif 10 (because we added 60, capped at 50)
    expect(current[49].title).toBe('Notif 10')
  })
})

describe('notification-store — markNotificationRead', () => {
  test('5. marks specific notification id as read=true', () => {
    const seen = new Set<string>()
    const list = addNotificationToList([], baseNotifInput({ title: 'A', deduplicationKey: 'k_a' }), 'CLIENT', seen)
    const list2 = addNotificationToList(list, baseNotifInput({ title: 'B', deduplicationKey: 'k_b' }), 'CLIENT', seen)
    const targetId = list2[1].id // "A" notification id
    const marked = markNotificationRead(list2, targetId)
    expect(marked[1].read).toBe(true)
    expect(marked[0].read).toBe(false) // "B" still unread
  })
})

describe('notification-store — markAllNotificationsRead', () => {
  test('6. all notifications marked read=true', () => {
    const seen = new Set<string>()
    const list = addNotificationToList([], baseNotifInput({ title: 'A', deduplicationKey: 'k_a' }), 'CLIENT', seen)
    const list2 = addNotificationToList(list, baseNotifInput({ title: 'B', deduplicationKey: 'k_b' }), 'CLIENT', seen)
    const allRead = markAllNotificationsRead(list2)
    expect(allRead.every((n) => n.read === true)).toBe(true)
  })
})

describe('notification-store — clearNotifications', () => {
  test('7. returns empty array', () => {
    expect(clearNotifications()).toEqual([])
  })
})

describe('notification-store — countUnread', () => {
  test('8. counts only unread notifications', () => {
    const seen = new Set<string>()
    const list = addNotificationToList([], baseNotifInput({ title: 'A', deduplicationKey: 'k_a' }), 'CLIENT', seen)
    const list2 = addNotificationToList(list, baseNotifInput({ title: 'B', deduplicationKey: 'k_b' }), 'CLIENT', seen)
    expect(countUnread(list2)).toBe(2)
    const marked = markNotificationRead(list2, list2[0].id)
    expect(countUnread(marked)).toBe(1)
    const allRead = markAllNotificationsRead(list2)
    expect(countUnread(allRead)).toBe(0)
  })
})

describe('notification-store — shouldNotifyChatMessage', () => {
  test('9. client viewer + provider message = true (notify)', () => {
    expect(shouldNotifyChatMessage('provider', 'client')).toBe(true)
  })

  test('10. client viewer + client message = false (self-message)', () => {
    expect(shouldNotifyChatMessage('client', 'client')).toBe(false)
  })

  test('11. provider viewer + client message = true (notify)', () => {
    expect(shouldNotifyChatMessage('client', 'provider')).toBe(true)
  })

  test('12. provider viewer + provider message = false (self-message)', () => {
    expect(shouldNotifyChatMessage('provider', 'provider')).toBe(false)
  })
})

describe('notification-store — dedup key helpers', () => {
  test('13. chatDedupKey format: chat:messageId', () => {
    expect(chatDedupKey('msg_123')).toBe('chat:msg_123')
  })

  test('14. statusDedupKey format: role:status:serviceId', () => {
    expect(statusDedupKey('CLIENT', 'ACCEPTED', 'svc_42')).toBe('CLIENT:ACCEPTED:svc_42')
    expect(statusDedupKey('PROVIDER', 'COMPLETED', 'svc_99')).toBe('PROVIDER:COMPLETED:svc_99')
  })

  test('15. paymentDedupKey format: payment:status:serviceId', () => {
    expect(paymentDedupKey('PAID', 'svc_42')).toBe('payment:PAID:svc_42')
    expect(paymentDedupKey('FAILED', 'svc_99')).toBe('payment:FAILED:svc_99')
  })

  test('16. isDuplicate returns true for seen key, false for unseen', () => {
    const seen = new Set<string>(['existing_key'])
    expect(isDuplicate(seen, 'existing_key')).toBe(true)
    expect(isDuplicate(seen, 'new_key')).toBe(false)
  })

  test('17. notification has correct role assignment', () => {
    const seen = new Set<string>()
    const list = addNotificationToList([], baseNotifInput({ deduplicationKey: 'r1' }), 'PROVIDER', seen)
    expect(list[0].role).toBe('PROVIDER')
    const list2 = addNotificationToList([], baseNotifInput({ deduplicationKey: 'r2' }), 'ADMIN', seen)
    expect(list2[0].role).toBe('ADMIN')
  })

  test('18. notification id and createdAt are populated', () => {
    const seen = new Set<string>()
    const list = addNotificationToList([], baseNotifInput({ deduplicationKey: 'r3' }), 'CLIENT', seen)
    expect(list[0].id).toMatch(/^notif_/)
    expect(typeof list[0].createdAt).toBe('number')
    expect(list[0].read).toBe(false)
  })
})
