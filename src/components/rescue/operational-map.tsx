'use client'

import { useMemo } from 'react'
import { LocateFixed, MapPin, Navigation, Truck } from 'lucide-react'
import type { LatLng } from '@/lib/rescue-types'

type Marker = {
  id: string
  kind: 'user' | 'pickup' | 'destination' | 'provider'
  point: LatLng
  label: string
}

export function OperationalMap({
  userPosition,
  pickup,
  destination,
  providerPosition,
  pickupLabel,
  providerLabel,
  distanceKm,
  etaMin,
  className = '',
}: {
  userPosition?: LatLng | null
  pickup?: LatLng | null
  destination?: LatLng | null
  providerPosition?: LatLng | null
  pickupLabel?: string | null
  providerLabel?: string | null
  distanceKm?: number | null
  etaMin?: number | null
  className?: string
}) {
  const markers = useMemo<Marker[]>(() => {
    const next: Marker[] = []
    if (userPosition) next.push({ id: 'user', kind: 'user', point: userPosition, label: 'Sua posição' })
    if (pickup && !samePoint(userPosition, pickup)) {
      next.push({ id: 'pickup', kind: 'pickup', point: pickup, label: pickupLabel || 'Local do atendimento' })
    }
    if (destination) next.push({ id: 'destination', kind: 'destination', point: destination, label: 'Destino' })
    if (providerPosition && !samePoint(userPosition, providerPosition)) {
      next.push({ id: 'provider', kind: 'provider', point: providerPosition, label: providerLabel || 'Prestador' })
    }
    return next
  }, [destination, pickup, pickupLabel, providerLabel, providerPosition, userPosition])

  const projected = useMemo(() => projectMarkers(markers), [markers])
  const routePoints = projected.filter((marker) => marker.kind === 'provider' || marker.kind === 'pickup')

  return (
    <section
      className={`relative isolate min-h-72 overflow-hidden rounded-[1.25rem] border border-border bg-[#E8F8FF] shadow-[var(--hb-shadow-soft)] dark:bg-[#073B5D] ${className}`}
      aria-label="Mapa operacional do atendimento"
    >
      <div
        className="absolute inset-0 opacity-45 dark:opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(rgba(7,59,93,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(7,59,93,.16) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />
      <div className="absolute inset-x-[8%] top-[36%] h-3 rotate-[-4deg] rounded-full bg-white/75 dark:bg-black/20" />
      <div className="absolute bottom-[20%] left-[34%] top-[6%] w-3 rotate-[8deg] rounded-full bg-white/70 dark:bg-black/20" />

      <div className="absolute left-3 top-3 z-20 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/60 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/55">
        <p className="flex items-center gap-2 text-xs font-extrabold text-[#073B5D] dark:text-white">
          <MapPin className="size-3.5 text-[#00BFFF]" />
          {pickupLabel || (markers.length ? 'Posição operacional recebida' : 'Localização ainda não disponível')}
        </p>
      </div>

      {routePoints.length === 2 ? (
        <svg className="absolute inset-0 z-10 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1={`${routePoints[0].x}%`}
            y1={`${routePoints[0].y}%`}
            x2={`${routePoints[1].x}%`}
            y2={`${routePoints[1].y}%`}
            stroke="#FFA500"
            strokeWidth="4"
            strokeDasharray="10 8"
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      {projected.map((marker) => <MapMarker key={marker.id} marker={marker} />)}

      {!markers.length ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center pt-10 text-[#073B5D]/60 dark:text-white/60">
          <div className="flex flex-col items-center gap-2 text-center">
            <LocateFixed className="size-7" />
            <p className="max-w-44 text-xs font-semibold">Ative o GPS para posicionar o atendimento.</p>
          </div>
        </div>
      ) : null}

      {(typeof etaMin === 'number' || typeof distanceKm === 'number') ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex gap-2">
          {typeof etaMin === 'number' ? <MapMetric label="Previsão" value={`${etaMin} min`} /> : null}
          {typeof distanceKm === 'number' ? <MapMetric label="Distância" value={`${distanceKm.toFixed(1)} km`} /> : null}
        </div>
      ) : (
        <div className="absolute bottom-3 right-3 z-20 rounded-lg bg-white/85 px-2.5 py-1.5 text-[10px] font-bold text-[#073B5D] shadow-sm backdrop-blur dark:bg-black/50 dark:text-white">
          Dados do atendimento em tempo real
        </div>
      )}
    </section>
  )
}

function MapMarker({ marker }: { marker: Marker & { x: number; y: number } }) {
  const markerStyle = { left: `${marker.x}%`, top: `${marker.y}%` }

  if (marker.kind === 'provider') {
    return (
      <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={markerStyle}>
        <span className="absolute -inset-2 rounded-full bg-[#FFA500]/20" />
        <span className="relative flex size-11 items-center justify-center rounded-full border-4 border-white bg-[#FFA500] text-black shadow-lg dark:border-[#1F2933]" title={marker.label}>
          <Truck className="size-5" />
        </span>
      </div>
    )
  }

  if (marker.kind === 'destination') {
    return (
      <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={markerStyle}>
        <span className="flex size-9 items-center justify-center rounded-full border-4 border-white bg-[#073B5D] text-white shadow-lg dark:border-[#1F2933]" title={marker.label}>
          <Navigation className="size-4" />
        </span>
      </div>
    )
  }

  return (
    <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={markerStyle}>
      <span className="absolute -inset-2 rounded-full bg-[#00BFFF]/20" />
      <span className="relative flex size-10 items-center justify-center rounded-full border-4 border-white bg-[#00BFFF] text-black shadow-lg dark:border-[#1F2933]" title={marker.label}>
        {marker.kind === 'user' ? <LocateFixed className="size-4" /> : <MapPin className="size-4" />}
      </span>
    </div>
  )
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/60 bg-white/92 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/60">
      <p className="text-[10px] font-bold uppercase text-[#073B5D]/65 dark:text-white/60">{label}</p>
      <p className="truncate text-sm font-extrabold text-[#073B5D] dark:text-white">{value}</p>
    </div>
  )
}

function samePoint(a?: LatLng | null, b?: LatLng | null) {
  if (!a || !b) return false
  return a.lat === b.lat && a.lng === b.lng
}

function projectMarkers(markers: Marker[]) {
  if (!markers.length) return []
  const lats = markers.map((marker) => marker.point.lat)
  const lngs = markers.map((marker) => marker.point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latSpan = Math.max(maxLat - minLat, 0.001)
  const lngSpan = Math.max(maxLng - minLng, 0.001)

  return markers.map((marker) => ({
    ...marker,
    x: markers.length === 1 ? 50 : 14 + ((marker.point.lng - minLng) / lngSpan) * 72,
    y: markers.length === 1 ? 52 : 20 + (1 - (marker.point.lat - minLat) / latSpan) * 58,
  }))
}
