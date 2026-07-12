'use client'

import { BadgeCheck, Ban, Car, Check, Clock3, RefreshCcw, Radio, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ServiceData } from '@/lib/rescue-types'
import { STATUS_LABELS } from '@/lib/rescue-types'
import { useAuthenticatedProviderSocket } from '@/hooks/use-authenticated-rescue-socket'

type ProviderInfo = {
  vehicle: string
  plate: string
  city: string | null
  approvalStatus: string
  approvalReason: string | null
  canOperate: boolean
  isAvailable: boolean
}

type Props = {
  userName: string
  provider: ProviderInfo | null
  initialService: ServiceData | null
}

const approvalLabel: Record<string, string> = {
  PENDING: 'Em analise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
}

export function AuthenticatedProviderPanel({ userName, provider, initialService }: Props) {
  const socket = useAuthenticatedProviderSocket(initialService)
  const service = socket.service
  const offer = socket.offer
  const online = socket.state?.online ?? provider?.isAvailable ?? false

  if (!provider) {
    return (
      <Shell userName={userName} connected={socket.connected} refresh={socket.refreshSnapshot}>
        <Blocked title="Cadastro incompleto" message="Seu perfil de prestador ainda nao foi criado." />
      </Shell>
    )
  }

  if (!provider.canOperate) {
    return (
      <Shell userName={userName} connected={socket.connected} refresh={socket.refreshSnapshot}>
        <Blocked
          title={`Operacao bloqueada - ${approvalLabel[provider.approvalStatus] || provider.approvalStatus}`}
          message={provider.approvalReason || 'Aguarde a analise do ADM antes de ficar disponivel.'}
        />
      </Shell>
    )
  }

  return (
    <Shell userName={userName} connected={socket.connected} refresh={socket.refreshSnapshot}>
      {socket.connectionError ? <Alert message={socket.connectionError} /> : null}
      {socket.operationError ? <Alert message={socket.operationError} danger /> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard icon={<Car className="size-5" />} label="Veiculo" value={provider.vehicle} />
        <StatusCard icon={<BadgeCheck className="size-5" />} label="Aprovacao" value={approvalLabel[provider.approvalStatus] || provider.approvalStatus} />
        <StatusCard icon={<Radio className="size-5" />} label="Disponibilidade" value={online ? 'Disponivel' : 'Offline'} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Disponibilidade operacional</h2>
            <p className="mt-1 text-sm text-slate-400">O banco guarda sua intencao; o socket confirma presenca online.</p>
          </div>
          <Button
            className={online ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-orange-400 text-slate-950 hover:bg-orange-300'}
            onClick={() => socket.toggleOnline(!online)}
            disabled={!!service}
          >
            {online ? 'Ficar offline' : 'Ficar disponivel'}
          </Button>
        </div>
      </section>

      {offer ? (
        <ServiceCard title="Nova chamada" service={offer}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={() => socket.accept(offer.id)}>
              <Check className="mr-2 size-4" />
              Aceitar
            </Button>
            <Button variant="outline" className="border-red-900 bg-red-950/30 text-red-200 hover:bg-red-950/50" onClick={() => socket.reject(offer.id)}>
              <X className="mr-2 size-4" />
              Recusar
            </Button>
          </div>
        </ServiceCard>
      ) : null}

      {service ? (
        <ServiceCard title="Atendimento ativo" service={service}>
          <div className="mt-4 flex flex-wrap gap-2">
            {service.status === 'accepted' ? <Button onClick={() => socket.updateStatus('arrived', service.id)}>Cheguei ao local</Button> : null}
            {service.status === 'arrived' ? <Button onClick={() => socket.updateStatus('start', service.id)}>Iniciar atendimento</Button> : null}
            {service.status === 'in_progress' ? <Button onClick={() => socket.updateStatus('complete', service.id)}>Finalizar</Button> : null}
          </div>
        </ServiceCard>
      ) : (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
          Nenhum atendimento vinculado no momento.
        </section>
      )}
    </Shell>
  )
}

function Shell({ userName, connected, refresh, children }: { userName: string; connected: boolean; refresh: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Area do prestador</p>
            <h1 className="mt-1 text-2xl font-semibold">Ola, {userName}</h1>
            <p className="mt-1 text-sm text-slate-400">Painel operacional autenticado.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${connected ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-amber-800 bg-amber-950/40 text-amber-200'}`}>
              {connected ? 'Presenca conectada' : 'Reconectando'}
            </span>
            <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-100" onClick={refresh}>
              <RefreshCcw className="mr-2 size-4" />
              Atualizar
            </Button>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

function Blocked({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-lg border border-amber-800 bg-amber-950/30 p-5 text-amber-100">
      <div className="flex gap-3">
        <Ban className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm">{message}</p>
        </div>
      </div>
    </section>
  )
}

function StatusCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-3 text-orange-300">
        {icon}
        <span className="text-sm font-medium text-slate-300">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold">{value}</p>
    </div>
  )
}

function ServiceCard({ title, service, children }: { title: string; service: ServiceData; children?: React.ReactNode }) {
  const status = STATUS_LABELS[service.status]
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-orange-300">{title}</p>
          <h2 className="mt-1 text-lg font-semibold">{service.typeLabel}</h2>
          <p className="mt-1 text-sm text-slate-400">{service.pickupLabel} para {service.destinationLabel}</p>
        </div>
        <span className="w-fit rounded-md border border-orange-800 bg-orange-950/40 px-3 py-1.5 text-xs font-semibold text-orange-200">
          {status?.label || service.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <Info label="Cliente" value={service.clientName} />
        <Info label="Valor" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price)} />
        <Info label="ETA" value={`${service.etaMin} min`} />
      </div>
      {children}
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <p className="flex items-center gap-2 text-xs uppercase text-slate-500"><Clock3 className="size-3" />{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
    </div>
  )
}

function Alert({ message, danger = false }: { message: string; danger?: boolean }) {
  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${danger ? 'border-red-900 bg-red-950/40 text-red-200' : 'border-amber-800 bg-amber-950/40 text-amber-200'}`}>
      {message}
    </p>
  )
}
