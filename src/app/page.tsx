'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  MapPinned,
  Menu,
  MessageCircleMore,
  Navigation,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { ClientPanel } from '@/components/rescue/client-panel'
import { ProviderPanel } from '@/components/rescue/provider-panel'
import { PublicTracking } from '@/components/rescue/public-tracking'

const navItems = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#clientes', label: 'Para clientes' },
  { href: '#prestadores', label: 'Para prestadores' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#ajuda', label: 'Ajuda' },
]

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [trackId, setTrackId] = useState<string | null>(null)

  useEffect(() => {
    const track = new URLSearchParams(window.location.search).get('track')
    if (track) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrackId(track)
    }
  }, [])

  if (trackId) return <PublicTracking token={trackId} />

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Help Bibi — início">
            <BrandLogo priority className="h-11 w-[8.5rem] sm:w-[10rem]" />
          </Link>

          <nav className="hidden items-center gap-5 lg:flex" aria-label="Navegação principal">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="hb-primary-button hidden min-h-11 px-4 py-2 sm:inline-flex">
              Entrar
              <ArrowRight className="size-4" />
            </Link>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card lg:hidden"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="border-t border-border bg-card px-4 py-4 lg:hidden" aria-label="Navegação móvel">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-secondary"
                >
                  {item.label}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </a>
              ))}
              <Link href="/login" className="hb-primary-button mt-2">Entrar</Link>
            </div>
          </nav>
        ) : null}
      </header>

      <main>
        <section className="relative min-h-[72svh] overflow-hidden bg-[#073B5D] text-white">
          <Image
            src="/helpbibi-hero.webp"
            alt="Operador de socorro veicular carregando um automóvel em uma plataforma de reboque"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[64%_center]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.82)_0%,rgba(7,59,93,.68)_42%,rgba(7,59,93,.12)_75%)] dark:bg-[linear-gradient(90deg,rgba(0,0,0,.92)_0%,rgba(0,0,0,.68)_46%,rgba(0,0,0,.24)_78%)]" />
          <div className="relative mx-auto flex min-h-[72svh] max-w-7xl items-center px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 text-xs font-extrabold uppercase text-[#E8F8FF]">
                <Sparkles className="size-4 text-[#FFA500]" />
                Socorro veicular conectado
              </p>
              <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
                Socorro rápido quando você mais precisa.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/78 sm:text-lg">
                Solicite atendimento, acompanhe cada etapa e fale com o prestador em uma experiência clara e segura.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="hb-primary-button">
                  Pedir socorro
                  <ArrowRight className="size-5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.875rem] border border-white/35 bg-black/25 px-5 font-extrabold text-white backdrop-blur transition hover:border-[#FFA500] hover:bg-black/45"
                >
                  Seja um prestador
                  <Truck className="size-5 text-[#FFA500]" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card" aria-label="Recursos disponíveis">
          <div className="mx-auto grid max-w-7xl gap-px bg-border sm:grid-cols-3">
            <Capability icon={MapPinned} title="Localização real" text="Origem e acompanhamento com dados do atendimento." />
            <Capability icon={BadgeCheck} title="Prestadores aprovados" text="A operação exige análise administrativa." />
            <Capability icon={MessageCircleMore} title="Contato durante o serviço" text="Status e conversa reunidos no mesmo fluxo." />
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              kicker="Como funciona"
              title="Da solicitação à conclusão, sem perder o contexto."
              text="Quatro etapas conectam cliente, prestador e acompanhamento operacional."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Step number="01" icon={MapPinned} title="Informe o local" text="Autorize o GPS e descreva o tipo de socorro necessário." />
              <Step number="02" icon={Navigation} title="Encontre atendimento" text="Prestadores aprovados e disponíveis podem receber a solicitação." />
              <Step number="03" icon={Truck} title="Acompanhe o serviço" text="Veja o status, converse e compartilhe o tracking quando disponível." />
              <Step number="04" icon={Star} title="Conclua e avalie" text="O histórico preserva atendimento, pagamento simulado e avaliações." />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
            <AudienceSection
              id="clientes"
              kicker="Para clientes"
              title="Ajuda organizada do primeiro pedido ao histórico."
              text="A área do cliente concentra localização, solicitação, acompanhamento, chat e avaliação."
              icon={UserRoundCheck}
              features={['Solicitação com localização real', 'Status e prestador no mesmo painel', 'Histórico recuperado após novo acesso']}
            />
            <AudienceSection
              id="prestadores"
              kicker="Para prestadores"
              title="Operação clara para decidir e atender com segurança."
              text="Disponibilidade, ofertas e progressão do atendimento ficam visíveis em uma interface mobile-first."
              icon={Truck}
              features={['Aprovação obrigatória antes de operar', 'Oferta com dados persistidos do serviço', 'Fluxo de aceite, chegada, início e conclusão']}
              orange
            />
          </div>
        </section>

        <section id="seguranca" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                kicker="Confiança"
                title="Controles que acompanham a operação."
                text="Sem selos ou parceiros não homologados: a confiança vem das regras aplicadas pela própria plataforma."
              />
              <div className="mt-7 space-y-3">
                <TrustRow icon={ShieldCheck} text="Acesso separado por perfil e rotas protegidas." />
                <TrustRow icon={LockKeyhole} text="Tracking público por link revogável, sem usar o ID do serviço." />
                <TrustRow icon={CheckCircle2} text="Prestadores pendentes ou suspensos não entram no matching." />
              </div>
            </div>

            <figure className="relative aspect-video overflow-hidden rounded-[1.25rem] border border-border bg-[#073B5D] shadow-[var(--hb-shadow)]" data-video-container>
              <Image
                src="/helpbibi-hero.webp"
                alt="Atendimento profissional de socorro veicular"
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-black/18" />
              <figcaption className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/20 bg-black/55 px-4 py-3 text-sm font-semibold text-white backdrop-blur">
                Atendimento profissional, com o veículo e a operação sempre visíveis.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="demo" className="border-y border-border bg-secondary/55 px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                kicker="Demonstração pública"
                title="Explore o fluxo visual sem acessar contas reais."
                text="O ambiente demonstrativo permanece isolado do fluxo autenticado e dos prestadores operacionais."
              />
              {!demoOpen ? (
                <button type="button" onClick={() => setDemoOpen(true)} className="hb-primary-button shrink-0">
                  Abrir demonstração
                  <ArrowRight className="size-4" />
                </button>
              ) : null}
            </div>
            {demoOpen ? <DemoLive /> : null}
          </div>
        </section>

        <section id="ajuda" className="scroll-mt-20 bg-[#073B5D] px-4 py-14 text-white sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase text-[#00BFFF]">Ajuda e acesso</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-extrabold">Entre na plataforma para continuar com seu perfil.</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="hb-primary-button">Acessar Help Bibi</Link>
              <a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center rounded-[0.875rem] border border-white/25 px-5 font-bold hover:border-white/60">
                Rever como funciona
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <BrandLogo className="h-14 w-[11rem]" />
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Plataforma de conexão para atendimento de socorro veicular.
            </p>
          </div>
          <FooterLinks title="Essencial" links={[['Como funciona', '#como-funciona'], ['Para clientes', '#clientes'], ['Para prestadores', '#prestadores']]} />
          <FooterLinks title="Legal" links={[['Termos', '/termos'], ['Privacidade', '/privacidade']]} />
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-border pt-5 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Help Bibi. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  )
}

