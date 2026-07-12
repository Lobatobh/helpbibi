import Link from 'next/link'
import { ArrowLeft, BadgeCheck, Ban, Clock3, UserCheck } from 'lucide-react'
import { listProvidersForAdmin } from '@/server/repositories/providers.repository'
import type { ProviderApprovalStatus } from '@/server/providers/provider-approval'

const statusLabel: Record<ProviderApprovalStatus, string> = {
  PENDING: 'Em analise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
}

const statusClass: Record<ProviderApprovalStatus, string> = {
  PENDING: 'border-amber-800 bg-amber-950/40 text-amber-200',
  APPROVED: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
  REJECTED: 'border-red-800 bg-red-950/40 text-red-200',
  SUSPENDED: 'border-slate-700 bg-slate-900 text-slate-200',
}

export default async function AdminProvidersPage() {
  const providers = await listProvidersForAdmin()
  const counts = providers.reduce<Record<ProviderApprovalStatus, number>>((acc, provider) => {
    acc[provider.approvalStatus as ProviderApprovalStatus] += 1
    return acc
  }, { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 })

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="size-4" />
              Admin
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">Prestadores</h1>
            <p className="mt-1 text-sm text-slate-400">
              Analise, aprove, rejeite ou suspenda prestadores cadastrados.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            <UserCheck className="size-4 text-orange-300" />
            {providers.length} cadastro(s)
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <Counter label="Em analise" value={counts.PENDING} icon={<Clock3 className="size-4" />} />
          <Counter label="Aprovados" value={counts.APPROVED} icon={<BadgeCheck className="size-4" />} />
          <Counter label="Rejeitados" value={counts.REJECTED} icon={<Ban className="size-4" />} />
          <Counter label="Suspensos" value={counts.SUSPENDED} icon={<Ban className="size-4" />} />
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Prestador</th>
                  <th className="px-4 py-3 font-medium">Veiculo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Documentos</th>
                  <th className="px-4 py-3 font-medium">Operacao</th>
                  <th className="px-4 py-3 text-right font-medium">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {providers.map((provider) => (
                  <tr key={provider.id} className="hover:bg-slate-800/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{provider.name}</p>
                      <p className="text-xs text-slate-400">{provider.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <p>{provider.vehicle}</p>
                      <p className="text-xs text-slate-500">{provider.plate}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass[provider.approvalStatus as ProviderApprovalStatus]}`}>
                        {statusLabel[provider.approvalStatus as ProviderApprovalStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {provider.documentStatus} / {provider.vehicleStatus}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {provider.canOperate ? 'Liberada' : 'Bloqueada'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/providers/${provider.id}`}
                        className="inline-flex rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
                {providers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-400" colSpan={6}>
                      Nenhum prestador cadastrado.
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
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-orange-300">
        {icon}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}
