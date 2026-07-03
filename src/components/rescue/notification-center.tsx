'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Check, CheckCheck, Trash2, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AppNotification, NotificationSeverity } from '@/hooks/use-notifications'

const SEVERITY_STYLES: Record<NotificationSeverity, { dot: string; bg: string; text: string }> = {
  info: { dot: 'bg-sky-500', bg: 'border-sky-500/20 bg-sky-500/5', text: 'text-sky-400' },
  success: { dot: 'bg-emerald-500', bg: 'border-emerald-500/20 bg-emerald-500/5', text: 'text-emerald-400' },
  warning: { dot: 'bg-amber-500', bg: 'border-amber-500/20 bg-amber-500/5', text: 'text-amber-400' },
  error: { dot: 'bg-rose-500', bg: 'border-rose-500/20 bg-rose-500/5', text: 'text-rose-400' },
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onAction,
}: {
  notifications: AppNotification[]
  unreadCount: number
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onClearAll: () => void
  onAction?: (target: string, serviceId?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-xs font-bold text-white">
              Notificações {unreadCount > 0 && <span className="text-rose-400">({unreadCount})</span>}
            </p>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-sky-400 hover:bg-slate-800"
                >
                  <CheckCheck className="h-3 w-3" /> Marcar todas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800"
                >
                  <Trash2 className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                <p className="text-xs text-slate-500">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {notifications.map((n) => {
                  const styles = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info
                  return (
                    <div
                      key={n.id}
                      className={`relative px-3 py-2.5 transition hover:bg-slate-800/40 ${!n.read ? styles.bg : ''}`}
                      onClick={() => { if (!n.read) onMarkAsRead(n.id) }}
                    >
                      {/* Unread dot */}
                      {!n.read && (
                        <span className={`absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${styles.dot}`} />
                      )}
                      <div className={!n.read ? 'pl-3' : 'pl-1'}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className={`text-xs font-bold ${n.read ? 'text-slate-400' : 'text-white'}`}>{n.title}</p>
                            <p className={`mt-0.5 text-[11px] leading-relaxed ${n.read ? 'text-slate-500' : 'text-slate-300'}`}>{n.message}</p>
                            <p className="mt-1 text-[9px] text-slate-600">{formatTimeAgo(n.createdAt)}</p>
                          </div>
                          {n.actionLabel && n.actionTarget && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onMarkAsRead(n.id)
                                onAction?.(n.actionTarget!, n.serviceId)
                                setOpen(false)
                              }}
                              className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-sky-400 transition hover:bg-slate-800"
                            >
                              {n.actionLabel} <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
