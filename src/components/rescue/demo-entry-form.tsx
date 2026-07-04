'use client'

import { AlertTriangle, Loader2, Shield, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { rescueSocketStatusMessage } from '@/lib/rescue-socket-url'

type ClientEntryFormProps = {
  name: string
  connected: boolean
  connectionError: string | null
  registering?: boolean
  registrationError?: string | null
  onNameChange: (value: string) => void
  onRegister: () => void
}

type ProviderEntryFormProps = {
  name: string
  vehicle: string
  plate: string
  connected: boolean
  connectionError: string | null
  registering?: boolean
  registrationError?: string | null
  onNameChange: (value: string) => void
  onVehicleChange: (value: string) => void
  onPlateChange: (value: string) => void
  onRegister: () => void
}

function ConnectionStatus({
  connected,
  connectionError,
  registrationError,
}: {
  connected: boolean
  connectionError: string | null
  registrationError?: string | null
}) {
  const error = connectionError || registrationError
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-left text-xs text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{registrationError || rescueSocketStatusMessage({ connected: false, error })}</span>
      </p>
    )
  }

  return (
    <p className="text-xs text-slate-500">
      {rescueSocketStatusMessage({ connected })}
    </p>
  )
}

export function ClientEntryForm({
  name,
  connected,
  connectionError,
  registering = false,
  registrationError = null,
  onNameChange,
  onRegister,
}: ClientEntryFormProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="relative">
        <div className="absolute -inset-3 animate-pulse rounded-3xl bg-sky-500/20 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 text-slate-950 shadow-lg shadow-sky-500/30">
          <Shield className="h-8 w-8" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">Sou Cliente</h3>
        <p className="mt-1 text-sm text-slate-400">
          Informe seu nome para entrar no app e solicitar socorro.
        </p>
      </div>
      <div className="w-full space-y-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Seu nome"
          className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
          onKeyDown={(e) => e.key === 'Enter' && connected && onRegister()}
        />
        <Button
          onClick={onRegister}
          disabled={!name.trim() || !connected || registering}
          className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400"
        >
          {registering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            'Entrar como cliente'
          )}
        </Button>
      </div>
      <ConnectionStatus
        connected={connected}
        connectionError={connectionError}
        registrationError={registrationError}
      />
    </div>
  )
}

export function ProviderEntryForm({
  name,
  vehicle,
  plate,
  connected,
  connectionError,
  registering = false,
  registrationError = null,
  onNameChange,
  onVehicleChange,
  onPlateChange,
  onRegister,
}: ProviderEntryFormProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="relative">
        <div className="absolute -inset-3 animate-pulse rounded-3xl bg-orange-500/20 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-slate-950 shadow-lg shadow-orange-500/30">
          <Truck className="h-8 w-8" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">Sou Prestador</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cadastre-se para receber chamadas próximas e começar a ganhar.
        </p>
      </div>
      <div className="w-full space-y-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nome ou empresa"
          className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
        />
        <Input
          value={vehicle}
          onChange={(e) => onVehicleChange(e.target.value)}
          placeholder="Veículo / equipamento"
          className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
        />
        <Input
          value={plate}
          onChange={(e) => onPlateChange(e.target.value)}
          placeholder="Placa (EX: ABC1D23)"
          className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 uppercase"
          onKeyDown={(e) => e.key === 'Enter' && connected && onRegister()}
        />
        <Button
          onClick={onRegister}
          disabled={!name.trim() || !plate.trim() || !connected || registering}
          className="w-full bg-orange-500 text-slate-950 hover:bg-orange-400"
        >
          {registering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            'Entrar como prestador'
          )}
        </Button>
      </div>
      <ConnectionStatus
        connected={connected}
        connectionError={connectionError}
        registrationError={registrationError}
      />
    </div>
  )
}
