import Link from 'next/link'
import { Activity, ArrowLeft, Clock3, MapPin, Search, UserCheck, Wrench } from 'lucide-react'
import { listServicesForAdmin } from '@/server/repositories/service-requests.repository'
import type { ServiceStatus } from '@prisma/client'

const statusLabel: Record<string, string> = {
  ALL: 'Todos',
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

const FILTERS = [
  'ALL',
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'PROVIDER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
] as const

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Nao registrado'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)
}

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const query = Array.isArray(params.q) ? params.q[0] : params.q
  const status = FILTERS.includes((rawStatus || 'ALL') as any)
    ? (rawStatus || 'ALL')
    : 'ALL'
  const services = await listServicesForAdmin({
    status: status as ServiceStatus | 'ALL',
    query: query || null,
    limit: 100,
  })
  const activeCount = services.filter((service) =>
    ['REQUESTED', 'OFFERED', 'ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(service.status),
  ).length
  const completedCount = services.filter((service) => service.status === 'COMPLETED').length

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="size-4" />
              Admin
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">Servicos</h1>
            <p className="mt-1 text-sm text-slate-400">
              Acompanhe solicitacoes, ofertas, aceite, cancelamento e historico operacional.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Counter label="Listados" value={services.length} icon={<Activity className="size-4" />} />
            <Counter label="Ativos" value={activeCount} icon={<Clock3 className="size-4" />} />
            <Counter label="Concluidos" value={completedCount} icon={<UserCheck className="size-4" />} />
          </div>
        </header>

        <form className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={query || ''}
              placeholder="Buscar por cliente, prestador, endereco ou ID"
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white outline-none focus:border-orange-400"
            />
          </label>
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-orange-400"
          >
            {FILTERS.map((item) => (
              <option key={item} value={item}>
                {statusLabel[item]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-400 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-300"
          >
            <Search className="size-4" />
            Filtrar
          </button>
        </form>

        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Servico</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Prestador</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Timeline</th>
                  <th className="px-4 py-3 text-right font-medium">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-slate-800/60">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-400">{service.id}</p>
                      <p className="mt-1 flex items-center gap-2 font-medium text-white">
                        <Wrench className="size-4 text-orange-300" />
                        {service.type}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="size-3" />
                        {service.pickupLabel}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{service.clientName || 'Nao informado'}</p>
                      <p className="text-xs text-slate-500">{formatDate(service.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {service.providerName || 'Nao vinculado'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass[service.status] || statusClass.FAILED}`}>
                        {statusLabel[service.status] || service.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <p>{formatCurrency(service.price)}</p>
                      <p className="text-xs text-slate-500">{service.paymentStatus}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <p className="max-w-xs truncate">{service.lastTimeline || 'Sem evento'}</p>
                      <p className="text-xs text-slate-500">{service.ratingsCount} avaliacao(oes)</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/services/${service.id}`}
                        className="inline-flex rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
                {services.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-400" colSpan={7}>
                      Nenhum servico encontrado.
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

function Counter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center gap-2 text-orange-300">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}
