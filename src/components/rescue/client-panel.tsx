'use client'

import { useState } from 'react'
import {
  Shield,
  Phone,
  Star,
  MapPin,
  Navigation,
  X,
  Truck,
  Battery,
  Fuel,
  Key,
  Wrench,
  CircleDot,
  Clock,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useClientSocket } from '@/hooks/use-rescue-socket'
import { SERVICE_TYPES, STATUS_LABELS, type ServiceType, type LatLng } from '@/lib/rescue-types'
import { RescueMap } from './rescue-map'

const ICONS: Record<string, any> = {
  'tow-truck': Truck,
  tire: CircleDot,
  battery: Battery,
  fuel: Fuel,
  key: Key,
  wrench: Wrench,
}

// Preset points (lat/lng near SP center, within CITY span)
const PRESETS: { id: string; label: string; pos: LatLng }[] = [
  { id: 'paulista', label: 'Av. Paulista, 1578', pos: { lat: -23.5614, lng: -46.6559 } },
  { id: 'centro', label: 'Praça da Sé, Centro', pos: { lat: -23.5503, lng: -46.6334 } },
  { id: 'pinheiros', label: 'Rua dos Pinheiros, 100', pos: { lat: -23.5673, lng: -46.6910 } },
  { id: 'vilamariana', label: 'Vila Mariana, 220', pos: { lat: -23.5876, lng: -46.6376 } },
  { id: 'moema', label: 'Moema, Av. Ibirapuera 3100', pos: { lat: -23.6075, lng: -46.6660 } },
  { id: 'ibirapuera', label: 'Parque Ibirapuera', pos: { lat: -23.5874, lng: -46.6576 } },
]

