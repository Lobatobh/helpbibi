'use client'

import type { LatLng } from '@/lib/rescue-types'

const KEY = 'helpbibi:favorites'

export type FavoriteLocation = {
  id: string
  label: string
  address: string
  pos: LatLng
  icon: 'home' | 'work' | 'star' | 'map-pin'
  createdAt: number
}

function read(): FavoriteLocation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as FavoriteLocation[]
  } catch {
    return []
  }
}

function write(locations: FavoriteLocation[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(locations.slice(0, 20)))
  } catch {}
}

export function getFavorites(): FavoriteLocation[] {
  return read().sort((a, b) => b.createdAt - a.createdAt)
}

export function addFavorite(loc: FavoriteLocation): boolean {
  const all = read()
  // Don't add duplicates (same address)
  if (all.some((l) => l.address === loc.address)) return false
  all.push(loc)
  write(all)
  return true
}

export function removeFavorite(id: string) {
  const all = read().filter((l) => l.id !== id)
  write(all)
}

export function isFavorite(address: string): boolean {
  return read().some((l) => l.address === address)
}
