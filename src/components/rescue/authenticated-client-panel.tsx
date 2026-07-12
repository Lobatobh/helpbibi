'use client'

import { useState } from 'react'
import { MapPin, Navigation, RefreshCcw, Send, Shield, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SERVICE_TYPES, PAYMENT_METHODS, STATUS_LABELS, type PaymentMethod, type ServiceData, type ServiceType } from '@/lib/rescue-types'
import { useAuthenticatedClientSocket } from '@/hooks/use-authenticated-rescue-socket'

type Props = {
  userName: string
  initialService: ServiceData | null
}

const defaultPickup = { lat: -23.5505, lng: -46.6333 }
const defaultDestination = { lat: -23.5614, lng: -46.6559 }

export function AuthenticatedClientPanel({ userName, initialService }: Props) {
  const socket = useAuthenticatedClientSocket(initialService)
  const [type, setType] = useState<ServiceType>('reboque')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [pickupLabel, setPickupLabel] = useState('Av. Paulista, 1000')
  const [destinationLabel, setDestinationLabel] = useState('Rua Augusta, 500')
  const [description, setDescription] = useState('Preciso de socorro veicular')

  const service = socket.service
  const status = service ? STATUS_LABELS[service.status] : null
  const trackingUrl = service ? `/?track=${service.id}` : null

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    socket.requestService({
      type,
      description,
      pickup: defaultPickup,
      pickupLabel,
      destination: defaultDestination,
      destinationLabel,
      paymentMethod,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-300">Area do cliente</p>
            <h1 className="mt-1 text-2xl font-semibold">Ola, {userName}</h1>
            <p className="mt-1 text-sm text-slate-400">Solicite e acompanhe atendimentos reais do MVP.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md border px-3 py-1.5 text-xs font-semibold ${socket.connected ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-amber-800 bg-amber-950/40 text-amber-200'}`}>
              {socket.connected ? 'Tempo real conectado' : 'Reconectando tempo real'}
            </span>
            <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-100" onClick={socket.refreshSnapshot}>
              <RefreshCcw className="mr-2 size-4" />
              Atualizar
            </Button>
          </div>
        </header>

        {socket.connectionError ? (
          <Alert tone="amber" message={socket.connectionError} />
        ) : null}
        {socket.operationError ? (
          <Alert tone="red" message={socket.operationError} />
        ) : null}

        {service ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-300">{service.typeLabel}</p>
                  <h2 className="mt-1 text-xl font-semibold">{status?.label || service.status}</h2>
                  <p className="mt-2 text-sm text-slate-400">{service.description}</p>
                </div>
                <span className="w-fit rounded-md border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs font-semibold text-sky-200">
                  {service.id}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Info icon={<MapPin className="size-4" />} label="Origem" value={service.pickupLabel} />
                <Info icon={<Navigation className="size-4" />} label="Destino" value={service.destinationLabel} />
                <Info label="Distancia" value={`${service.distanceKm.toFixed(2)} km`} />
                <Info label="Valor" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price)} />
              </div>

              <ol className="mt-6 space-y-3">
                {service.timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <p className="text-sm font-medium text-white">{event.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.at).toLocaleString('pt-BR')}</p>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Prestador</h2>
                {service.provider ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>{service.provider.name}</p>
                    <p>{service.provider.vehicle}</p>
                    <p>Nota {service.provider.rating.toFixed(1)}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">Aguardando aceite.</p>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Tracking</h2>
                {trackingUrl ? (
                  <a href={trackingUrl} className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
                    Abrir rastreamento
                  </a>
                ) : null}
                {['searching', 'offered', 'accepted', 'arriving', 'arrived', 'in_progress'].includes(service.status) ? (
                  <Button variant="outline" className="mt-3 w-full border-red-900 bg-red-950/30 text-red-200 hover:bg-red-950/50" onClick={() => socket.cancelService(service.id)}>
                    <XCircle className="mr-2 size-4" />
                    Cancelar solicitação
                  </Button>
                ) : null}
              </section>
            </aside>
          </section>
        ) : (
          <form onSubmit={submit} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-sky-500 text-slate-950">
                <Shield className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Nova solicitação</h2>
                <p className="text-sm text-slate-400">A solicitação será salva antes de avisar prestadores.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Tipo</span>
                <select value={type} onChange={(event) => setType(event.target.value as ServiceType)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                  {SERVICE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Pagamento</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                  {PAYMENT_METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Origem</span>
                <Input value={pickupLabel} onChange={(event) => setPickupLabel(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Destino</span>
                <Input value={destinationLabel} onChange={(event) => setDestinationLabel(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">Descrição</span>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
            </div>

            <Button type="submit" disabled={!socket.connected || socket.submitting} className="mt-5 bg-sky-500 text-slate-950 hover:bg-sky-400">
              <Send className="mr-2 size-4" />
              {socket.submitting ? 'Criando...' : 'Confirmar solicitação'}
            </Button>
          </form>
        )}
      </main>
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <p className="flex items-center gap-2 text-xs uppercase text-slate-500">{icon}{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
    </div>
  )
}

function Alert({ tone, message }: { tone: 'amber' | 'red'; message: string }) {
  const className = tone === 'amber'
    ? 'border-amber-800 bg-amber-950/40 text-amber-200'
    : 'border-red-900 bg-red-950/40 text-red-200'
  return <p className={`rounded-md border px-3 py-2 text-sm ${className}`}>{message}</p>
}
