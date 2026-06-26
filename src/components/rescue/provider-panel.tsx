'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Truck, Star, Power, MapPin, Navigation, Flag, Clock, CheckCircle2, X, Loader2,
  Wallet, TrendingUp, Battery, Fuel, Key, Wrench, CircleDot, Phone, MessageCircle,
  History, Home, BarChart3, Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell,
} from 'recharts'
import { useProviderSocket } from '@/hooks/use-rescue-socket'
import { PAYMENT_METHODS, STATUS_LABELS, type ServiceData, type ServiceRecord } from '@/lib/rescue-types'
import { getHistoryForRole, addRecord, recordFromService } from '@/lib/rescue-history'
import { RescueMap } from './rescue-map'

const ICONS: Record<string, any> = {
  'tow-truck': Truck, tire: CircleDot, battery: Battery, fuel: Fuel, key: Key, wrench: Wrench,
}
const PAY_ICONS: Record<string, any> = { zap: Power, 'credit-card': Wallet, wallet: Wallet }

export function ProviderPanel() {
  const {
    connected, registered, state, offer, currentService,
    register, toggleOnline, accept, reject, arrived, start, complete, clearCurrent,
  } = useProviderSocket()

  const [name, setName] = useState('')
  const [vehicle, setVehicle] = useState('Guincho Plataforma')
  const [plate, setPlate] = useState('')
  const [view, setView] = useState<'home' | 'stats' | 'history'>('home')
  const [history, setHistory] = useState<ServiceRecord[]>(() =>
    typeof window !== 'undefined' ? getHistoryForRole('provider') : []
  )
  const recordedRef = useRef<Set<string>>(new Set())

  const refreshHistory = () => setHistory(getHistoryForRole('provider'))

  useEffect(() => {
    if (!currentService) return
    const s = currentService
    if (s.status !== 'completed' && s.status !== 'cancelled' && s.status !== 'expired') return
    if (recordedRef.current.has(s.id)) return
    recordedRef.current.add(s.id)
    const rec = recordFromService(s, 'provider')
    if (rec) {
      addRecord(rec)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory((prev) => (prev.some((r) => r.id === rec.id) ? prev : [rec, ...prev]))
    }
  }, [currentService?.status, currentService?.id])

  const handleRegister = () => {
    if (!name.trim() || !plate.trim()) return
    register({ name: name.trim(), vehicle, plate: plate.trim().toUpperCase() })
  }

  if (!registered) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="relative">
          <div className="absolute -inset-3 animate-pulse rounded-3xl bg-emerald-500/20 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/30">
            <Truck className="h-8 w-8" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Sou Prestador</h3>
          <p className="mt-1 text-sm text-slate-400">
            Cadastre-se para receber chamadas próximas e começar a ganhar.
          </p>
        </div>
        <div className="w-full space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome ou empresa" className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" />
          <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Veículo / equipamento" className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" />
          <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Placa (EX: ABC1D23)" className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 uppercase" />
          <Button onClick={handleRegister} disabled={!name.trim() || !plate.trim() || !connected} className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">
            Entrar como prestador
          </Button>
        </div>
        <p className="text-xs text-slate-500">{connected ? '✓ Conectado ao serviço' : 'Conectando...'}</p>
      </div>
    )
  }

  const svc = currentService
  const online = state?.online ?? true
  const busy = !!state?.currentServiceId

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 shadow-md shadow-emerald-500/20">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">SocorroJá · Prestador</p>
            <p className="text-[11px] text-slate-400">{state?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${online ? 'text-emerald-400' : 'text-slate-500'}`}>{online ? 'Online' : 'Offline'}</span>
          <Switch checked={online} onCheckedChange={(v) => toggleOnline(v)} disabled={busy} />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2 border-b border-slate-800 px-4 py-3">
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <Wallet className="mx-auto mb-0.5 h-3.5 w-3.5 text-amber-400" />
          <p className="text-[10px] uppercase text-slate-500">Hoje</p>
          <p className="text-xs font-bold text-white">R$ {state?.earningsToday ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <TrendingUp className="mx-auto mb-0.5 h-3.5 w-3.5 text-emerald-400" />
          <p className="text-[10px] uppercase text-slate-500">Serviços</p>
          <p className="text-xs font-bold text-white">{state?.completedCount ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <Star className="mx-auto mb-0.5 h-3.5 w-3.5 text-amber-400" />
          <p className="text-[10px] uppercase text-slate-500">Nota</p>
          <p className="text-xs font-bold text-white">{state?.rating.toFixed(1) ?? '—'}</p>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[32%] min-h-[150px] p-3">
        <RescueMap
          providerState={state}
          pickup={svc?.pickup}
          destination={svc?.destination}
          height="h-full"
          showRoute={!!svc && (svc.status === 'arrived' || svc.status === 'in_progress')}
        />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-slate-800 px-3 pt-1">
        <TabBtn active={view === 'home'} onClick={() => setView('home')} icon={Home} label="Chamadas" />
        <TabBtn active={view === 'stats'} onClick={() => setView('stats')} icon={BarChart3} label="Ganhos" />
        <TabBtn active={view === 'history'} onClick={() => { setView('history'); refreshHistory() }} icon={History} label="Histórico" badge={history.length} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'home' && (
          <>
            {offer && offer.status === 'offered' && (
              <OfferCard offer={offer} onAccept={() => accept(offer.id)} onReject={() => reject(offer.id)} />
            )}
            {!offer && !svc && (
              <div className="space-y-4">
                <div className={`rounded-xl border p-4 ${online ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/60'}`}>
                  <div className="flex items-center gap-2">
                    <Power className={`h-4 w-4 ${online ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <p className="text-sm font-bold text-white">{online ? 'Disponível para chamadas' : 'Você está offline'}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {online ? 'Aguarde — assim que um cliente solicitar socorro próximo, você receberá a chamada.' : 'Ative o switch no topo para começar a receber chamadas.'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <Row label="Serviços concluídos" value={`${state?.completedCount ?? 0}`} />
                    <Row label="Ganhos de hoje" value={`R$ ${state?.earningsToday ?? 0}`} highlight />
                    <Row label="Nota média" value={`${state?.rating.toFixed(1) ?? '—'} ★`} />
                    <Row label="Status" value={online ? 'Online' : 'Offline'} />
                  </div>
                </div>
              </div>
            )}
            {svc && (
              <ProviderServiceCard
                svc={svc}
                onArrived={() => arrived(svc.id)}
                onStart={() => start(svc.id)}
                onComplete={() => complete(svc.id)}
                onDismiss={clearCurrent}
              />
            )}
          </>
        )}

        {view === 'stats' && (
          <EarningsView history={history} earningsToday={state?.earningsToday ?? 0} completedCount={state?.completedCount ?? 0} rating={state?.rating ?? 0} />
        )}

        {view === 'history' && (
          <HistoryView history={history} />
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: any; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${
        active ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge ? <span className="ml-0.5 rounded-full bg-slate-700 px-1.5 text-[10px] text-white">{badge}</span> : null}
    </button>
  )
}

function OfferCard({ offer, onAccept, onReject }: { offer: ServiceData; onAccept: () => void; onReject: () => void }) {
  const [seconds, setSeconds] = useState(12)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  const Icon = ICONS[offer.icon] || CircleDot
  const PayIcon = PAY_ICONS[PAYMENT_METHODS.find((m) => m.id === offer.paymentMethod)?.icon || 'zap']
  const pct = (seconds / 12) * 100

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-amber-500/10">
        <div className="h-1.5 w-full bg-slate-800">
          <div className="h-full bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Badge className="bg-amber-500 text-slate-950 hover:bg-amber-500">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Nova chamada
            </Badge>
            <span className={`text-sm font-bold ${seconds <= 4 ? 'text-rose-400' : 'text-amber-400'}`}>{seconds}s</span>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{offer.typeLabel}</p>
              <p className="text-xs text-slate-400">{offer.clientName}</p>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] text-slate-300">
              <PayIcon className="h-3 w-3 text-amber-400" />
              {PAYMENT_METHODS.find((m) => m.id === offer.paymentMethod)?.label}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Valor</p>
              <p className="text-base font-extrabold text-amber-400">R$ {offer.price}</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Distância</p>
              <p className="text-sm font-bold text-white">{offer.distanceKm} km</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">ETA</p>
              <p className="text-sm font-bold text-white">{offer.etaMin} min</p>
            </div>
          </div>

          <div className="mb-3 space-y-1.5 rounded-lg bg-slate-800/40 p-2.5 text-xs">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
              <span className="text-slate-300">{offer.pickupLabel}</span>
            </div>
            <div className="flex items-start gap-2">
              <Flag className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" />
              <span className="text-slate-300">{offer.destinationLabel}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={onReject} variant="outline" className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
              <X className="mr-1 h-4 w-4" /> Recusar
            </Button>
            <Button onClick={onAccept} className="flex-[2] bg-emerald-500 py-5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aceitar (R$ {offer.price})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderServiceCard({ svc, onArrived, onStart, onComplete, onDismiss }: {
  svc: ServiceData; onArrived: () => void; onStart: () => void; onComplete: () => void; onDismiss: () => void
}) {
  const status = svc.status
  const statusMeta = STATUS_LABELS[status]
  const PayIcon = PAY_ICONS[PAYMENT_METHODS.find((m) => m.id === svc.paymentMethod)?.icon || 'zap']

  const cta = status === 'accepted' || status === 'arriving'
    ? { label: 'Cheguei ao local', onClick: onArrived, icon: MapPin }
    : status === 'arrived'
      ? { label: 'Iniciar serviço', onClick: onStart, icon: Navigation }
      : status === 'in_progress'
        ? { label: 'Concluir serviço', onClick: onComplete, icon: CheckCircle2 }
        : null

  const isFinal = status === 'completed' || status === 'cancelled' || status === 'expired'

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-3 ${
        status === 'completed' ? 'border-emerald-500/40 bg-emerald-500/10'
        : status === 'cancelled' || status === 'expired' ? 'border-rose-500/40 bg-rose-500/10'
        : 'border-sky-500/40 bg-sky-500/10'
      }`}>
        <div className="flex items-center gap-2">
          {!isFinal && <Loader2 className="h-4 w-4 animate-spin text-sky-400" />}
          {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          <p className="text-sm font-bold text-white">{statusMeta.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">{svc.typeLabel} · #{svc.id.slice(-6).toUpperCase()}</p>
      </div>

      {/* client card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 bg-gradient-to-br from-rose-500 to-rose-700">
            <AvatarFallback className="bg-transparent text-sm font-bold text-white">
              {svc.clientName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">{svc.clientName}</p>
            <p className="text-xs text-slate-400">Cliente</p>
          </div>
          {!isFinal && (
            <div className="flex gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7 border-slate-700 bg-slate-800 text-emerald-400 hover:bg-slate-700">
                <Phone className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7 border-slate-700 bg-slate-800 text-sky-400 hover:bg-slate-700">
                <MessageCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {svc.description && (
          <div className="mt-2 rounded-lg bg-slate-800/40 p-2 text-xs text-slate-300">
            <p className="text-[10px] uppercase text-slate-500">Descrição do problema</p>
            <p className="mt-0.5">{svc.description}</p>
          </div>
        )}
      </div>

      {/* route */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div className="my-1 w-0.5 flex-1 bg-slate-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Buscar em</p>
              <p className="text-xs font-medium text-white">{svc.pickupLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Levar até</p>
              <p className="text-xs font-medium text-white">{svc.destinationLabel}</p>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2 text-center">
          <div>
            <p className="text-[10px] uppercase text-slate-500">Distância</p>
            <p className="text-xs font-bold text-white">{svc.distanceKm} km</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500">ETA</p>
            <p className="text-xs font-bold text-white">{svc.etaMin} min</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500">Você recebe</p>
            <p className="text-xs font-bold text-amber-400">R$ {svc.price}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
          <PayIcon className="h-3 w-3 text-amber-400" />
          Pagamento: {PAYMENT_METHODS.find((m) => m.id === svc.paymentMethod)?.label}
        </div>
      </div>

      {/* rating received */}
      {svc.rating && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-bold text-white">Avaliação recebida</p>
          <div className="mt-1 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < svc.rating!.stars ? 'text-amber-400' : 'text-slate-700'}`} fill="currentColor" />
            ))}
            <span className="ml-1 text-xs font-bold text-amber-400">{svc.rating.stars}.0</span>
          </div>
          {svc.rating.comment && <p className="mt-1 text-xs italic text-slate-300">"{svc.rating.comment}"</p>}
        </div>
      )}

      {/* CTA */}
      {cta && (
        <Button onClick={cta.onClick} className="w-full bg-emerald-500 py-5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
          <cta.icon className="mr-2 h-4 w-4" /> {cta.label}
        </Button>
      )}

      {/* timeline */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Andamento</p>
        <div className="max-h-28 space-y-1.5 overflow-y-auto pr-2">
          {svc.timeline.slice().reverse().map((ev, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
              <div className="flex-1">
                <p className="text-slate-300">{ev.label}</p>
                <p className="text-[10px] text-slate-600">{new Date(ev.at).toLocaleTimeString('pt-BR')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isFinal && (
        <Button onClick={onDismiss} variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">
          Voltar ao início
        </Button>
      )}
    </div>
  )
}

function EarningsView({ history, earningsToday, completedCount, rating }: {
  history: ServiceRecord[]; earningsToday: number; completedCount: number; rating: number
}) {
  // build chart data: last 7 "sessions" (use history + current session)
  const chartData = useMemo(() => {
    const completed = history.filter((h) => h.status === 'completed')
    const byDay: Record<string, { day: string; total: number; count: number }> = {}
    completed.forEach((r) => {
      const d = new Date(r.completedAt)
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byDay[key]) byDay[key] = { day: key, total: 0, count: 0 }
      byDay[key].total += r.price
      byDay[key].count += 1
    })
    const days = Object.values(byDay)
    if (days.length === 0) {
      return [{ day: 'Hoje', total: earningsToday, count: completedCount }]
    }
    return days.slice(-7)
  }, [history, earningsToday, completedCount])

  const avgTicket = completedCount > 0 ? Math.round(earningsToday / Math.max(completedCount, 1)) : 0
  const maxTotal = Math.max(...chartData.map((d) => d.total), 1)

  return (
    <div className="space-y-4">
      {/* Big earnings card */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Ganhos de hoje</p>
            <p className="mt-1 text-3xl font-extrabold text-white">R$ {earningsToday}</p>
            <p className="mt-1 text-xs text-slate-400">{completedCount} serviço(s) concluído(s)</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Wallet className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ganhos por dia</p>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(16,185,129,0.08)' }}
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: any) => [`R$ ${v}`, 'Ganhos']}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === chartData.length - 1 ? '#10b981' : '#334155'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[10px] uppercase text-slate-500">Ticket médio</p>
          <p className="text-lg font-bold text-amber-400">R$ {avgTicket}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[10px] uppercase text-slate-500">Nota média</p>
          <p className="text-lg font-bold text-amber-400">{rating.toFixed(1)} ★</p>
        </div>
      </div>

      {/* Service type breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Por tipo de serviço</p>
        <ServiceTypeBreakdown history={history} />
      </div>
    </div>
  )
}

function ServiceTypeBreakdown({ history }: { history: ServiceRecord[] }) {
  const byType: Record<string, { label: string; count: number; total: number }> = {}
  history.filter((h) => h.status === 'completed').forEach((r) => {
    if (!byType[r.type]) byType[r.type] = { label: r.typeLabel, count: 0, total: 0 }
    byType[r.type].count += 1
    byType[r.type].total += r.price
  })
  const items = Object.values(byType).sort((a, b) => b.total - a.total)
  if (items.length === 0) {
    return <p className="text-center text-xs text-slate-500">Conclua serviços para ver o detalhamento.</p>
  }
  const maxTotal = Math.max(...items.map((i) => i.total), 1)
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">{it.label}</span>
            <span className="font-bold text-amber-400">R$ {it.total} <span className="text-slate-500">· {it.count}x</span></span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${(it.total / maxTotal) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryView({ history }: { history: ServiceRecord[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">Nenhum serviço no histórico</p>
        <p className="mt-1 text-xs text-slate-500">Aceite uma chamada para começar a ganhar.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{history.length} serviço(s)</p>
      {history.map((r) => {
        const Icon = ICONS[r.icon] || CircleDot
        const PayIcon = PAY_ICONS[PAYMENT_METHODS.find((m) => m.id === r.paymentMethod)?.icon || 'zap']
        return (
          <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{r.typeLabel}</p>
                  <p className="text-[10px] text-slate-500">Cliente: {r.counterpartName}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-400">+R$ {r.price}</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {r.pickupLabel.split(',')[0]}</span>
              <span className="flex items-center gap-0.5"><PayIcon className="h-3 w-3" /> {PAYMENT_METHODS.find((m) => m.id === r.paymentMethod)?.label}</span>
              <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {new Date(r.completedAt).toLocaleDateString('pt-BR')}</span>
            </div>
            {r.rating && (
              <div className="mt-2 flex items-center gap-1 border-t border-slate-800 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < r.rating!.stars ? 'text-amber-400' : 'text-slate-700'}`} fill="currentColor" />
                ))}
                {r.rating.comment && <span className="ml-1 text-[10px] italic text-slate-400">"{r.rating.comment}"</span>}
              </div>
            )}
            {r.status === 'cancelled' && <Badge variant="outline" className="mt-2 border-rose-500/40 text-rose-400">Cancelado</Badge>}
          </div>
        )
      })}
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-amber-400' : 'text-white'}`}>{value}</span>
    </div>
  )
}
