'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, Ban, Loader2, ShieldAlert } from 'lucide-react'
import type { ProviderApprovalStatus } from '@/server/providers/provider-approval'

type ProviderDetail = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  vehicle: string | null
  plate: string | null
  city: string | null
  approvalStatus: ProviderApprovalStatus
  approvalReason: string | null
  approvalReviewedAt: string | null
  approvalReviewedById: string | null
  documentStatus: string | null
  vehicleStatus: string | null
  userStatus: string | null
  isAvailable: boolean
  isVerified: boolean
  canOperate: boolean
}

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

export default function AdminProviderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [provider, setProvider] = useState<ProviderDetail | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/providers/${params.id}`, { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || 'Falha ao carregar prestador')
        if (!cancelled) setProvider(data.provider)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params.id])

  async function update(action: 'approve' | 'reject' | 'suspend') {
    setSaving(action)
    setError('')
    try {
      const res = await fetch(`/api/admin/providers/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Falha ao atualizar prestador')
      setProvider(data.provider)
      setReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="border-b border-slate-800 pb-5">
          <Link href="/admin/providers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Prestadores
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">Detalhe do prestador</h1>
          <p className="mt-1 text-sm text-slate-400">
            Acoes administrativas exigem sessao ADMIN e ficam registradas na auditoria.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-5 text-slate-300">
            <Loader2 className="size-5 animate-spin" />
            Carregando prestador...
          </div>
        ) : error && !provider ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950/30 p-5 text-red-200">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            {error}
          </div>
        ) : provider ? (
          <>
            <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{provider.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">{provider.email}</p>
                  <p className="mt-1 text-sm text-slate-400">{provider.phone || 'Telefone nao informado'}</p>
                </div>
                <span className={`inline-flex w-fit rounded-md border px-3 py-1.5 text-sm font-medium ${statusClass[provider.approvalStatus]}`}>
                  {statusLabel[provider.approvalStatus]}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <Info label="Veiculo" value={provider.vehicle || 'Nao informado'} />
                <Info label="Placa" value={provider.plate || 'Nao informada'} />
                <Info label="Cidade" value={provider.city || 'Nao informada'} />
                <Info label="Conta" value={provider.userStatus || 'Nao informado'} />
                <Info label="Documentos" value={provider.documentStatus || 'PENDING'} />
                <Info label="Veiculo aprovado" value={provider.vehicleStatus || 'PENDING'} />
                <Info label="Operacao" value={provider.canOperate ? 'Liberada' : 'Bloqueada'} />
                <Info label="Disponibilidade" value={provider.isAvailable ? 'Online no banco' : 'Offline/bloqueada'} />
              </dl>

              {provider.approvalReason || provider.approvalReviewedAt ? (
                <div className="mt-6 rounded-md border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                  <p>Ultima revisao: {provider.approvalReviewedAt ? new Date(provider.approvalReviewedAt).toLocaleString('pt-BR') : 'Nao registrada'}</p>
                  <p>Admin responsavel: {provider.approvalReviewedById || 'Nao registrado'}</p>
                  {provider.approvalReason ? <p>Motivo: {provider.approvalReason}</p> : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Analise administrativa</h2>
              <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="reason">
                Motivo para rejeicao ou suspensao
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-2 min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
                maxLength={500}
              />
              {error ? (
                <div className="mt-3 rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => update('approve')}
                  disabled={!!saving}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {saving === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => update('reject')}
                  disabled={!!saving}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-950/40 disabled:opacity-60"
                >
                  {saving === 'reject' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                  Rejeitar
                </button>
                <button
                  type="button"
                  onClick={() => update('suspend')}
                  disabled={!!saving}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving === 'suspend' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                  Suspender
                </button>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-200">{value}</dd>
    </div>
  )
}
