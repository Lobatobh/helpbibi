'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, MapPin, Shield, Star } from 'lucide-react'

const STATUS_INFO: Record<string, string> = {
  searching: 'Procurando prestador',
  offered: 'Chamada enviada',
  accepted: 'Prestador a caminho',
  arriving: 'Chegando no local',
  arrived: 'No local do atendimento',
  in_progress: 'Servico em andamento',
  completed: 'Servico concluido',
  cancelled: 'Solicitacao cancelada',
  failed: 'Atendimento encerrado',
  expired: 'Solicitacao encerrada',
}

type PublicService = {
  available: boolean
  message?: string
  status?: string
  typeLabel?: string
  etaMin?: number
  createdAt?: number
  acceptedAt?: number | null
  completedAt?: number | null
  canceledAt?: number | null
  timeline?: Array<{ status: string; at: number }>
  provider?: { name: string | null; vehicle: string; rating: number } | null
  providerPosition?: { lat: number; lng: number } | null
}

const terminalStatuses = new Set(['completed', 'cancelled', 'failed', 'expired'])

export function PublicTracking({ token }: { token: string }) {
  const [data, setData] = useState<PublicService | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    const stopPolling = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }

    const fetchTracking = async () => {
      try {
        const response = await fetch(`/api/tracking/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({})) as PublicService
        if (cancelled) return
        setData(response.ok ? payload : {
          available: false,
          message: payload.message || 'Rastreamento indisponivel ou encerrado.',
        })
        setLoading(false)
        if (!response.ok || (payload.status && terminalStatuses.has(payload.status))) stopPolling()
      } catch {
        if (cancelled) return
        setData({ available: false, message: 'Rastreamento indisponivel ou encerrado.' })
        setLoading(false)
        stopPolling()
      }
    }

    void fetchTracking()
    timerRef.current = setInterval(() => void fetchTracking(), 5000)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [token])

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src="/logo-help-bibi.png" alt="Help Bibi" className="h-9 w-auto rounded-md" />
            <div>
              <p className="text-sm font-extrabold">Help Bibi</p>
              <p className="text-[10px] text-slate-400">rastreamento seguro</p>
            </div>
          </div>
          <a href="/" className="flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">
            <ArrowLeft className="size-3" /> Voltar
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="size-8 animate-spin text-sky-400" />
            <p className="text-sm text-slate-400">Carregando rastreamento...</p>
          </div>
        ) : null}

        {data && !data.available ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
            <MapPin className="mx-auto size-8 text-slate-500" />
            <h1 className="mt-3 font-bold">Rastreamento indisponivel ou encerrado</h1>
            <p className="mt-2 text-sm text-slate-400">{data.message}</p>
            <a href="/" className="mt-5 inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950">
              <Shield className="size-4" /> Conhecer a Help Bibi
            </a>
          </section>
        ) : null}

        {data?.available && data.status ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-sky-800 bg-sky-950/30 p-5">
              <div className="flex items-center gap-2">
                {terminalStatuses.has(data.status)
                  ? data.status === 'completed'
                    ? <CheckCircle2 className="size-5 text-emerald-300" />
                    : <AlertTriangle className="size-5 text-amber-300" />
                  : <Loader2 className="size-5 animate-spin text-sky-300" />}
                <h1 className="text-lg font-bold">{STATUS_INFO[data.status] || data.status}</h1>
              </div>
              <p className="mt-2 text-sm text-slate-400">{data.typeLabel}</p>
            </section>

            {data.provider ? (
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm font-semibold">{data.provider.name || 'Prestador'}</p>
                <p className="mt-1 text-sm text-slate-400">{data.provider.vehicle}</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-amber-300"><Star className="size-4" /> {data.provider.rating.toFixed(1)}</p>
                {data.providerPosition ? (
                  <p className="mt-3 text-xs text-emerald-300">Posicao atual recebida recentemente.</p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Posicao nao disponivel neste estado.</p>
                )}
              </section>
            ) : null}

            {data.timeline?.length ? (
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-semibold">Andamento</h2>
                <ol className="mt-4 space-y-3">
                  {data.timeline.slice().reverse().map((event, index) => (
                    <li key={`${event.at}-${index}`} className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3 text-sm last:border-0 last:pb-0">
                      <span>{STATUS_INFO[event.status] || event.status}</span>
                      <time className="shrink-0 text-xs text-slate-500">{new Date(event.at).toLocaleString('pt-BR')}</time>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  )
}
