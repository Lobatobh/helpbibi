'use client'

import { useState, useEffect } from 'react'
import {
  Truck,
  Star,
  Power,
  MapPin,
  Navigation,
  Flag,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  Wallet,
  TrendingUp,
  Battery,
  Fuel,
  Key,
  Wrench,
  CircleDot,
  Phone,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useProviderSocket } from '@/hooks/use-rescue-socket'
import { STATUS_LABELS } from '@/lib/rescue-types'
import { RescueMap } from './rescue-map'

const ICONS: Record<string, any> = {
  'tow-truck': Truck,
  tire: CircleDot,
  battery: Battery,
  fuel: Fuel,
  key: Key,
  wrench: Wrench,
}

export function ProviderPanel() {
  const {
    connected,
    registered,
    state,
    offer,
    currentService,
    register,
    toggleOnline,
    accept,
    reject,
    arrived,
    start,
    complete,
  } = useProviderSocket()

  const [name, setName] = useState('')
  const [vehicle, setVehicle] = useState('Guincho Plataforma')
  const [plate, setPlate] = useState('')

  const handleRegister = () => {
    if (!name.trim() || !plate.trim()) return
    register({ name: name.trim(), vehicle, plate: plate.trim().toUpperCase() })
  }

  if (!registered) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <Truck className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Sou Prestador</h3>
          <p className="mt-1 text-sm text-slate-400">
            Cadastre-se para receber chamadas próximas e começar a ganhar.
          </p>
        </div>
        <div className="w-full space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome ou empresa"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
          />
          <Input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="Veículo / equipamento"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
          />
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Placa (EX: ABC1D23)"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 uppercase"
          />
          <Button
            onClick={handleRegister}
            disabled={!name.trim() || !plate.trim() || !connected}
            className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          >
            Entrar como prestador
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {connected ? 'Conectado ao serviço' : 'Conectando...'}
        </p>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">SocorroJá · Prestador</p>
            <p className="text-[11px] text-slate-400">{state?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{online ? 'Online' : 'Offline'}</span>
          <Switch
            checked={online}
            onCheckedChange={(v) => toggleOnline(v)}
            disabled={busy}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2 border-b border-slate-800 px-4 py-3">
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <Wallet className="mx-auto mb-0.5 h-3.5 w-3.5 text-amber-400" />
          <p className="text-[10px] uppercase text-slate-500">Hoje</p>
          <p className="text-xs font-bold text-white">R$ {todayEarnings(state)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <TrendingUp className="mx-auto mb-0.5 h-3.5 w-3.5 text-emerald-400" />
          <p className="text-[10px] uppercase text-slate-500">Serviços</p>
          <p className="text-xs font-bold text-white">{servicesCount(state)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2 text-center">
          <Star className="mx-auto mb-0.5 h-3.5 w-3.5 text-amber-400" />
          <p className="text-[10px] uppercase text-slate-500">Nota</p>
          <p className="text-xs font-bold text-white">{state?.rating.toFixed(1) ?? '—'}</p>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[38%] min-h-[160px] p-3">
        <RescueMap
          providerState={state}
          pickup={svc?.pickup}
          destination={svc?.destination}
          height="h-full"
          showRoute={!!svc && (svc.status === 'arrived' || svc.status === 'in_progress')}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Offer modal-like card */}
        {offer && offer.status === 'offered' && (
          <OfferCard offer={offer} onAccept={() => accept(offer.id)} onReject={() => reject(offer.id)} />
        )}

        {/* No offer, no active service */}
        {!offer && !svc && (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 ${
                online
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <Power className={`h-4 w-4 ${online ? 'text-emerald-400' : 'text-slate-500'}`} />
                <p className="text-sm font-bold text-white">
                  {online ? 'Disponível para chamadas' : 'Você está offline'}
                </p>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {online
                  ? 'Aguarde — assim que um cliente solicitar socorro próximo, você receberá a chamada.'
                  : 'Ative o switch no topo para começar a receber chamadas.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Resumo do dia
              </p>
              <div className="space-y-2 text-xs">
                <Row label="Serviços concluídos" value={`${servicesCount(state)}`} />
                <Row label="Distância percorrida" value={`${(servicesCount(state) * 8.4).toFixed(1)} km`} />
                <Row label="Tempo online" value="3h 42min" />
                <Row label="Taxa de aceite" value="92%" />
              </div>
            </div>
          </div>
        )}

        {/* Active service tracker (provider side) */}
        {svc && (
          <ProviderServiceCard
            svc={svc}
            onArrived={() => arrived(svc.id)}
            onStart={() => start(svc.id)}
            onComplete={() => complete(svc.id)}
          />
        )}
      </div>
    </div>
  )
}

function OfferCard({
  offer,
  onAccept,
  onReject,
}: {
  offer: any
  onAccept: () => void
  onReject: () => void
}) {
  const [seconds, setSeconds] = useState(12)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  const Icon = ICONS[offer.icon] || CircleDot
  const pct = (seconds / 12) * 100

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-amber-500/10">
        {/* countdown bar */}
        <div className="h-1.5 w-full bg-slate-800">
          <div
            className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Badge className="bg-amber-500 text-slate-950 hover:bg-amber-500">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Nova chamada
            </Badge>
            <span className={`text-sm font-bold ${seconds <= 4 ? 'text-rose-400' : 'text-amber-400'}`}>
              {seconds}s
            </span>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{offer.typeLabel}</p>
              <p className="text-xs text-slate-400">{offer.clientName}</p>
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
            <Button
              onClick={onReject}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <X className="mr-1 h-4 w-4" /> Recusar
            </Button>
            <Button
              onClick={onAccept}
              className="flex-[2] bg-emerald-500 py-5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aceitar (R$ {offer.price})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderServiceCard({
  svc,
  onArrived,
  onStart,
  onComplete,
}: {
  svc: any
  onArrived: () => void
  onStart: () => void
  onComplete: () => void
}) {
  const status = svc.status
  const statusMeta = STATUS_LABELS[status as keyof typeof STATUS_LABELS]

  const cta =
    status === 'accepted' || status === 'arriving'
      ? { label: 'Cheguei ao local', onClick: onArrived, icon: MapPin }
      : status === 'arrived'
        ? { label: 'Iniciar serviço', onClick: onStart, icon: Navigation }
        : status === 'in_progress'
          ? { label: 'Concluir serviço', onClick: onComplete, icon: CheckCircle2 }
          : null

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border p-3 ${
          status === 'completed'
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : status === 'cancelled' || status === 'expired'
              ? 'border-rose-500/40 bg-rose-500/10'
              : 'border-sky-500/40 bg-sky-500/10'
        }`}
      >
        <div className="flex items-center gap-2">
          {status !== 'completed' && status !== 'cancelled' && status !== 'expired' && (
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
          )}
          {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          <p className="text-sm font-bold text-white">{statusMeta.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {svc.typeLabel} · #{svc.id.slice(-6).toUpperCase()}
        </p>
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
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 border-slate-700 bg-slate-800 text-emerald-400 hover:bg-slate-700"
            >
              <Phone className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 border-slate-700 bg-slate-800 text-sky-400 hover:bg-slate-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
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
      </div>

      {/* CTA */}
      {cta && (
        <Button
          onClick={cta.onClick}
          className="w-full bg-emerald-500 py-5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
        >
          <cta.icon className="mr-2 h-4 w-4" />
          {cta.label}
        </Button>
      )}

      {/* timeline */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Andamento
        </p>
        <div className="max-h-32 space-y-1.5 overflow-y-auto pr-2">
          {svc.timeline.map((ev: any, i: number) => (
            <div key={i} className="flex gap-2 text-xs">
              <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
              <div className="flex-1">
                <p className="text-slate-300">{ev.label}</p>
                <p className="text-[10px] text-slate-600">
                  {new Date(ev.at).toLocaleTimeString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}

// demo helpers — derive pseudo numbers from provider state
function todayEarnings(state: any) {
  if (!state) return '0,00'
  const n = servicesCount(state)
  return (n * 142).toFixed(2).replace('.', ',')
}
function servicesCount(state: any) {
  if (!state) return 0
  // derive a stable-ish number from id
  const hash = state.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
  return hash % 6
}
