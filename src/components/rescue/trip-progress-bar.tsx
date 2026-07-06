'use client'

import { useEffect, useState } from 'react'
import { Navigation, MapPin, Flag, Truck } from 'lucide-react'
import type { LatLng, ProviderState } from '@/lib/rescue-types'

const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Live trip progress bar that shows the provider moving from start to target.
 * Updates every second based on elapsed time vs estimated total.
 */
export function calculateTripProgress(provider: ProviderState, nowMs: number = Date.now()) {
  if (!provider.tripStartedAt || !provider.tripStartPos || !provider.tripTarget || !provider.tripTotalKm) {
    return { progress: 0, etaSec: 0, remainingKm: 0 }
  }

  const remainingKm = Math.max(0, haversineKm(provider.position, provider.tripTarget))
  const totalKm = provider.tripTotalKm || haversineKm(provider.tripStartPos, provider.tripTarget)
  const traveledKm = Math.max(0, totalKm - remainingKm)
  const rawProgress = totalKm > 0 ? (traveledKm / totalKm) * 100 : 0
  const progress = remainingKm > 0.01 ? Math.max(0, Math.min(99, rawProgress)) : 100
  const speedKmPerSec = 0.18
  const etaByDistance = remainingKm / speedKmPerSec
  const elapsed = Math.max(0, (nowMs - provider.tripStartedAt) / 1000)
  const totalSec = totalKm / speedKmPerSec
  const etaByElapsed = Math.max(0, totalSec - elapsed)

  return {
    progress,
    etaSec: Math.max(0, Math.round(Math.min(etaByDistance, etaByElapsed || etaByDistance))),
    remainingKm,
  }
}

export function TripProgressBar({
  provider,
  label,
  variant = 'client',
}: {
  provider: ProviderState
  label?: string
  variant?: 'client' | 'provider'
}) {
  const [progress, setProgress] = useState(0)
  const [etaSec, setEtaSec] = useState(0)

  useEffect(() => {
    if (!provider.tripStartedAt || !provider.tripStartPos || !provider.tripTarget || !provider.tripTotalKm) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0)
      setEtaSec(0)
      return
    }

    const tick = () => {
      const next = calculateTripProgress(provider)
      setProgress(next.progress)
      setEtaSec(next.etaSec)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [provider.tripStartedAt, provider.tripStartPos, provider.tripTarget, provider.tripTotalKm, provider.position])

  const isActive = provider.tripStartedAt && provider.tripTarget
  if (!isActive) return null

  const remainingKm = calculateTripProgress(provider).remainingKm

  const etaMin = Math.max(0, Math.ceil(etaSec / 60))
  const etaSecRemain = etaSec % 60
  const accent = variant === 'client' ? 'sky' : 'orange'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Navigation className={`h-3.5 w-3.5 text-${accent}-400`} />
          {label || 'Trajeto em andamento'}
        </span>
        <span className="text-[11px] font-bold text-slate-300">
          {progress < 100 ? (
            <>ETA {etaMin}:{String(etaSecRemain).padStart(2, '0')}</>
          ) : (
            'Chegou!'
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-linear ${
            accent === 'sky'
              ? 'from-sky-500 to-sky-400'
              : 'from-orange-500 to-orange-400'
          }`}
          style={{ width: `${progress}%` }}
        >
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        </div>
        {/* Moving truck icon */}
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-linear"
          style={{ left: `calc(${progress}% - 8px)` }}
        >
          <div className={`flex h-4 w-4 items-center justify-center rounded-full bg-${accent}-400 text-slate-950 shadow-lg`}>
            <Truck className="h-2.5 w-2.5" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <MapPin className="h-2.5 w-2.5 text-sky-400" />
          {remainingKm.toFixed(2)} km restantes
        </span>
        <span className="flex items-center gap-1">
          <Flag className="h-2.5 w-2.5 text-sky-400" />
          {Math.round(progress)}% concluído
        </span>
      </div>
    </div>
  )
}
