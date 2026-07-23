'use client'

import { Clock3, Home, MapPinned, RefreshCcw, UserRound } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'

export function RescueAppShell({
  roleLabel,
  userName,
  connected,
  onRefresh,
  accent = 'blue',
  children,
}: {
  roleLabel: string
  userName: string
  connected: boolean
  onRefresh: () => void
  accent?: 'blue' | 'orange'
  children: React.ReactNode
}) {
  const accentClass = accent === 'orange' ? 'text-help-orange' : 'text-help-blue'

  return (
    <div className="hb-app pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8">
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-[7.25rem] shrink-0" />
            <div className="min-w-0 border-l border-border pl-3">
              <p className={`text-[11px] font-extrabold uppercase ${accentClass}`}>{roleLabel}</p>
              <p className="truncate text-sm font-bold text-foreground">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold sm:inline-flex ${
                connected
                  ? 'border-[#24C278]/30 bg-[#24C278]/10 text-[#24C278]'
                  : 'border-[#FFA500]/35 bg-[#FFA500]/10 text-[#FFA500]'
              }`}
            >
              <span className={`size-2 rounded-full ${connected ? 'bg-[#24C278]' : 'bg-[#FFA500]'}`} />
              {connected ? 'Tempo real ativo' : 'Reconectando'}
            </span>
            <ThemeToggle compact />
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:border-help-blue hover:bg-secondary"
              aria-label="Atualizar painel"
              title="Atualizar painel"
            >
              <RefreshCcw className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
        {children}
      </main>

      <nav className="hb-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 pt-2 backdrop-blur-xl md:hidden" aria-label="Navegação do painel">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <NavItem href="#inicio" icon={Home} label="Início" />
          <NavItem href="#atendimento" icon={MapPinned} label="Atendimento" />
          <NavItem href="#historico" icon={Clock3} label="Histórico" />
          <NavItem href="#perfil" icon={UserRound} label="Perfil" />
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Home
  label: string
}) {
  return (
    <a
      href={href}
      className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-muted-foreground transition hover:bg-secondary hover:text-help-night dark:hover:text-white"
    >
      <Icon className="size-4" />
      {label}
    </a>
  )
}
