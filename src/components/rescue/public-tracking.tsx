'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { io, Socket } from 'socket.io-client'
import {
  Truck, MapPin, Flag, Clock, Star, Navigation, CheckCircle2, Loader2,
  AlertTriangle, Battery, Fuel, Key, Wrench, CircleDot, Shield, ArrowLeft,
} from 'lucide-react'
import { LiveCountdown } from './live-countdown'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  searching: { label: 'Procurando prestador', color: 'sky' },
  offered: { label: 'Chamada enviada', color: 'sky' },
  accepted: { label: 'Prestador a caminho', color: 'orange' },
  arriving: { label: 'Chegando no local', color: 'orange' },
  arrived: { label: 'No local do atendimento', color: 'orange' },
  in_progress: { label: 'Serviço em andamento', color: 'sky' },
  completed: { label: 'Concluído', color: 'orange' },
  cancelled: { label: 'Cancelado', color: 'rose' },
  expired: { label: 'Encerrado', color: 'rose' },
}

type PublicService = {
  available: boolean
  message?: string
  serviceId?: string
  status?: string
  type?: string
  typeLabel?: string
  icon?: string
  pickupLabel?: string
  destinationLabel?: string
  distanceKm?: number
  etaMin?: number
  createdAt?: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline?: Array<{ status: string; label: string; at: number }>
  provider?: { name: string; vehicle: string; rating: number } | null
  providerPosition?: { lat: number; lng: number } | null
  pickup?: { lat: number; lng: number }
  destination?: { lat: number; lng: number }
  tripProgress?: {
    startPos: { lat: number; lng: number } | null
    target: { lat: number; lng: number } | null
    startedAt: number | null
    totalKm: number
  } | null
}

const SOCKET_URL = '/?XTransformPort=3003'

