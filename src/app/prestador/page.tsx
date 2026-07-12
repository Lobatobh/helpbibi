import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BadgeCheck, Ban, Car, Clock3, FileText, Home, Radio } from 'lucide-react'
import { canAccessRole, getCurrentUserFromCookies, getDefaultPathForRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import {
  canProviderOperate,
  normalizeProviderApprovalStatus,
  type ProviderApprovalStatus,
} from '@/server/providers/provider-approval'

const approvalLabel: Record<ProviderApprovalStatus, string> = {
  PENDING: 'Em analise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
}

const approvalTone: Record<ProviderApprovalStatus, string> = {
  PENDING: 'border-amber-800 bg-amber-950/40 text-amber-200',
  APPROVED: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
  REJECTED: 'border-red-800 bg-red-950/40 text-red-200',
  SUSPENDED: 'border-slate-700 bg-slate-900 text-slate-200',
}

export default async function PrestadorPage() {
  const user = await getCurrentUserFromCookies()

  if (!user) {
    redirect('/login?next=/prestador')
  }

  if (!canAccessRole(user, 'PROVIDER')) {
    redirect(getDefaultPathForRole(user.role))
  }

  const provider = await db.providerProfile.findUnique({
    where: { userId: user.id },
    include: {
      user: {
        select: { status: true },
      },
    },
  })

  const approvalStatus = provider ? normalizeProviderApprovalStatus(provider) : 'PENDING'
  const canOperate = provider ? canProviderOperate(provider) : false
  const statusText = provider
    ? canOperate
      ? 'Liberada'
      : 'Bloqueada'
    : 'Cadastro incompleto'

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Area do prestador</p>
            <h1 className="mt-1 text-2xl font-semibold">Ola, {user.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              A operacao real fica disponivel apenas depois da aprovacao administrativa.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900"
          >
            <Home className="size-4" />
            Demo publica
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <StatusCard icon={<Car className="size-5" />} label="Perfil" value={provider?.vehicle ?? 'Pendente'} />
          <StatusCard icon={<BadgeCheck className="size-5" />} label="Aprovacao" value={approvalLabel[approvalStatus]} />
          <StatusCard icon={<Radio className="size-5" />} label="Disponibilidade" value={statusText} />
        </div>

        <section className={`rounded-lg border p-5 ${approvalTone[approvalStatus]}`}>
          <div className="flex items-start gap-3">
            {canOperate ? <BadgeCheck className="mt-0.5 size-5 shrink-0" /> : <Ban className="mt-0.5 size-5 shrink-0" />}
            <div>
              <h2 className="text-lg font-semibold">
                {canOperate ? 'Prestador aprovado para operar' : 'Operacao bloqueada'}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6">
                {canOperate
                  ? 'Seu cadastro foi aprovado. A disponibilidade operacional pode ser ativada no fluxo real do prestador.'
                  : 'Voce pode acessar o painel e acompanhar a analise, mas ainda nao pode ficar online nem receber solicitacoes reais.'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <InfoPanel icon={<FileText className="size-5" />} title="Cadastro">
            <p>Veiculo: {provider?.vehicle ?? 'Nao informado'}</p>
            <p>Placa: {provider?.plate ?? 'Nao informada'}</p>
            <p>Cidade: {provider?.city ?? 'Nao informada'}</p>
          </InfoPanel>

          <InfoPanel icon={<Clock3 className="size-5" />} title="Analise administrativa">
            <p>Documentos: {provider?.documentStatus ?? 'PENDING'}</p>
            <p>Veiculo: {provider?.vehicleStatus ?? 'PENDING'}</p>
            {provider?.approvalReviewedAt ? (
              <p>Ultima revisao: {provider.approvalReviewedAt.toLocaleString('pt-BR')}</p>
            ) : (
              <p>Ultima revisao: aguardando analise</p>
            )}
            {provider?.approvalReason ? <p>Motivo: {provider.approvalReason}</p> : null}
          </InfoPanel>
        </section>
      </section>
    </main>
  )
}

function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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

function InfoPanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center gap-2 text-orange-300">
        {icon}
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-1 text-sm text-slate-300">{children}</div>
    </div>
  )
}
