'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Quote,
  CreditCard,
  Battery,
  Fuel,
  Key,
  Wrench,
  CircleDot,
  HelpCircle,
  Plus,
  Minus,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ClientPanel } from '@/components/rescue/client-panel'
import { ProviderPanel } from '@/components/rescue/provider-panel'
import { Leaderboard } from '@/components/rescue/leaderboard'
import { ThemeToggle } from '@/components/theme-toggle'
import { AnimatedCounter } from '@/components/rescue/animated-counter'
import { PublicTracking } from '@/components/rescue/public-tracking'

export default function Home() {
  const [demoOpen, setDemoOpen] = useState(false)
  const [trackId, setTrackId] = useState<string | null>(null)

  useEffect(() => {
    // Check for ?track= param in URL for public tracking view
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const track = params.get('track')
      if (track) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTrackId(track)
      }
    }
  }, [])

  // If track ID is present, render public tracking page instead of landing
  if (trackId) {
    return <PublicTracking serviceId={trackId} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/logo-help-bibi.png" alt="Help Bibi" className="h-10 w-auto rounded-lg" />
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight">Help Bibi</p>
              <p className="text-[10px] text-slate-400">auto socorro por aplicativo</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#precos" className="hover:text-white">Preços</a>
            <a href="#ranking" className="hover:text-white">Ranking</a>
            <a href="#depoimentos" className="hover:text-white">Depoimentos</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="#demo" className="hover:text-white">Demo ao vivo</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              Ver demo
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* glow background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[120px]" />
          <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-orange-500/15 blur-[120px]" />
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge className="mb-4 border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/10">
                <Sparkles className="mr-1 h-3 w-3" /> Plataforma estilo Uber para socorro veicular
              </Badge>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Socorro veicular
              <span className="block bg-gradient-to-r from-sky-300 via-sky-400 to-sky-500 bg-clip-text text-transparent">
                em minutos
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg"
            >
              Seguro, rastreável e sem burocracia. O cliente solicita, acompanha a chegada em tempo
              real e segue o serviço até o destino final. O prestador mais próximo recebe a chamada,
              confere o valor e atende — tudo pelo app.
            </motion.p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-sky-500 px-7 py-6 text-base font-bold text-slate-950 hover:bg-sky-400"
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
                <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> Prestadores verificados
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-sky-400" /> Atendimento 24h
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-sky-400" /> Pagamento protegido
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-sky-400" /> Avaliação média 4.9
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
            <Stat icon={Users} value="12k+" label="Clientes ativos" numeric={12000} suffix="+" />
            <Stat icon={Truck} value="850+" label="Prestadores" numeric={850} suffix="+" />
            <Stat icon={Clock} value="8 min" label="Tempo médio" numeric={8} suffix=" min" />
            <Stat icon={MapPin} value="24h" label="Cobertura" numeric={24} suffix="h" />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHead
          eyebrow="Fluxo simples"
          title="Como funciona o Help Bibi"
          subtitle="Da solicitação ao destino final, tudo rastreado em tempo real — cliente e prestador na mesma página."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <RevealSection delay={0}>
            <StepCard
              n="01"
              icon={Zap}
              title="Cliente solicita"
              desc="Escolhe o tipo de socorro (reboque, pneu, bateria...), informa local e destino. O preço é calculado na hora."
              color="sky"
            />
          </RevealSection>
          <RevealSection delay={0.1}>
            <StepCard
              n="02"
              icon={Navigation}
              title="Prestador mais próximo recebe"
              desc="O sistema localiza o prestador mais próximo e envia a chamada. Ele confere o valor, distância e dá o aceite."
              color="orange"
            />
          </RevealSection>
          <RevealSection delay={0.2}>
            <StepCard
              n="03"
              icon={MapPin}
              title="Acompanhamento em tempo real"
              desc="Cliente acompanha a chegada e o trajeto até o destino final. Pagamento liberado ao concluir o serviço."
              color="sky"
            />
          </RevealSection>
        </div>
      </section>

      {/* PARA CLIENTES / PRESTADORES */}
      <section className="border-y border-slate-800 bg-slate-900/30">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <FeatureColumn
            tag="Para clientes"
            tagColor="sky"
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
            tagColor="orange"
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

      {/* PREÇOS TRANSPARENTES */}
      <section id="precos" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHead
          eyebrow="Tabela transparente"
          title="Preços justos, sem surpresas"
          subtitle="O valor é calculado antes de você confirmar. Veja a base por tipo de serviço — a tarifa final adiciona R$ 4,50 por km até o destino."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PriceCard icon={Truck} name="Reboque / Guincho" base="R$ 180" desc="Veículo imobilizado, necessita guincho" featured />
          <PriceCard icon={CircleDot} name="Troca de Pneu" base="R$ 90" desc="Furou ou rasgou no caminho" />
          <PriceCard icon={Battery} name="Carga de Bateria" base="R$ 70" desc="Bateria arriou, não dá partida" />
          <PriceCard icon={Fuel} name="Combustível" base="R$ 60" desc="Pane seca, combustível na hora" />
          <PriceCard icon={Key} name="Chaveiro" base="R$ 120" desc="Trancou as chaves no carro" />
          <PriceCard icon={Wrench} name="Pane Mecânica" base="R$ 110" desc="Outro problema mecânico" />
        </div>
        <div className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-center text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-sky-400" /> PIX, cartão ou dinheiro</span>
          <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-orange-400" /> Pagamento protegido</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-sky-400" /> +R$ 4,50/km até destino</span>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section id="depoimentos" className="border-y border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <SectionHead
            eyebrow="Quem usa, aprova"
            title="Motoristas e prestadores satisfeitos"
            subtitle="Mais de 12 mil motoristas já foram socorridos. Veja o que dizem."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Testimonial
              name="Ricardo Almeida"
              role="Motorista · São Paulo"
              initials="RA"
              text="Furou o pneu na Marginal no horário de pico. Em 9 minutos o guincho chegou. Pagamento no PIX, sem dor de cabeça."
              stars={5}
            />
            <Testimonial
              name="Fernanda Souza"
              role="Motorista · Guarulhos"
              initials="FS"
              text="Bateria arriou no estacionamento de casa. O app mostrou o prestador chegando no mapa em tempo real. Sensacional."
              stars={5}
            />
            <Testimonial
              name="Marcos Pereira"
              role="Prestador · Guincho"
              initials="MP"
              text="Como prestador, consigo ver o valor e o destino antes de aceitar. Em 3 meses virei minha principal renda. Recomendo."
              stars={5}
              color="orange"
            />
          </div>
        </div>
      </section>

      {/* LEADERBOARD */}
      <section id="ranking" className="border-y border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-24">
          <SectionHead
            eyebrow="Ranking ao vivo"
            title="Top prestadores Help Bibi"
            subtitle="Ranking em tempo real dos prestadores mais ativos. Atualiza automaticamente conforme serviços são concluídos."
          />
          <div className="mt-10">
            <Leaderboard />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHead
          eyebrow="Dúvidas frequentes"
          title="Perguntas e respostas"
          subtitle="Tudo o que você precisa saber antes de usar o Help Bibi."
        />
        <div className="mt-10 space-y-3">
          <FaqItem q="Como o prestador mais próximo é escolhido?" a="Calculamos a distância em linha reta (haversine) entre cada prestador online e o local do atendimento. O mais próximo recebe a chamada primeiro; se não responder em 12 segundos, reofertamos automaticamente ao próximo." />
          <FaqItem q="O preço é fixo ou varia?" a="O valor é calculado antes de você confirmar: tarifa base por tipo de serviço + R$ 4,50 por km até o destino. Você vê o valor total antes de solicitar. Sem surpresas." />
          <FaqItem q="Quais formas de pagamento aceito?" a="PIX (aprovação na hora), cartão de crédito ou débito, e dinheiro na entrega. O pagamento só é liberado ao prestador após a conclusão do serviço." />
          <FaqItem q="Posso cancelar uma solicitação?" a="Sim, a qualquer momento antes da conclusão. Se o prestador já estiver a caminho, o cancelamento é registrado no histórico mas sem cobrança." />
          <FaqItem q="Como funcionam as avaliações?" a="Após concluir o serviço, o cliente avalia o prestador de 1 a 5 estrelas e pode deixar um comentário. A nota média fica visível para todos e ajuda a manter a qualidade." />
          <FaqItem q="Como me torno prestador?" a="Basta se cadastrar no app como prestador com nome, veículo e placa. Receba chamadas próximas, aceite as que quiser, e ganhe por serviço concluído." />
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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400">
              <Zap className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-bold">Pronto para começar?</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Abra os dois painéis lado a lado, registre-se como cliente e como prestador, e faça uma
              solicitação para ver o fluxo completo em tempo real.
            </p>
            <Button
              onClick={() => setDemoOpen(true)}
              className="mt-5 bg-sky-500 px-6 py-5 text-sm font-bold text-slate-950 hover:bg-sky-400"
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
            Junte-se a milhares de motoristas e prestadores que já usam o Help Bibi para resolver
            imprevistos na estrada com agilidade e segurança.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => { window.location.href = '/login' }}
              className="bg-sky-500 px-7 py-6 text-base font-bold text-slate-950 hover:bg-sky-400"
            >
              <Shield className="mr-2 h-5 w-5" /> Sou cliente
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => { window.location.href = '/login' }}
              className="border-orange-600 bg-orange-600/10 px-7 py-6 text-base font-bold text-orange-400 hover:bg-orange-600/20"
            >
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
                <img src="/logo-help-bibi.png" alt="Help Bibi" className="h-8 w-auto rounded-md" />
                <p className="text-sm font-extrabold">Help Bibi</p>
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
            <p>© 2025 Help Bibi · Protótipo demonstrativo</p>
            <p>Feito com Next.js + Socket.IO · Tempo real</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ---------------- sub components ---------------- */

