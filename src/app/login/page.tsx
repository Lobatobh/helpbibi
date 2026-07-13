'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Car, Lock, Mail, Phone, Shield, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Role = 'CLIENT' | 'PROVIDER' | 'ADMIN'
type Mode = 'login' | 'register-client' | 'register-provider'

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
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [plate, setPlate] = useState('')
  const [city, setCity] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptProviderOperational, setAcceptProviderOperational] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const endpoint = mode === 'login'
      ? '/api/auth/login'
      : mode === 'register-client'
        ? '/api/auth/register-client'
        : '/api/auth/register-provider'
    const payload = mode === 'login'
      ? { email, password }
      : mode === 'register-client'
        ? { name, email, phone, password, acceptTerms, acceptPrivacy }
        : { name, email, phone, password, vehicle, plate, city, acceptTerms, acceptPrivacy, acceptProviderOperational }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.message || data.error || 'Nao foi possivel concluir.')
        return
      }
      router.push(defaultPathForRole(data.user?.role || data.role))
    } catch {
      setError('Falha de rede ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'login'
    ? 'Entrar na Help Bibi'
    : mode === 'register-client'
      ? 'Criar conta de cliente'
      : 'Criar conta de prestador'
  const registrationReady = mode === 'login' ||
    (acceptTerms && acceptPrivacy && (mode !== 'register-provider' || acceptProviderOperational))

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-sky-500 text-slate-950">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-400">Acesso de cliente e prestador. Admin usa entrada separada.</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-1 rounded-md border border-slate-800 bg-slate-950 p-1 text-xs font-semibold">
          <button type="button" onClick={() => setMode('login')} className={`rounded px-2 py-2 ${mode === 'login' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}>Entrar</button>
          <button type="button" onClick={() => setMode('register-client')} className={`rounded px-2 py-2 ${mode === 'register-client' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}>Cliente</button>
          <button type="button" onClick={() => setMode('register-provider')} className={`rounded px-2 py-2 ${mode === 'register-provider' ? 'bg-orange-400 text-slate-950' : 'text-slate-400'}`}>Prestador</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'login' ? (
            <Field icon={<User className="size-4" />} label="Nome">
              <Input value={name} onChange={(event) => setName(event.target.value)} className="border-slate-700 bg-slate-950 pl-9 text-white" required />
            </Field>
          ) : null}

          <Field icon={<Mail className="size-4" />} label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="border-slate-700 bg-slate-950 pl-9 text-white" autoComplete="email" required />
          </Field>

          {mode !== 'login' ? (
            <Field icon={<Phone className="size-4" />} label="Telefone">
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="border-slate-700 bg-slate-950 pl-9 text-white" />
            </Field>
          ) : null}

          <Field icon={<Lock className="size-4" />} label="Senha">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="border-slate-700 bg-slate-950 pl-9 text-white" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </Field>

          {mode === 'register-provider' ? (
            <>
              <div className="border border-amber-800 bg-amber-950/30 p-3 text-xs leading-5 text-amber-100">
                O cadastro depende de aprovação. Disponibilidade não garante ofertas; chamados podem ser aceitos ou recusados; localização será necessária quando a operação for ativada; violações podem gerar suspensão. O piloto não realiza repasse financeiro real.
              </div>
              <Field icon={<Car className="size-4" />} label="Veiculo">
                <Input value={vehicle} onChange={(event) => setVehicle(event.target.value)} className="border-slate-700 bg-slate-950 pl-9 text-white" required />
              </Field>
              <label className="space-y-2">
                <Label htmlFor="plate">Placa</Label>
                <Input id="plate" value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="border-slate-700 bg-slate-950 uppercase text-white" required />
              </label>
              <label className="space-y-2">
                <Label htmlFor="city">Cidade/Base</Label>
                <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
              </label>
            </>
          ) : null}

          {mode !== 'login' ? (
            <div className="space-y-3 border-t border-slate-800 pt-4 text-sm text-slate-300">
              <ConsentCheckbox checked={acceptTerms} onChange={setAcceptTerms}>
                Li e aceito os <Link href="/termos" target="_blank" className="text-sky-300 underline">Termos de Uso</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox checked={acceptPrivacy} onChange={setAcceptPrivacy}>
                Li a <Link href="/privacidade" target="_blank" className="text-sky-300 underline">Política de Privacidade</Link>.
              </ConsentCheckbox>
              {mode === 'register-provider' ? (
                <ConsentCheckbox checked={acceptProviderOperational} onChange={setAcceptProviderOperational}>
                  Aceito as regras operacionais do prestador descritas nos Termos.
                </ConsentCheckbox>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full gap-2" disabled={loading || !registrationReady}>
            {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
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
        <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500">
          <Link href="/termos" className="hover:text-white">Termos</Link>
          <Link href="/privacidade" className="hover:text-white">Privacidade</Link>
        </div>
      </section>
    </main>
  )
}

function ConsentCheckbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4" />
      <span>{children}</span>
    </label>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        {children}
      </div>
    </label>
  )
}
