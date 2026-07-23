'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={compact ? 'h-11 w-11' : 'h-12 w-[7.25rem]'} aria-hidden="true" />
  }

  const isDark = resolvedTheme === 'dark'

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:border-help-blue hover:bg-secondary"
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        title={isDark ? 'Tema claro' : 'Tema escuro'}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    )
  }

  return (
    <div className="inline-flex h-12 items-center rounded-xl border border-border bg-card p-0.5 shadow-sm" aria-label="Tema da interface">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold leading-none transition ${
          !isDark ? 'bg-help-sky text-help-night' : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={!isDark}
      >
        <Sun className="size-3.5" />
        <span className="hidden sm:inline">Claro</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold leading-none transition ${
          isDark ? 'bg-help-night text-white' : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={isDark}
      >
        <Moon className="size-3.5" />
        <span className="hidden sm:inline">Escuro</span>
      </button>
    </div>
  )
}