function Stat({ icon: Icon, value, label, numeric, suffix }: { icon: any; value: string; label: string; numeric?: number; suffix?: string }) {
  return (
    <div className="px-4 py-5 text-center">
      <Icon className="mx-auto mb-1.5 h-5 w-5 text-sky-400" />
      <p className="text-2xl font-extrabold text-white">
        {numeric !== undefined ? <AnimatedCounter value={numeric} suffix={suffix} /> : value}
      </p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 text-slate-400">{subtitle}</p>
    </motion.div>
  )
}

function RevealSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
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
  color: 'sky' | 'orange' | 'sky'
}) {
  const colorMap = {
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-400 border-sky-500/30',
    orange: 'from-orange-500/20 to-orange-500/5 text-orange-400 border-orange-500/30',
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
  tagColor: 'sky' | 'orange'
  title: string
  features: { icon: any; title: string; desc: string }[]
}) {
  const cm = tagColor === 'sky' ? 'border-sky-500/40 bg-sky-500/10 text-sky-400' : 'border-orange-500/40 bg-orange-500/10 text-orange-400'
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
            <a href={footerHref(l)} className="text-xs text-slate-400 hover:text-white">{l}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function footerHref(label: string) {
  if (label === 'Termos') return '/termos'
  if (label === 'Privacidade') return '/privacidade'
  if (label === 'Para clientes' || label === 'Para prestadores') return '/login'
  return '/'
}

function HeroPhoneMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-sky-500/20 via-transparent to-orange-500/20 blur-2xl" />
      <div className="relative mx-auto h-[560px] w-[280px] rounded-[2.5rem] border-[8px] border-slate-800 bg-slate-950 shadow-2xl">
        {/* notch */}
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-800" />
        <div className="flex h-full flex-col p-3 pt-8">
          {/* mini header */}
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-md bg-sky-500" />
              <span className="text-[11px] font-bold">Help Bibi</span>
            </div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
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
              <div className="absolute -inset-3 animate-ping rounded-full bg-sky-400/40" />
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-slate-950">
                <MapPin className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="absolute right-6 top-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-orange-300 bg-orange-500 text-white">
              <Truck className="h-3 w-3" />
            </div>
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <line x1="33%" y1="50%" x2="75%" y2="20%" stroke="#FFA500" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
          {/* card */}
          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                JM
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold">João Mecânico</p>
                <p className="text-[9px] text-slate-400">Guincho · ABC1D23</p>
              </div>
              <div className="flex items-center gap-0.5 text-sky-400">
                <Star className="h-2.5 w-2.5" fill="currentColor" />
                <span className="text-[9px] font-bold">4.9</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">ETA</p>
                <p className="text-[10px] font-bold text-orange-400">8 min</p>
              </div>
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">DIST</p>
                <p className="text-[10px] font-bold">3.2km</p>
              </div>
              <div className="rounded bg-slate-800/60 py-1">
                <p className="text-[8px] text-slate-500">VALOR</p>
                <p className="text-[10px] font-bold text-sky-400">R$180</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoLive() {
  const [showSecondProvider, setShowSecondProvider] = useState(false)
  return (
    <div className="mt-10">
      <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-orange-400" />
          Demo em tempo real via WebSocket
        </div>
        <button
          onClick={() => setShowSecondProvider((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/20"
        >
          <Users className="h-3.5 w-3.5" />
          {showSecondProvider ? 'Ocultar 2º prestador' : 'Adicionar 2º prestador'}
        </button>
      </div>
      <div className={`grid gap-8 ${showSecondProvider ? 'xl:grid-cols-3 lg:grid-cols-2' : 'lg:grid-cols-2'}`}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <PhoneFrame label="App do Cliente" color="sky">
            <ClientPanel />
          </PhoneFrame>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <PhoneFrame label="App do Prestador 1" color="orange">
            <ProviderPanel />
          </PhoneFrame>
        </motion.div>
        <AnimatePresence>
          {showSecondProvider && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 30 }}
              transition={{ duration: 0.4 }}
            >
              <PhoneFrame label="App do Prestador 2" color="orange">
                <ProviderPanel />
              </PhoneFrame>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-500">
        Dica: registre-se nos painéis. No app do cliente, solicite um serviço — os prestadores
        receberão a chamada simultaneamente. O primeiro a aceitar leva! {showSecondProvider && 'Com 2 prestadores, você verá a competição em tempo real.'}
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
  color: 'sky' | 'orange'
  children: React.ReactNode
}) {
  const cm = color === 'sky' ? 'from-sky-500/20 text-sky-400' : 'from-orange-500/20 text-orange-400'
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color === 'sky' ? 'bg-sky-500' : 'bg-orange-500'}`} />
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

function PriceCard({ icon: Icon, name, base, desc, featured }: { icon: any; name: string; base: string; desc: string; featured?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 transition hover:-translate-y-0.5 ${
        featured
          ? 'border-sky-500/50 bg-gradient-to-br from-sky-500/10 to-slate-900/40 shadow-lg shadow-sky-500/10'
          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      {featured && (
        <span className="absolute right-3 top-3 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-slate-950">
          MAIS PEDIDO
        </span>
      )}
      <div
        className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
          featured ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-300'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-white">{name}</p>
      <p className="mt-2 text-2xl font-extrabold text-white">
        {base}
        <span className="ml-1 text-xs font-normal text-slate-500">base</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">{desc}</p>
    </div>
  )
}

function Testimonial({
  name, role, initials, text, stars, color = 'sky',
}: {
  name: string; role: string; initials: string; text: string; stars: number; color?: 'sky' | 'orange'
}) {
  const grad = color === 'sky' ? 'from-sky-500 to-sky-700' : 'from-orange-500 to-orange-700'
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <Quote className="absolute -right-2 -top-2 h-16 w-16 text-slate-800/60" />
      <div className="relative">
        <div className="mb-3 flex gap-0.5">
          {Array.from({ length: stars }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 text-sky-400" fill="currentColor" />
          ))}
        </div>
        <p className="text-sm leading-relaxed text-slate-200">&ldquo;{text}&rdquo;</p>
        <div className="mt-4 flex items-center gap-3">
          <Avatar className={`h-9 w-9 bg-gradient-to-br ${grad}`}>
            <AvatarFallback className="bg-transparent text-xs font-bold text-white">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-bold text-white">{name}</p>
            <p className="text-[11px] text-slate-400">{role}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-900/60"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <HelpCircle className="h-4 w-4 shrink-0 text-sky-400" />
          {q}
        </span>
        <span className={`shrink-0 rounded-full bg-slate-800 p-1 text-slate-300 transition ${open ? 'rotate-180' : ''}`}>
          {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 py-3 text-sm leading-relaxed text-slate-400">
          {a}
        </div>
      )}
    </div>
  )
}
