'use client'

import { useState, useEffect } from 'react'
import { Settings, Volume2, VolumeX, Moon, Sun, Bell, BellOff, Shield, Trash2, Info, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTheme } from 'next-themes'

export function SettingsView({ soundEnabled, onToggleSound }: { soundEnabled: boolean; onToggleSound: () => void }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [clearHistoryFlash, setClearHistoryFlash] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const savedNotif = typeof window !== 'undefined' ? localStorage.getItem('socorroja:notif') : null
    if (savedNotif !== null) setNotifEnabled(savedNotif === 'true')
  }, [])

  const toggleNotif = (v: boolean) => {
    setNotifEnabled(v)
    if (typeof window !== 'undefined') localStorage.setItem('socorroja:notif', String(v))
  }

  const handleClearHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('socorroja:history')
      localStorage.removeItem('socorroja:favorites')
    }
    setClearHistoryFlash(true)
    setTimeout(() => setClearHistoryFlash(false), 2500)
  }

  if (!mounted) return null

  return (
    <div className="space-y-4">
      {/* Settings header */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-slate-300">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Configurações</p>
          <p className="text-[11px] text-slate-400">Personalize sua experiência</p>
        </div>
      </div>

      {/* Sound setting */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${soundEnabled ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Notificações sonoras</p>
              <p className="text-[10px] text-slate-400">Tocar som ao receber chamadas e atualizações</p>
            </div>
          </div>
          <Switch checked={soundEnabled} onCheckedChange={onToggleSound} />
        </div>
      </div>

      {/* Theme setting */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-amber-500/20 text-amber-400'}`}>
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Tema</p>
              <p className="text-[10px] text-slate-400">Alternar entre modo escuro e claro</p>
            </div>
          </div>
          <div className="flex gap-1 rounded-full border border-slate-700 bg-slate-800/50 p-0.5">
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                theme === 'dark' ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`}
            >
              <Moon className="h-3 w-3" /> Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                theme === 'light' ? 'bg-slate-200 text-slate-900' : 'text-slate-400'
              }`}
            >
              <Sun className="h-3 w-3" /> Light
            </button>
          </div>
        </div>
      </div>

      {/* Notifications setting */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${notifEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
              {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Notificações visuais (toasts)</p>
              <p className="text-[10px] text-slate-400">Exibir toasts no topo da tela</p>
            </div>
          </div>
          <Switch checked={notifEnabled} onCheckedChange={toggleNotif} />
        </div>
      </div>

      {/* Privacy / Data */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4 text-sky-400" />
          <p className="text-xs font-bold text-white">Privacidade e dados</p>
        </div>
        <p className="mb-3 text-[10px] text-slate-400">
          Seus dados (histórico, favoritos, configurações) são armazenados localmente no seu navegador.
          Eles não são enviados para servidores externos.
        </p>
        <Button
          onClick={handleClearHistory}
          variant="outline"
          className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {clearHistoryFlash ? 'Dados limpos!' : 'Limpar histórico e favoritos'}
        </Button>
      </div>

      {/* About */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Sobre o SocorroJá</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Plataforma de auto socorro por aplicativo. Versão demo 1.0 — protótipo funcional
              com WebSocket em tempo real, multi-prestador, fidelidade, chat e mais.
            </p>
            <div className="mt-2 flex items-center gap-3 text-[9px] text-slate-500">
              <span>Next.js 16</span>
              <span>·</span>
              <span>Socket.IO</span>
              <span>·</span>
              <span>Tailwind CSS</span>
              <span>·</span>
              <span>Framer Motion</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