function Capability({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex min-h-32 items-start gap-3 bg-card px-5 py-6 sm:px-7">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-help-night dark:text-white">
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="text-sm font-extrabold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

function SectionHeading({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="max-w-2xl">
      <p className="hb-kicker">{kicker}</p>
      <h2 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{text}</p>
    </div>
  )
}

function Step({ number, icon: Icon, title, text }: { number: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="hb-card-flat flex min-h-60 flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-help-night dark:text-white">
          <Icon className="size-5" />
        </span>
        <span className="text-sm font-black text-help-blue">{number}</span>
      </div>
      <h3 className="mt-auto pt-8 text-lg font-extrabold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  )
}

function AudienceSection({
  id,
  kicker,
  title,
  text,
  icon: Icon,
  features,
  orange = false,
}: {
  id: string
  kicker: string
  title: string
  text: string
  icon: LucideIcon
  features: string[]
  orange?: boolean
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border px-4 py-14 sm:px-8 lg:border-b-0 lg:border-r lg:px-12 lg:py-20 last:border-r-0">
      <span className={`flex size-12 items-center justify-center rounded-xl ${orange ? 'bg-[#FFA500] text-black' : 'bg-[#00BFFF] text-black'}`}>
        <Icon className="size-6" />
      </span>
      <p className="hb-kicker mt-7">{kicker}</p>
      <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p>
      <ul className="mt-7 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm font-semibold">
            <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${orange ? 'text-help-orange' : 'text-help-blue'}`} />
            {feature}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TrustRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="hb-card-flat flex items-start gap-3 p-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-help-success" />
      <p className="text-sm font-semibold leading-6">{text}</p>
    </div>
  )
}

function DemoLive() {
  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-2">
      <PhoneFrame label="Cliente" accent="blue">
        <ClientPanel />
      </PhoneFrame>
      <PhoneFrame label="Prestador" accent="orange">
        <ProviderPanel />
      </PhoneFrame>
    </div>
  )
}

function PhoneFrame({
  label,
  accent,
  children,
}: {
  label: string
  accent: 'blue' | 'orange'
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">
        <span className={`size-2 rounded-full ${accent === 'orange' ? 'bg-help-orange' : 'bg-help-blue'}`} />
        App do {label}
      </div>
      <div className="helpbibi-app relative h-[740px] w-full max-w-[390px] overflow-hidden rounded-[2rem] border-[8px] border-[#1F2933] bg-background shadow-[var(--hb-shadow)]">
        <div className="h-full">{children}</div>
      </div>
    </div>
  )
}

function FooterLinks({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <p className="text-sm font-extrabold">{title}</p>
      <ul className="mt-3 space-y-1">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition hover:text-foreground">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
