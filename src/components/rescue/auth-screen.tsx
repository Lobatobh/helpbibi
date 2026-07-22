'use client'

import { useState } from 'react'
import { Mail, Lock, User, Phone, Car, MapPin, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'register-client' | 'register-provider'

type AuthUser = {
  id: string; name: string; email: string; phone: string | null
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN'
  clientProfile: { id: string } | null
  providerProfile: { id: string; vehicle: string; plate: string; isVerified: boolean; isAvailable: boolean } | null
  loyaltyAccount: { points: number; tier: string } | null
}

export function AuthScreen({
  onDemo,
  onLogin,
  onRegisterClient,
  onRegisterProvider,
}: {
  onDemo: () => void
  onLogin: (email: string, password: string) => Promise<AuthUser>
  onRegisterClient: (data: { name: string; email: string; phone?: string; password: string }) => Promise<AuthUser>
  onRegisterProvider: (data: { name: string; email: string; phone?: string; password: string; vehicle: string; plate: string; city?: string }) => Promise<AuthUser>
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [plate, setPlate] = useState('')
  const [city, setCity] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await onLogin(email, password)
      } else if (mode === 'register-client') {
        await onRegisterClient({ name, email, phone, password })
      } else {
        await onRegisterProvider({ name, email, phone, password, vehicle, plate, city })
      }
      // Success — parent will handle state change
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const modeTitle = mode === 'login' ? 'Entrar' : mode === 'register-client' ? 'Criar conta — Cliente' : 'Criar conta — Prestador'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/logo-help-bibi.png" alt="Help Bibi" className="h-14 w-auto rounded-lg" />
        <p className="text-sm font-bold text-white">Help Bibi</p>
        <p className="text-[10px] text-slate-400">Socorro veicular em minutos</p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
          <button onClick={() => setMode('login')} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${mode === 'login' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}>Entrar</button>
          <button onClick={() => setMode('register-client')} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${mode === 'register-client' ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}>Cliente</button>
          <button onClick={() => setMode('register-provider')} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${mode === 'register-provider' ? 'bg-orange-500 text-slate-950' : 'text-slate-400'}`}>Prestador</button>
        </div>

        <h2 className="mb-4 text-center text-lg font-bold text-white">{modeTitle}</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode !== 'login' && (
            <div>
              <Label className="mb-1 block text-xs text-slate-400">Nome</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="border-slate-700 bg-slate-950 pl-9 text-white" required />
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-slate-400">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="border-slate-700 bg-slate-950 pl-9 text-white" required />
            </div>
          </div>

          {mode !== 'login' && (
            <div>
              <Label className="mb-1 block text-xs text-slate-400">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="border-slate-700 bg-slate-950 pl-9 text-white" />
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-slate-400">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 10 caracteres" minLength={10} maxLength={128} className="border-slate-700 bg-slate-950 pl-9 text-white" required />
            </div>
          </div>

          {mode === 'register-provider' && (
            <>
              <div>
                <Label className="mb-1 block text-xs text-slate-400">Veículo</Label>
                <div className="relative">
                  <Car className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Ex: Guincho Plataforma" className="border-slate-700 bg-slate-950 pl-9 text-white" required />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-400">Placa</Label>
                <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC1D23" className="border-slate-700 bg-slate-950 uppercase text-white" required />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-400">Cidade/Base</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: São Paulo" className="border-slate-700 bg-slate-950 pl-9 text-white" />
                </div>
              </div>
            </>
          )}

          {error && <p className="text-center text-xs text-rose-400">{error}</p>}

          <Button type="submit" disabled={loading} className={`w-full py-4 text-sm font-bold text-slate-950 ${mode === 'register-provider' ? 'bg-orange-500 hover:bg-orange-400' : 'bg-sky-500 hover:bg-sky-400'}`}>
            {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (<>{mode === 'login' ? 'Entrar' : 'Criar conta'}<ArrowRight className="ml-2 inline h-4 w-4" /></>)}
          </Button>
        </form>

        <div className="mt-4 border-t border-slate-800 pt-4">
          <button onClick={onDemo} className="w-full rounded-lg border border-slate-700 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white">
            Usar modo demo (sem cadastro)
          </button>
        </div>
      </div>
    </div>
  )
}
