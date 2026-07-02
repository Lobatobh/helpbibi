'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { addNotificationToList, markNotificationRead, markAllNotificationsRead, clearNotifications, countUnread, shouldNotifyChatMessage, chatDedupKey, statusDedupKey, paymentDedupKey, type AppNotification, type NotificationSeverity } from '@/lib/notifications/notification-store'
export type { AppNotification, NotificationSeverity }

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (typeof window === 'undefined') return
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = ctx.createOscillator(); const gainNode = ctx.createGain()
    oscillator.connect(gainNode); gainNode.connect(ctx.destination)
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + duration)
    setTimeout(() => ctx.close(), duration * 1000 + 100)
  } catch (e) {}
}

function playNotificationSound(severity: NotificationSeverity, type: string) {
  if (type === 'offer') { playTone(659, 0.12, 'sine', 0.12); setTimeout(() => playTone(880, 0.15, 'sine', 0.12), 120); return }
  if (type === 'accepted' || type === 'arrived') { playTone(523, 0.1, 'sine', 0.1); setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 200); return }
  if (type === 'completed') { playTone(523, 0.1, 'sine', 0.12); setTimeout(() => playTone(784, 0.25, 'sine', 0.12), 200); return }
  if (type === 'cancelled' || type === 'expired') { playTone(440, 0.15, 'sawtooth', 0.08); setTimeout(() => playTone(330, 0.2, 'sawtooth', 0.08), 150); return }
  if (type === 'chat') { playTone(800, 0.06, 'sine', 0.08); return }
  if (severity === 'error') { playTone(440, 0.15, 'sawtooth', 0.08); return }
  if (severity === 'success') { playTone(523, 0.1, 'sine', 0.1); return }
}

export type AddNotificationInput = Omit<AppNotification, 'id' | 'createdAt' | 'read' | 'role'>

export function useNotifications(role: 'CLIENT' | 'PROVIDER' | 'ADMIN', soundEnabled: boolean = false) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const seenKeysRef = useRef<Set<string>>(new Set())
  const soundRef = useRef(soundEnabled)
  useEffect(() => { soundRef.current = soundEnabled }, [soundEnabled])
  useEffect(() => { setUnreadCount(countUnread(notifications)) }, [notifications])

  const addNotification = useCallback((input: AddNotificationInput) => {
    setNotifications((prev) => {
      const next = addNotificationToList(prev, input, role, seenKeysRef.current)
      if (next !== prev && soundRef.current) { try { playNotificationSound(input.severity, input.type) } catch {} }
      return next
    })
  }, [role])

  const markAsRead = useCallback((id: string) => { setNotifications((prev) => markNotificationRead(prev, id)) }, [])
  const markAllAsRead = useCallback(() => { setNotifications((prev) => markAllNotificationsRead(prev)) }, [])
  const clearAll = useCallback(() => { seenKeysRef.current = new Set(); setNotifications(clearNotifications()) }, [])

  const notifyChatMessage = useCallback((messageFrom: 'client' | 'provider', viewerRole: 'client' | 'provider', msg: { id: string; text: string; fromName: string }, serviceId: string) => {
    if (!shouldNotifyChatMessage(messageFrom, viewerRole)) return
    addNotification({ type: 'chat', title: `Nova mensagem de ${msg.fromName}`, message: msg.text.slice(0, 100), severity: 'info', serviceId, deduplicationKey: chatDedupKey(msg.id), actionLabel: 'Ver conversa' })
  }, [addNotification])

  const notifyServiceStatus = useCallback((viewerRole: 'client' | 'provider', status: string, serviceId: string, title: string, message: string, severity: NotificationSeverity = 'info') => {
    addNotification({ type: status, title, message, severity, serviceId, deduplicationKey: statusDedupKey(viewerRole, status, serviceId) })
  }, [addNotification])

  const notifyPaymentResult = useCallback((paymentStatus: string, serviceId: string, title: string, message: string, severity: NotificationSeverity = 'info') => {
    addNotification({ type: `payment_${paymentStatus}`, title, message, severity, serviceId, deduplicationKey: paymentDedupKey(paymentStatus, serviceId) })
  }, [addNotification])

  return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll, notifyChatMessage, notifyServiceStatus, notifyPaymentResult }
}
