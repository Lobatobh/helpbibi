'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Lock, Mail, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Role = 'CLIENT' | 'PROVIDER' | 'ADMIN'

function defaultPathForRole(role: Role | string | undefined): string {
  switch (role) {
    case 'CLIENT':
      return '/cliente'
    case 'PROVIDER':
      return '/prestador'
    case 'ADMIN':
      return '/admin'
    default:
      return '/'
  }
}

export default function LoginPage() {
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.message || 'Nao foi possivel entrar.')
        return
      }
      router.push(defaultPathForRole(data.user?.role))
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
          <div className="flex size-10 items-center justify-center rounded-md bg-sky-500 text-slate-950">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Entrar na Help Bibi</h1>
            <p className="text-sm text-slate-400">Acesso de cliente, prestador ou admin.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="border-slate-700 bg-slate-950 pl-9 text-white"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-slate-700 bg-slate-950 pl-9 text-white"
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

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
          <Link href="/" className="hover:text-white">
            Demo publica
          </Link>
          <Link href="/admin/login" className="hover:text-white">
            Admin
          </Link>
        </div>
      </section>
    </main>
  )
}
