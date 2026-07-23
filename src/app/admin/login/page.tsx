'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.message || 'Credenciais invalidas.')
        return
      }
      router.push('/admin')
    } catch {
      setError('Falha de rede ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-emerald-400 text-slate-950">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Login admin</h1>
            <p className="text-sm text-slate-400">Acesso restrito ao painel administrativo.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 border-slate-700 bg-slate-950 pl-9 text-white"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 border-slate-700 bg-slate-950 pl-9 text-white"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="min-h-11 w-full gap-2" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar como admin'}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
          <Link href="/login" className="inline-flex min-h-11 items-center hover:text-white">
            Login geral
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center hover:text-white">
            Demo publica
          </Link>
        </div>
        <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500">
          <Link href="/termos" className="inline-flex min-h-11 items-center hover:text-white">Termos</Link>
          <Link href="/privacidade" className="inline-flex min-h-11 items-center hover:text-white">Privacidade</Link>
        </div>
      </section>
    </main>
  )
}
