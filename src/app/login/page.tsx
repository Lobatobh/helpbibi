'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Car, Check, Lock, Mail, MapPinned, Phone, ShieldCheck, User } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'
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
        setError(data.message || data.error || 'Não foi possível concluir.')
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
    ? 'Acesse sua conta'
    : mode === 'register-client'
      ? 'Comece como cliente'
      : 'Cadastre-se como prestador'
  const registrationReady = mode === 'login' ||
    (acceptTerms && acceptPrivacy && (mode !== 'register-provider' || acceptProviderOperational))

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Image
        src="/helpbibi-hero.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[70%_center] opacity-16 dark:opacity-24"
      />
      <div className="absolute inset-0 bg-background/78 backdrop-blur-[2px] dark:bg-black/78" />

      <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-border px-4 sm:px-6">
        <Link href="/" aria-label="Voltar para a página inicial">
          <BrandLogo priority className="h-11 w-[8.5rem]" />
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-12">
        <section className="hidden max-w-md lg:block">
          <p className="hb-kicker">Acesso Help Bibi</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight">
            Seu atendimento continua de onde parou.
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Entre para solicitar ajuda, operar como prestador ou recuperar um serviço ativo.
          </p>
          <div className="mt-7 space-y-3">
            <LoginBenefit icon={MapPinned} text="Localização e status no mesmo painel" />
            <LoginBenefit icon={ShieldCheck} text="Sessão e acesso separados por perfil" />
            <LoginBenefit icon={Check} text="Histórico preservado após novo login" />
          </div>
        </section>

        <section className="hb-card mx-auto w-full max-w-xl p-5 sm:p-7">
          <div>
            <p className="hb-kicker">{mode === 'login' ? 'Bem-vindo de volta' : 'Nova conta'}</p>
            <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Cliente e prestador usam este acesso. Administração possui entrada separada.</p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1 text-xs font-bold">
            <ModeButton active={mode === 'login'} onClick={() => setMode('login')}>Entrar</ModeButton>
            <ModeButton active={mode === 'register-client'} onClick={() => setMode('register-client')}>Cliente</ModeButton>
            <ModeButton active={mode === 'register-provider'} onClick={() => setMode('register-provider')} orange>Prestador</ModeButton>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode !== 'login' ? (
              <Field icon={User} label="Nome">
                <Input value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
            ) : null}

            <Field icon={Mail} label="E-mail">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </Field>

            {mode !== 'login' ? (
              <Field icon={Phone} label="Telefone">
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
            ) : null}

            <Field icon={Lock} label="Senha">
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
            </Field>

            {mode === 'register-provider' ? (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="rounded-xl border border-[#FFA500]/30 bg-[#FFA500]/10 p-3 text-xs leading-5">
                  O cadastro depende de aprovação administrativa. Localização será necessária para ficar disponível e o piloto não realiza repasse financeiro real.
                </div>
                <Field icon={Car} label="Veículo">
                  <Input value={vehicle} onChange={(event) => setVehicle(event.target.value)} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <Label htmlFor="plate">Placa</Label>
                    <Input id="plate" value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="uppercase" required />
                  </label>
                  <label className="space-y-2">
                    <Label htmlFor="city">Cidade/Base</Label>
                    <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
                  </label>
                </div>
              </div>
            ) : null}

            {mode !== 'login' ? (
              <div className="space-y-3 border-t border-border pt-4 text-sm">
                <ConsentCheckbox checked={acceptTerms} onChange={setAcceptTerms}>
                  Li e aceito os <Link href="/termos" target="_blank" className="inline-flex min-h-11 items-center font-bold text-help-night underline dark:text-help-blue">Termos de Uso</Link>.
                </ConsentCheckbox>
                <ConsentCheckbox checked={acceptPrivacy} onChange={setAcceptPrivacy}>
                  Li a <Link href="/privacidade" target="_blank" className="inline-flex min-h-11 items-center font-bold text-help-night underline dark:text-help-blue">Política de Privacidade</Link>.
                </ConsentCheckbox>
                {mode === 'register-provider' ? (
                  <ConsentCheckbox checked={acceptProviderOperational} onChange={setAcceptProviderOperational}>
                    Aceito as regras operacionais do prestador descritas nos Termos.
                  </ConsentCheckbox>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#EF4444]" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              className={`min-h-12 w-full rounded-xl text-sm font-extrabold text-black ${
                mode === 'register-provider' ? 'bg-[#FFA500] hover:bg-[#FFA500]/85' : 'bg-[#00BFFF] hover:bg-[#00BFFF]/85'
              }`}
              disabled={loading || !registrationReady}
            >
              {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold hover:text-foreground">Página inicial</Link>
            <Link href="/admin/login" className="inline-flex min-h-11 items-center font-semibold hover:text-foreground">Acesso administrativo</Link>
          </div>
        </section>
      </div>
    </main>
  )
}

function LoginBenefit({ icon: Icon, text }: { icon: typeof MapPinned; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm font-semibold">
      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-help-night dark:text-white">
        <Icon className="size-4" />
      </span>
      {text}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  orange = false,
  children,
}: {
  active: boolean
  onClick: () => void
  orange?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-lg px-2 transition ${
        active
          ? orange ? 'bg-[#FFA500] text-black shadow-sm' : 'bg-[#00BFFF] text-black shadow-sm'
          : 'text-muted-foreground hover:bg-card hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function ConsentCheckbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-[#00BFFF]" />
      <span>{children}</span>
    </label>
  )
}

function Field({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <div className="[&_input]:h-11 [&_input]:rounded-xl [&_input]:pl-9">{children}</div>
      </div>
    </label>
  )
}