export function ClientPanel() {
  const { connected, registered, nearby, currentService, register, requestService, cancelService } =
    useClientSocket()

  const [name, setName] = useState('')
  const [step, setStep] = useState<'idle' | 'form'>('idle')
  const [svcType, setSvcType] = useState<ServiceType>('reboque')
  const [description, setDescription] = useState('')
  const [pickupId, setPickupId] = useState('paulista')
  const [destId, setDestId] = useState('moema')

  const handleRegister = () => {
    if (!name.trim()) return
    register(name.trim())
  }

  const handleSubmit = () => {
    const pickup = PRESETS.find((p) => p.id === pickupId)!
    const dest = PRESETS.find((p) => p.id === destId)!
    requestService({
      clientName: name.trim(),
      type: svcType,
      description: description.trim() || 'Sem detalhes adicionais',
      pickup: pickup.pos,
      pickupLabel: pickup.label,
      destination: dest.pos,
      destinationLabel: dest.label,
    })
    setStep('idle')
    setDescription('')
  }

  // -------- Render states --------
  if (!registered) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
          <Shield className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Sou Cliente</h3>
          <p className="mt-1 text-sm text-slate-400">
            Informe seu nome para entrar no app e solicitar socorro.
          </p>
        </div>
        <div className="w-full space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
          />
          <Button
            onClick={handleRegister}
            disabled={!name.trim() || !connected}
            className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            Entrar como cliente
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {connected ? 'Conectado ao serviço' : 'Conectando...'}
        </p>
      </div>
    )
  }

  const svc = currentService
  const status = svc?.status

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">SocorroJá · Cliente</p>
            <p className="text-[11px] text-slate-400">Olá, {name || 'motorista'}</p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
          <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Online
        </Badge>
      </div>

      {/* Map area */}
      <div className="relative h-[42%] min-h-[180px] p-3">
        <RescueMap
          providers={nearby}
          pickup={svc?.pickup}
          destination={svc?.destination}
          clientPos={PRESETS.find((p) => p.id === pickupId)?.pos}
          providerState={svc?.provider}
          height="h-full"
        />
        <div className="absolute left-5 top-5 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
          {nearby.length} prestador(es) por perto
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {!svc && step === 'idle' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-white">Pronto para ajudar</p>
              <p className="mt-1 text-xs text-slate-400">
                Toque abaixo para solicitar um serviço. O prestador mais próximo receberá a chamada
                automaticamente.
              </p>
            </div>
            <Button
              onClick={() => setStep('form')}
              className="w-full bg-amber-500 py-6 text-base font-bold text-slate-950 hover:bg-amber-400"
            >
              <Shield className="mr-2 h-5 w-5" />
              Solicitar socorro
            </Button>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prestadores próximos
              </p>
              <div className="space-y-2">
                {nearby.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                    Aguardando prestadores entrarem no app...
                  </p>
                )}
                {nearby.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5"
                  >
                    <Avatar className="h-8 w-8 bg-slate-700">
                      <AvatarFallback className="bg-slate-700 text-xs text-white">
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-white">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.vehicle}</p>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400">
                      <Star className="h-3 w-3" fill="currentColor" />
                      <span className="text-[11px] font-semibold">{p.rating.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!svc && step === 'form' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Nova solicitação</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-slate-400 hover:text-white"
                onClick={() => setStep('idle')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase text-slate-400">
                Tipo de serviço
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_TYPES.map((s) => {
                  const Icon = ICONS[s.icon] || CircleDot
                  const active = svcType === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSvcType(s.id)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition ${
                        active
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-semibold text-white">{s.label}</span>
                      <span className="text-[10px] text-slate-500">a partir de R$ {s.base}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
                Descreva o problema
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Carro parado no acostamento, não dá partida..."
                className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
                  <MapPin className="mr-1 inline h-3 w-3 text-amber-400" />
                  Local do atendimento
                </Label>
                <select
                  value={pickupId}
                  onChange={(e) => setPickupId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
                  <Navigation className="mr-1 inline h-3 w-3 text-sky-400" />
                  Destino final (reboque)
                </Label>
                <select
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={pickupId === destId}
              className="w-full bg-amber-500 py-5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Confirmar e procurar prestador
            </Button>
            {pickupId === destId && (
              <p className="text-center text-xs text-rose-400">Local e destino não podem ser iguais</p>
            )}
          </div>
        )}

        {svc && (
          <ServiceTracker svc={svc} onCancel={() => cancelService(svc.id)} clientName={name} />
        )}
      </div>
    </div>
  )
}

function ServiceTracker({
  svc,
  onCancel,
  clientName,
}: {
  svc: any
  onCancel: () => void
  clientName: string
}) {
  const status = svc.status
  const statusMeta = STATUS_LABELS[status as keyof typeof STATUS_LABELS]
  const isFinal = status === 'completed' || status === 'cancelled' || status === 'expired'
  const isLive = !isFinal

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className={`rounded-xl border p-3 ${
          status === 'completed'
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : status === 'cancelled' || status === 'expired'
              ? 'border-rose-500/40 bg-rose-500/10'
              : 'border-amber-500/40 bg-amber-500/10'
        }`}
      >
        <div className="flex items-center gap-2">
          {isLive && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
          {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          {(status === 'cancelled' || status === 'expired') && (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
          <p className="text-sm font-bold text-white">{statusMeta.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Serviço #{svc.id.slice(-6).toUpperCase()} · {svc.typeLabel}
        </p>
      </div>

      {/* Provider card */}
      {svc.provider && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 bg-gradient-to-br from-emerald-500 to-emerald-700">
              <AvatarFallback className="bg-transparent text-sm font-bold text-white">
                {svc.provider.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{svc.provider.name}</p>
              <p className="text-xs text-slate-400">
                {svc.provider.vehicle} · {svc.provider.plate}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                <span className="text-xs font-bold">{svc.provider.rating.toFixed(1)}</span>
              </div>
              {isLive && (
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
              )}
            </div>
          </div>

          {(status === 'accepted' || status === 'arriving') && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">ETA</p>
                <p className="text-sm font-bold text-emerald-400">{svc.etaMin} min</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Distância</p>
                <p className="text-sm font-bold text-white">{svc.distanceKm} km</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Valor</p>
                <p className="text-sm font-bold text-amber-400">R$ {svc.price}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Route */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div className="my-1 w-0.5 flex-1 bg-slate-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Local do atendimento</p>
              <p className="text-xs font-medium text-white">{svc.pickupLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Destino final</p>
              <p className="text-xs font-medium text-white">{svc.destinationLabel}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Acompanhamento
        </p>
        <ScrollArea className="max-h-40">
          <div className="space-y-2 pr-2">
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
        </ScrollArea>
      </div>

      {/* Actions */}
      {isLive && (
        <Button
          onClick={onCancel}
          variant="outline"
          className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
        >
          Cancelar solicitação
        </Button>
      )}
      {isFinal && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
          <p className="text-sm font-bold text-white">Valor final: R$ {svc.price}</p>
          <p className="mt-1 text-xs text-slate-400">Pagamento na entrega · PIX ou cartão</p>
        </div>
      )}
    </div>
  )
}
