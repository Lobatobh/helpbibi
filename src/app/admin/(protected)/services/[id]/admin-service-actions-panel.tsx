'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Ban, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'

type ServiceAction = 'cancel' | 'fail' | 'complete'
type Warning = { code: string; message: string; serviceId?: string; paymentRecordId?: string }

const terminalStatuses = new Set(['COMPLETED', 'CANCELED', 'FAILED', 'EXPIRED'])

const actionLabels: Record<ServiceAction, string> = {
  cancel: 'Cancelar',
  fail: 'Marcar como falho',
  complete: 'Concluir manualmente',
}

export function AdminServiceActionsPanel({
  serviceId,
  clientId,
  clientName,
  status,
  paymentStatus,
  latestPaymentStatus,
}: {
  serviceId: string
  clientId: string | null
  clientName: string | null
  status: string
  paymentStatus: string
  latestPaymentStatus: string | null
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [warnings, setWarnings] = useState<Warning[]>([])

  const trimmedReason = reason.trim()
  const reasonInvalid = trimmedReason.length < 10 || trimmedReason.length > 500

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Falha na acao administrativa')
    return data
  }

  async function runServiceAction(action: ServiceAction) {
    setError('')
    setResult('')
    setWarnings([])
    if (reasonInvalid) {
      setError('Informe um motivo administrativo entre 10 e 500 caracteres.')
      return
    }
    if (!window.confirm(`Confirmar: ${actionLabels[action]}?`)) return

    setLoading(action)
    try {
      const data = await postJson(`/api/admin/services/${serviceId}/actions`, {
        action,
        reason: trimmedReason,
      })
      setResult(data.changed ? 'Acao registrada.' : 'Servico ja estava neste estado terminal.')
      setWarnings(data.warnings || [])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(null)
    }
  }

  async function suspendClient() {
    if (!clientId) return
    setError('')
    setResult('')
    setWarnings([])
    if (!window.confirm(`Suspender cliente ${clientName || clientId}?`)) return

    setLoading('suspend-client')
    try {
      const data = await postJson(`/api/admin/clients/${clientId}/actions`, {
        action: 'suspend',
      })
      setResult(data.changed ? 'Cliente suspenso.' : 'Cliente ja estava suspenso.')
      setWarnings(data.warnings || [])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(null)
    }
  }

  const isTerminal = terminalStatuses.has(status)
  const hasPaidPayment = paymentStatus === 'PAID' || latestPaymentStatus === 'PAID'

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-lg font-semibold">Acoes operacionais</h2>
      <p className="mt-2 text-sm text-slate-400">
        Acoes de suporte exigem motivo, sessao ADMIN e registram timeline/auditoria.
      </p>

      {hasPaidPayment ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Pagamento PAID nao sofre refund automatico nesta fase.
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="admin-service-reason">
        Motivo administrativo
      </label>
      <textarea
        id="admin-service-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        className="mt-2 min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
      />
      <p className="mt-1 text-xs text-slate-500">{trimmedReason.length}/500 caracteres</p>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {result}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <div key={`${warning.code}-${warning.serviceId || warning.paymentRecordId || 'warn'}`} className="rounded-md border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">
              {warning.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => runServiceAction('cancel')}
          disabled={!!loading || isTerminal}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/40 disabled:opacity-60"
        >
          {loading === 'cancel' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => runServiceAction('fail')}
          disabled={!!loading || isTerminal}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-950/40 disabled:opacity-60"
        >
          {loading === 'fail' ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
          Marcar como falho
        </button>
        <button
          type="button"
          onClick={() => runServiceAction('complete')}
          disabled={!!loading || status !== 'IN_PROGRESS'}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/40 disabled:opacity-60"
        >
          {loading === 'complete' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Concluir manualmente
        </button>
        <button
          type="button"
          onClick={suspendClient}
          disabled={!!loading || !clientId}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
        >
          {loading === 'suspend-client' ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
          Suspender cliente
        </button>
      </div>
    </section>
  )
}
