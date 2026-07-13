import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, ArrowLeft, Clock3, CreditCard, MapPin, User, UserCheck } from 'lucide-react'
import { findServiceForAdmin } from '@/server/repositories/service-requests.repository'
import { AdminServiceActionsPanel } from './admin-service-actions-panel'

const statusLabel: Record<string, string> = {
  REQUESTED: 'Solicitado',
  OFFERED: 'Ofertado',
  ACCEPTED: 'Aceito',
  PROVIDER_EN_ROUTE: 'Em deslocamento',
  ARRIVED: 'Chegou',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluido',
  CANCELED: 'Cancelado',
  EXPIRED: 'Expirado',
  FAILED: 'Falhou',
}

const statusClass: Record<string, string> = {
  REQUESTED: 'border-amber-800 bg-amber-950/40 text-amber-200',
  OFFERED: 'border-sky-800 bg-sky-950/40 text-sky-200',
  ACCEPTED: 'border-blue-800 bg-blue-950/40 text-blue-200',
  PROVIDER_EN_ROUTE: 'border-cyan-800 bg-cyan-950/40 text-cyan-200',
  ARRIVED: 'border-indigo-800 bg-indigo-950/40 text-indigo-200',
  IN_PROGRESS: 'border-purple-800 bg-purple-950/40 text-purple-200',
  COMPLETED: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
  CANCELED: 'border-slate-700 bg-slate-900 text-slate-200',
  EXPIRED: 'border-slate-700 bg-slate-900 text-slate-200',
  FAILED: 'border-red-800 bg-red-950/40 text-red-200',
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Nao registrado'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)
}

export default async function AdminServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = await findServiceForAdmin(id)
  if (!service) notFound()

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/admin/services" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="size-4" />
              Servicos
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">Detalhe do servico</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">{service.id}</p>
          </div>
          <span className={`inline-flex w-fit rounded-md border px-3 py-1.5 text-sm font-medium ${statusClass[service.status] || statusClass.FAILED}`}>
            {statusLabel[service.status] || service.status}
          </span>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="Criado" value={formatDate(service.createdAt)} icon={<Clock3 className="size-4" />} />
          <Metric label="Valor" value={formatCurrency(service.price)} icon={<CreditCard className="size-4" />} />
          <Metric label="Cliente" value={service.clientName || 'Nao informado'} icon={<User className="size-4" />} />
          <Metric label="Prestador" value={service.providerName || 'Nao vinculado'} icon={<UserCheck className="size-4" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="size-5 text-orange-300" />
              Linha do tempo
            </h2>
            <ol className="mt-5 space-y-3">
              {service.timeline.map((event) => (
                <li key={event.id} className="rounded-md border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-white">{event.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.eventType || 'status_update'} - {event.actorRole || 'SYSTEM'}
                        {event.providerProfileId ? ` - provider ${event.providerProfileId}` : ''}
                      </p>
                    </div>
                    <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${statusClass[event.status] || statusClass.FAILED}`}>
                      {statusLabel[event.status] || event.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                </li>
              ))}
              {service.timeline.length === 0 ? (
                <li className="rounded-md border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  Nenhum evento registrado.
                </li>
              ) : null}
            </ol>
          </section>

          <aside className="flex flex-col gap-4">
            <AdminServiceActionsPanel
              serviceId={service.id}
              clientId={service.client?.id || null}
              clientName={service.clientName}
              status={service.status}
              paymentStatus={service.paymentStatus}
              latestPaymentStatus={service.latestPayment?.status || null}
            />

            <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Localizacao</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <Info label="Origem" value={service.pickupLabel} icon={<MapPin className="size-4" />} />
                <Info label="Destino" value={service.destinationLabel} icon={<MapPin className="size-4" />} />
                <Info label="Distancia" value={`${service.distanceKm.toFixed(2)} km`} />
                <Info label="ETA" value={`${service.etaMin} min`} />
              </dl>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Pagamento</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <Info label="Metodo" value={service.paymentMethod} />
                <Info label="Status" value={service.paymentStatus} />
                <Info label="Taxa plataforma" value={service.platformFee == null ? 'Nao registrada' : formatCurrency(service.platformFee)} />
                <Info label="Repasse prestador" value={service.providerPayout == null ? 'Nao registrado' : formatCurrency(service.providerPayout)} />
              </dl>
            </section>

            {service.canceledAt || service.cancellationReason ? (
              <section className="rounded-lg border border-amber-800 bg-amber-950/20 p-5 text-sm text-amber-100">
                <h2 className="text-lg font-semibold">Cancelamento</h2>
                <p className="mt-3">Ator: {service.canceledByRole || 'Nao informado'}</p>
                <p>Data: {formatDate(service.canceledAt)}</p>
                <p>Motivo: {service.cancellationReason || 'Nao informado'}</p>
              </section>
            ) : null}
          </aside>
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Ofertas</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Prestador</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ofertado</th>
                  <th className="px-4 py-3 font-medium">Respondido</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {service.offers.map((offer) => (
                  <tr key={offer.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{offer.providerName || offer.providerId}</p>
                      <p className="text-xs text-slate-500">{offer.vehicle || 'Veiculo nao informado'} - {offer.plate || 'placa nao informada'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{offer.status}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(offer.offeredAt)}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(offer.respondedAt)}</td>
                    <td className="px-4 py-3 text-slate-300">{offer.reason || '-'}</td>
                  </tr>
                ))}
                {service.offers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-400" colSpan={5}>
                      Nenhuma oferta persistida para este servico.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-orange-300">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-medium text-slate-200">{value}</dd>
    </div>
  )
}
