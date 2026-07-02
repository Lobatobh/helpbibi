// Help Bibi — Notification store (pure logic for testability)
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'
export type AppNotification = {
  id: string; role: 'CLIENT' | 'PROVIDER' | 'ADMIN'; type: string; title: string; message: string;
  severity: NotificationSeverity; createdAt: number; read: boolean; serviceId?: string;
  actionLabel?: string; actionTarget?: string; deduplicationKey?: string;
}

const MAX_NOTIFICATIONS = 50

export function addNotificationToList(
  list: AppNotification[],
  input: Omit<AppNotification, 'id' | 'createdAt' | 'read' | 'role'>,
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN',
  seenKeys: Set<string>
): AppNotification[] {
  const dedupKey = input.deduplicationKey || `${input.type}:${input.serviceId || ''}`
  if (seenKeys.has(dedupKey)) return list
  seenKeys.add(dedupKey)
  const notification: AppNotification = { ...input, id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, role, createdAt: Date.now(), read: false }
  return [notification, ...list].slice(0, MAX_NOTIFICATIONS)
}

export function markNotificationRead(list: AppNotification[], id: string): AppNotification[] {
  return list.map((n) => (n.id === id ? { ...n, read: true } : n))
}
export function markAllNotificationsRead(list: AppNotification[]): AppNotification[] {
  return list.map((n) => ({ ...n, read: true }))
}
export function clearNotifications(): AppNotification[] { return [] }
export function countUnread(list: AppNotification[]): number { return list.filter((n) => !n.read).length }
export function shouldNotifyChatMessage(messageFrom: 'client' | 'provider', viewerRole: 'client' | 'provider'): boolean {
  if (viewerRole === 'client') return messageFrom === 'provider'
  if (viewerRole === 'provider') return messageFrom === 'client'
  return false
}
export function isDuplicate(seenKeys: Set<string>, deduplicationKey: string): boolean { return seenKeys.has(deduplicationKey) }
export function chatDedupKey(messageId: string): string { return `chat:${messageId}` }
export function statusDedupKey(role: string, status: string, serviceId: string): string { return `${role}:${status}:${serviceId}` }
export function paymentDedupKey(status: string, serviceId: string): string { return `payment:${status}:${serviceId}` }
