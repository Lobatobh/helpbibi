'use client'

import { useState } from 'react'
import {
  Shield,
  Truck,
  MapPin,
  Clock,
  Star,
  Wallet,
  Users,
  Zap,
  Navigation,
  Phone,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Gauge,
  Lock,
  Headphones,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClientPanel } from '@/components/rescue/client-panel'
import { ProviderPanel } from '@/components/rescue/provider-panel'

export default function Home() {
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20">
              <Shield className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight">SocorroJá</p>
              <p className="text-[10px] text-slate-400">auto socorro por aplicativo</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#para-clientes" className="hover:text-white">Para clientes</a>
            <a href="#para-prestadores" className="hover:text-white">Para prestadores</a>
            <a href="#demo" className="hover:text-white">Demo ao vivo</a>
          </nav>
          <Button
            onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            Ver demo
          </Button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* glow background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
          <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-emerald-500/15 blur-[120px]" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-[100px]" />
        </div>
        {/* grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-2 lg:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/10">
              <Sparkles className="mr-1 h-3 w-3" /> Plataforma estilo Uber para socorro veicular
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Socorro automotivo
              <span className="block bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                na palma da mão
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              O cliente solicita, acompanha a chegada em tempo real e segue o serviço até o destino
              final. O prestador mais próximo recebe a chamada, confere o valor e atende — tudo pelo app.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-amber-500 px-7 py-6 text-base font-bold text-slate-950 hover:bg-amber-400"
              >
                Experimentar a demo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
                className="border-slate-700 bg-slate-900/50 px-7 py-6 text-base text-white hover:bg-slate-800"
              >
                Como funciona
              </Button>
            </div>

            {/* trust row */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Prestadores verificados
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" /> Atendimento 24h
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-sky-400" /> Pagamento protegido
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-400" /> Avaliação média 4.9
              </span>
            </div>
          </div>

          {/* Hero phone mock */}
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <HeroPhoneMock />
          </div>
        </div>

        {/* stats bar */}
        <div className="relative border-y border-slate-800 bg-slate-900/40">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-800 sm:grid-cols-4">
            <Stat icon={Users} value="12k+" label="Clientes ativos" />
            <Stat icon={Truck} value="850+" label="Prestadores" />
            <Stat icon={Clock} value="8 min" label="Tempo médio" />
            <Stat icon={MapPin} value="24h" label="Cobertura" />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHead
          eyebrow="Fluxo simples"
          title="Como funciona o SocorroJá"
          subtitle="Da solicitação ao destino final, tudo rastreado em tempo real — cliente e prestador na mesma página."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <StepCard
            n="01"
            icon={Zap}
            title="Cliente solicita"
            desc="Escolhe o tipo de socorro (reboque, pneu, bateria...), informa local e destino. O preço é calculado na hora."
            color="amber"
          />
          <StepCard
            n="02"
            icon={Navigation}
            title="Prestador mais próximo recebe"
            desc="O sistema localiza o prestador mais próximo e envia a chamada. Ele confere o valor, distância e dá o aceite."
            color="emerald"
          />
          <StepCard
            n="03"
            icon={MapPin}
            title="Acompanhamento em tempo real"
            desc="Cliente acompanha a chegada e o trajeto até o destino final. Pagamento liberado ao concluir o serviço."
            color="sky"
          />
        </div>
      </section>

      {/* PARA CLIENTES / PRESTADORES */}
      <section className="border-y border-slate-800 bg-slate-900/30">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <FeatureColumn
            tag="Para clientes"
            tagColor="amber"
            title="Socorro rápido, sem stress"
            features={[
              { icon: MapPin, title: 'Localização em tempo real', desc: 'Veja o prestador se aproximando no mapa.' },
              { icon: Wallet, title: 'Preço transparente', desc: 'Valor calculado antes de confirmar a solicitação.' },
              { icon: Shield, title: 'Prestadores verificados', desc: 'Documentação e avaliações checadas.' },
              { icon: Phone, title: 'Contato direto', desc: 'Ligue ou converse pelo chat dentro do app.' },
            ]}
          />
          <FeatureColumn
            tag="Para prestadores"
            tagColor="emerald"
            title="Renda extra no seu tempo"
            features={[
              { icon: Navigation, title: 'Chamadas próximas', desc: 'Receba solicitações na sua região.' },
              { icon: Gauge, title: 'Confira antes de aceitar', desc: 'Valor, distância e destino aparecem antes do aceite.' },
              { icon: Wallet, title: 'Pagamento garantido', desc: 'Receba por serviço concluído, sem burocracia.' },
              { icon: Headphones, title: 'Suporte dedicado', desc: 'Central de ajuda para prestadores 24h.' },
            ]}
          />
        </div>
      </section>

      {/* DEMO AO VIVO */}
      <section id="demo" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHead
          eyebrow="Demo interativa"
          title="Veja as duas pontas funcionando juntas"
          subtitle="Dois apps conectados em tempo real via WebSocket. Cadastre-se nos dois painéis abaixo e simule uma chamada completa — do pedido ao destino final."
        />

        {!demoOpen ? (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <Zap className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-bold">Pronto para começar?</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Abra os dois painéis lado a lado, registre-se como cliente e como prestador, e faça uma
              solicitação para ver o fluxo completo em tempo real.
            </p>
            <Button
              onClick={() => setDemoOpen(true)}
              className="mt-5 bg-amber-500 px-6 py-5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Iniciar demo ao vivo
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <DemoLive />
        )}
      </section>

      {/* CTA final */}
      <section className="border-t border-slate-800 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Leve o socorro para a palma da mão
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Junte-se a milhares de motoristas e prestadores que já usam o SocorroJá para resolver
            imprevistos na estrada com agilidade e segurança.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" className="bg-amber-500 px-7 py-6 text-base font-bold text-slate-950 hover:bg-amber-400">
              <Shield className="mr-2 h-5 w-5" /> Sou cliente
            </Button>
            <Button size="lg" variant="outline" className="border-emerald-600 bg-emerald-600/10 px-7 py-6 text-base font-bold text-emerald-400 hover:bg-emerald-600/20">
              <Truck className="mr-2 h-5 w-5" /> Quero ser prestador
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
                  <Shield className="h-4 w-4" />
                </div>
                <p className="text-sm font-extrabold">SocorroJá</p>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Plataforma de auto socorro por aplicativo. Conectando motoristas e prestadores em tempo real.
              </p>
            </div>
            <FooterCol title="Produto" links={['Como funciona', 'Para clientes', 'Para prestadores', 'Demo ao vivo']} />
            <FooterCol title="Empresa" links={['Sobre nós', 'Blog', 'Carreiras', 'Imprensa']} />
            <FooterCol title="Suporte" links={['Central de ajuda', 'Contato', 'Termos', 'Privacidade']} />
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row">
            <p>© 2025 SocorroJá · Protótipo demonstrativo</p>
            <p>Feito com Next.js + Socket.IO · Tempo real</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ---------------- sub components ---------------- */

function Stat({ icon: Icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <div className="px-4 py-5 text-center">
      <Icon className="mx-auto mb-1.5 h-5 w-5 text-amber-400" />
      <p className="text-2xl font-extrabold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">{eyebrow}</p>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 text-slate-400">{subtitle}</p>
    </div>
  )
}

function StepCard({
  n,
  icon: Icon,
  title,
  desc,
  color,
}: {
  n: string
  icon: any
  title: string
  desc: string
  color: 'amber' | 'emerald' | 'sky'
}) {
  const colorMap = {
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/30',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/30',
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-400 border-sky-500/30',
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-slate-700 hover:bg-slate-900/70">
      <div className="absolute right-4 top-3 text-5xl font-black text-slate-800/60 transition group-hover:text-slate-800">
        {n}
      </div>
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-gradient-to-br ${colorMap[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{desc}</p>
    </div>
  )
}

function FeatureColumn({
  tag,
  tagColor,
  title,
  features,
}: {
  tag: string
  tagColor: 'amber' | 'emerald'
  title: string
  features: { icon: any; title: string; desc: string }[]
}) {
  const cm = tagColor === 'amber' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
  return (
    <div>
      <Badge className={`mb-3 ${cm} hover:${cm}`}>{tag}</Badge>
      <h3 className="text-2xl font-extrabold tracking-tight">{title}</h3>
      <div className="mt-6 space-y-5">
        {features.map((f, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
              <f.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{f.title}</p>
              <p className="text-xs text-slate-400">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold text-white">{title}</p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="text-xs text-slate-400 hover:text-white">{l}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HeroPhoneMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-amber-500/20 via-transparent to-emerald-500/20 blur-2xl" />
      <div className="relative mx-auto h-[560px] w-[280px] rounded-[2.5rem] border-[8px] border-slate-800 bg-slate-950 shadow-2xl">
        {/* notch */}
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-800" />
        <div className="flex h-full flex-col p-3 pt-8">
          {/* mini header */}
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-md bg-amber-500" />
              <span className="text-[11px] font-bold">SocorroJá</span>
            </div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          </div>
          {/* map */}
          <div className="relative mt-1 flex-1 overflow-hidden rounded-2xl bg-slate-900">
            <div className="absolute inset-0 opacity-30">
              <svg width="100%" height="100%">
                <defs>
                  <pattern id="hg" width="22" height="22" patternUnits="userSpaceOnUse">
                    <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#475569" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hg)" />
              </svg>
            </div>
            <div className="absolute left-1/3 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute -inset-3 animate-ping rounded-full bg-amber-400/40" />
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950">
                <MapPin className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="absolute right-6 top-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 text-white">
              <Truck className="h-3 w-3" />
            </div>
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <line x1="33%" y1="50%" x2="75%" y2="20%" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
          {/* card */}
          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                JM
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold">João Mecânico</p>
                <p className="text-[9px] text-slate-400">Guincho · ABC1D23</p>
              </div>
              <div className="flex items-center gap-0.5 text-amber-400">
                <Star className="h-2.5 w-2.5" fill="currentColor" />
                <span className="text-[9px] font-bold">4.9</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">ETA</p>
                <p className="text-[10px] font-bold text-emerald-400">8 min</p>
              </div>
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">DIST</p>
                <p className="text-[10px] font-bold">3.2km</p>
              </div>
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">VALOR</p>
                <p className="text-[10px] font-bold text-amber-400">R$180</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoLive() {
  return (
    <div className="mt-10">
      <div className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-400">
        <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Conexão em tempo real ativa · WebSocket na porta 3003
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <PhoneFrame label="App do Cliente" color="amber">
          <ClientPanel />
        </PhoneFrame>
        <PhoneFrame label="App do Prestador" color="emerald">
          <ProviderPanel />
        </PhoneFrame>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-500">
        Dica: registre-se nos dois painéis. No app do cliente, solicite um serviço — no app do
        prestador, você verá a chamada chegar com um contador de 12s para aceitar.
      </p>
    </div>
  )
}

function PhoneFrame({
  label,
  color,
  children,
}: {
  label: string
  color: 'amber' | 'emerald'
  children: React.ReactNode
}) {
  const cm = color === 'amber' ? 'from-amber-500/20 text-amber-400' : 'from-emerald-500/20 text-emerald-400'
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <div className="relative w-full max-w-[380px]">
        <div className={`pointer-events-none absolute -inset-3 rounded-[3rem] bg-gradient-to-b ${cm} to-transparent opacity-40 blur-2xl`} />
        <div className="relative h-[760px] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-800 bg-slate-950 shadow-2xl">
          <div className="absolute left-1/2 top-2 z-50 h-5 w-28 -translate-x-1/2 rounded-full bg-slate-800" />
          <div className="h-full pt-2">{children}</div>
        </div>
      </div>
    </div>
  )
}
