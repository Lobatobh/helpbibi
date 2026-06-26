'use client'

import { useMemo } from 'react'
import { Truck, MapPin, Flag, User } from 'lucide-react'
import type { LatLng, ProviderPublic, ProviderState } from '@/lib/rescue-types'

// City bounding box (must match server CITY center/span)
const CITY = {
  center: { lat: -23.5505, lng: -46.6333 },
  span: 0.06,
}

function project(p: LatLng) {
  const minLat = CITY.center.lat - CITY.span / 2
  const maxLat = CITY.center.lat + CITY.span / 2
  const minLng = CITY.center.lng - CITY.span / 2
  const maxLng = CITY.center.lng + CITY.span / 2
  const x = ((p.lng - minLng) / (maxLng - minLng)) * 100
  const y = (1 - (p.lat - minLat) / (maxLat - minLat)) * 100
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) }
}

type MapMarker = {
  id: string
  position: LatLng
  kind: 'provider' | 'pickup' | 'destination' | 'client'
  label?: string
  active?: boolean
}

export function RescueMap({
  providers = [],
  pickup,
  destination,
  providerState,
  clientPos,
  showRoute = true,
  height = 'h-full',
}: {
  providers?: ProviderPublic[]
  pickup?: LatLng | null
  destination?: LatLng | null
  providerState?: ProviderState | null
  clientPos?: LatLng | null
  showRoute?: boolean
  height?: string
}) {
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = []
    providers.forEach((p) => {
      if (providerState && p.id === providerState.id) return
      m.push({ id: p.id, position: p.position, kind: 'provider', label: p.name, active: false })
    })
    if (providerState) {
      m.push({
        id: providerState.id,
        position: providerState.position,
        kind: 'provider',
        label: providerState.name,
        active: true,
      })
    }
    if (pickup) m.push({ id: 'pickup', position: pickup, kind: 'pickup' })
    if (destination) m.push({ id: 'dest', position: destination, kind: 'destination' })
    if (clientPos) m.push({ id: 'client', position: clientPos, kind: 'client' })
    return m
  }, [providers, providerState, pickup, destination, clientPos])

  const route = useMemo(() => {
    if (!showRoute || !pickup || !destination) return null
    return { a: project(pickup), b: project(destination) }
  }, [pickup, destination, showRoute])

  const providerLine = useMemo(() => {
    if (!providerState?.position || !pickup) return null
    return { a: project(providerState.position), b: project(pickup) }
  }, [providerState, pickup])

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl bg-slate-950 ${height}`}>
      {/* street grid */}
      <div className="absolute inset-0 opacity-[0.18]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#64748b" strokeWidth="1" />
            </pattern>
            <pattern id="gridBig" width="160" height="160" patternUnits="userSpaceOnUse">
              <rect width="160" height="160" fill="url(#grid)" />
              <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gridBig)" />
        </svg>
      </div>

      {/* accent roads */}
      <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 bg-gradient-to-r from-sky-500/10 via-sky-400/20 to-sky-500/10 blur-[1px]" />
      <div className="absolute inset-y-0 left-1/3 w-6 bg-gradient-to-b from-amber-500/10 via-amber-400/15 to-amber-500/10 blur-[1px]" />

      {/* route line pickup -> destination */}
      {route && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <line
            x1={`${route.a.x}%`}
            y1={`${route.a.y}%`}
            x2={`${route.b.x}%`}
            y2={`${route.b.y}%`}
            stroke="#f59e0b"
            strokeWidth="3"
            strokeDasharray="8 6"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      )}

      {/* provider -> pickup line */}
      {providerLine && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <line
            x1={`${providerLine.a.x}%`}
            y1={`${providerLine.a.y}%`}
            x2={`${providerLine.b.x}%`}
            y2={`${providerLine.b.y}%`}
            stroke="#10b981"
            strokeWidth="2.5"
            strokeDasharray="4 5"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      )}

      {/* markers */}
      {markers.map((m) => {
        const pos = project(m.position)
        if (m.kind === 'provider') {
          return (
            <div
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-linear"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {m.active && (
                <span className="absolute -inset-3 animate-ping rounded-full bg-emerald-400/40" />
              )}
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 shadow-lg ${
                  m.active
                    ? 'border-emerald-300 bg-emerald-500 text-white'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >
                <Truck className="h-4 w-4" />
              </div>
            </div>
          )
        }
        if (m.kind === 'pickup') {
          return (
            <div
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="flex flex-col items-center">
                <div className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                  LOCAL
                </div>
                <MapPin className="h-7 w-7 -mt-1 text-amber-500 drop-shadow" fill="currentColor" />
              </div>
            </div>
          )
        }
        if (m.kind === 'destination') {
          return (
            <div
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="flex flex-col items-center">
                <div className="rounded-md bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                  DESTINO
                </div>
                <Flag className="h-7 w-7 -mt-1 text-sky-400 drop-shadow" fill="currentColor" />
              </div>
            </div>
          )
        }
        return (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-rose-500 text-white shadow-lg">
              <User className="h-4 w-4" />
            </div>
          </div>
        )
      })}

      <div className="absolute bottom-2 right-2 rounded-md bg-slate-900/70 px-2 py-1 text-[10px] font-medium text-slate-400 backdrop-blur">
        São Paulo · zona demo
      </div>
    </div>
  )
}
