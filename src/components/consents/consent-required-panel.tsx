'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConsentStatus } from '@/server/consents/consent-service'

const LABELS: Record<string, string> = {
  TERMS: 'Li e aceito os Termos de Uso vigentes.',
  PRIVACY_NOTICE: 'Li a Política de Privacidade vigente.',
  PROVIDER_OPERATIONAL: 'Aceito as regras operacionais do prestador para o piloto.',
}

export function ConsentRequiredPanel({
  initialConsents,
  onAccepted,
}: {
  initialConsents: ConsentStatus[]
  onAccepted?: () => void
}) {
  const pending = useMemo(() => initialConsents.filter((item) => !item.accepted), [initialConsents])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const allChecked = pending.length > 0 && pending.every((item) => checked[item.type] === true)

  if (!pending.length) return null

  async function accept() {
    if (!allChecked) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/consents/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ types: pending.map((item) => item.type) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.current) {
        throw new Error(data?.message || 'Não foi possível registrar os aceites.')
      }
      if (onAccepted) onAccepted()
      else window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar os aceites.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="border border-amber-700 bg-amber-950/30 p-5 text-amber-50">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div>
          <h2 className="font-semibold">Documentos atualizados</h2>
          <p className="mt-1 text-sm text-amber-100/80">
            Seu perfil e histórico permanecem acessíveis. Aceite as versões vigentes para liberar operações.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {pending.map((item) => (
          <label key={item.type} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={checked[item.type] === true}
              onChange={(event) => setChecked((current) => ({ ...current, [item.type]: event.target.checked }))}
              className="mt-0.5 size-4"
            />
            <span>
              {LABELS[item.type] || item.type} <span className="text-amber-200/70">Versão {item.version}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="mt-4 text-sm">
        Consulte <Link href="/termos" className="underline">Termos de Uso</Link> e{' '}
        <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
      </p>

      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
      <Button type="button" onClick={accept} disabled={!allChecked || loading} className="mt-4 bg-amber-300 text-slate-950 hover:bg-amber-200">
        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
        Registrar aceites
      </Button>
    </section>
  )
}