export function PublicTracking({ serviceId }: { serviceId: string }) {
  const [data, setData] = useState<PublicService | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchTracking = async () => {
      let found = false

      // Primary: API route (database-persisted)
      try {
        const res = await fetch(`/api/track/${serviceId}`)
        if (res.ok) {
          const d = (await res.json()) as PublicService
          if (d.available) {
            if (!cancelled) {
              setData(d)
              setLoading(false)
              found = true
              if (d.status && ['completed', 'cancelled', 'expired'].includes(d.status)) {
                if (timerRef.current) clearInterval(timerRef.current)
              }
            }
            return
          }
        }
      } catch {
        // Fall through to socket fallback
      }

      if (found) return

      // Fallback: socket.io (in-memory, for services not yet in DB)
      // Only try socket once per fetch — don't create multiple connections
      await new Promise<void>((resolve) => {
        try {
          const s = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            forceNew: true,
            reconnection: false,
            timeout: 4000,
          })
          let resolved = false

          s.on('connect', () => s.emit('public:track', { serviceId }))
          s.on('public:track-result', (result: PublicService) => {
            if (!resolved && !cancelled) {
              resolved = true
              if (result.available) {
                setData(result)
                found = true
              }
              setLoading(false)
              s.disconnect()
              resolve()
            }
          })
          s.on('connect_error', () => {
            if (!resolved) {
              resolved = true
              s.disconnect()
              resolve()
            }
          })
          // Timeout
          setTimeout(() => {
            if (!resolved) {
              resolved = true
              s.disconnect()
              resolve()
            }
          }, 4000)
        } catch {
          resolve()
        }
      })

      // If neither API nor socket found the service, show unavailable
      if (!found && !cancelled) {
        setData({ available: false, message: 'Rastreamento indisponível ou encerrado.' })
        setLoading(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }

    fetchTracking()
    timerRef.current = setInterval(fetchTracking, 3000)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [serviceId])

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header with logo */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src="/logo-help-bibi.png" alt="Help Bibi" className="h-9 w-auto rounded-md" />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight">Help Bibi</p>
              <p className="text-[10px] text-slate-400">rastreamento público</p>
            </div>
          </div>
          <a
            href="/"
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
            <p className="text-sm text-slate-400">Carregando rastreamento...</p>
          </div>
        )}

        {data && !data.available && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center"
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
              <MapPin className="h-7 w-7 text-slate-500" />
            </div>
            <p className="text-base font-bold text-white">Rastreamento indisponível ou encerrado</p>
            <p className="mt-1 text-sm text-slate-400">
              {data.message || 'Este link pode ter expirado ou o serviço não existe mais.'}
            </p>
            <a
              href="/"
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400"
            >
              <Shield className="h-4 w-4" /> Conhecer a Help Bibi
            </a>
          </motion.div>
        )}

        {data && data.available && data.status && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Status banner */}
            {(() => {
              const info = STATUS_INFO[data.status] || { label: data.status, color: 'slate' }
              const isLive = !['completed', 'cancelled', 'expired'].includes(data.status)
              return (
                <div className={`rounded-2xl border p-4 ${
                  data.status === 'completed' ? 'border-orange-500/40 bg-orange-500/10'
                  : data.status === 'cancelled' || data.status === 'expired' ? 'border-rose-500/40 bg-rose-500/10'
                  : 'border-sky-500/40 bg-sky-500/10'
                }`}>
                  <div className="flex items-center gap-2">
                    {isLive && <Loader2 className="h-5 w-5 animate-spin text-sky-400" />}
                    {data.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-orange-400" />}
                    {(data.status === 'cancelled' || data.status === 'expired') && <AlertTriangle className="h-5 w-5 text-rose-400" />}
                    <p className="text-lg font-bold text-white">{info.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Serviço #{data.serviceId?.slice(-6).toUpperCase()} · {data.typeLabel}
                  </p>
                </div>
              )
            })()}

            {/* Provider card (if assigned) */}
            {data.provider && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-extrabold text-white">
                    {data.provider.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{data.provider.name}</p>
                    <p className="text-xs text-slate-400">{data.provider.vehicle}</p>
                  </div>
                  <div className="flex items-center gap-1 text-orange-400">
                    <Star className="h-4 w-4" fill="currentColor" />
                    <span className="text-sm font-bold">{data.provider.rating.toFixed(1)}</span>
                  </div>
                </div>

                {/* ETA countdown */}
                {(data.status === 'accepted' || data.status === 'arriving' || data.status === 'in_progress') && data.etaMin && (
                  <div className="mt-3 flex items-center justify-center gap-4 rounded-xl bg-slate-800/60 p-3">
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-slate-500">ETA</p>
                      <LiveCountdown seconds={data.etaMin * 60} variant="inline" />
                    </div>
                    <div className="h-8 w-px bg-slate-700" />
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-slate-500">Distância</p>
                      <p className="text-sm font-bold text-white">{data.distanceKm} km</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Route */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Trajeto</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className="h-3 w-3 rounded-full bg-sky-500" />
                  <div className="my-1 w-0.5 flex-1 bg-slate-700" />
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">Local de atendimento</p>
                    <p className="text-sm font-medium text-white">{data.pickupLabel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">Destino final</p>
                    <p className="text-sm font-medium text-white">{data.destinationLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            {data.timeline && data.timeline.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Acompanhamento</p>
                <div className="space-y-3">
                  {data.timeline.slice().reverse().map((ev, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${i === 0 ? 'bg-sky-400' : 'bg-slate-600'}`} />
                      <div className="flex-1">
                        <p className={i === 0 ? 'font-semibold text-white' : 'text-slate-300'}>{ev.label}</p>
                        <p className="text-[10px] text-slate-600">
                          {new Date(ev.at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Help Bibi branding */}
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/5 to-orange-500/5 p-4 text-center">
              <img src="/logo-help-bibi.png" alt="Help Bibi" className="mx-auto h-8 w-auto rounded-md" />
              <p className="mt-2 text-[10px] text-slate-500">
                Help Bibi — Socorro veicular em minutos, seguro, rastreável e sem burocracia.
              </p>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
