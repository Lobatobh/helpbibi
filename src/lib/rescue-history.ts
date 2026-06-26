'use client'

import type { ServiceRecord, ServiceData, Role } from './rescue-types'

const KEY = 'socorroja:history'

function read(): ServiceRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as ServiceRecord[]
  } catch {
    return []
  }
}

function write(records: ServiceRecord[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records.slice(0, 50)))
  } catch {}
}

export function getHistory(): ServiceRecord[] {
  return read().sort((a, b) => b.completedAt - a.completedAt)
}

export function getHistoryForRole(role: Role): ServiceRecord[] {
  return read().filter((r) => r.role === role).sort((a, b) => b.completedAt - a.completedAt)
}

// Add a record only if not already present (matched by id+role)
export function addRecord(rec: ServiceRecord) {
  const all = read()
  if (all.some((r) => r.id === rec.id && r.role === rec.role)) return
  all.push(rec)
  write(all)
}

// Build a record from a completed/cancelled service, from a given role perspective
export function recordFromService(svc: ServiceData, role: Role): ServiceRecord | null {
  if (svc.status !== 'completed' && svc.status !== 'cancelled' && svc.status !== 'expired') return null
  const counterpartName =
    role === 'client' ? svc.provider?.name ?? '—' : svc.clientName
  return {
    id: svc.id,
    role,
    type: svc.type,
    typeLabel: svc.typeLabel,
    icon: svc.icon,
    price: svc.price,
    originalPrice: svc.originalPrice ?? svc.price,
    discount: svc.discount ?? 0,
    promoCode: svc.promoCode ?? null,
    distanceKm: svc.distanceKm,
    paymentMethod: svc.paymentMethod,
    pickupLabel: svc.pickupLabel,
    destinationLabel: svc.destinationLabel,
    counterpartName,
    status: svc.status,
    description: svc.description,
    timeline: svc.timeline,
    createdAt: svc.createdAt,
    completedAt: svc.completedAt ?? Date.now(),
    rating: svc.rating ? { stars: svc.rating.stars, comment: svc.rating.comment } : null,
  }
}

// Update an existing record (e.g., attach a rating after the fact)
export function updateRecord(id: string, role: Role, patch: Partial<ServiceRecord>) {
  const all = read()
  const idx = all.findIndex((r) => r.id === id && r.role === role)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...patch }
  write(all)
}

export function clearHistory() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY)
}
