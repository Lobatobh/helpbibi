'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Ban, Car, Check, Clock3, Loader2, LocateFixed, RefreshCcw, Radio, Save, Star, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatPanel } from '@/components/rescue/chat-panel'
import type { ServiceData } from '@/lib/rescue-types'
import { STATUS_LABELS } from '@/lib/rescue-types'
import { useAuthenticatedProviderSocket } from '@/hooks/use-authenticated-rescue-socket'
import { useProviderHistory, type ServiceHistoryDetail } from '@/hooks/use-service-history'
import { ConsentRequiredPanel } from '@/components/consents/consent-required-panel'
import type { ConsentStatus } from '@/server/consents/consent-service'
import { useGeolocationWatch } from '@/hooks/use-geolocation'
import { OperationalMap } from '@/components/rescue/operational-map'
import { RescueAppShell } from '@/components/rescue/rescue-app-shell'

type ProviderInfo = {
  vehicle: string
  plate: string
  city: string | null
  approvalStatus: string
  approvalReason: string | null
  canOperate: boolean
  isAvailable: boolean
}

type ProviderProfile = ProviderInfo & {
  name: string
  email: string | null
  phone: string | null
}

type Props = {
  userName: string
  provider: ProviderInfo | null
  initialService: ServiceData | null
  initialConsents: ConsentStatus[]
  initialLocationConsent: ConsentStatus
}

const approvalLabel: Record<string, string> = {
  PENDING: 'Em analise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
}

const activePublicStatuses = ['accepted', 'arriving', 'arrived', 'in_progress']

export function AuthenticatedProviderPanel({ userName, provider, initialService, initialConsents, initialLocationConsent }: Props) {
  const socket = useAuthenticatedProviderSocket(initialService)
  const geolocation = useGeolocationWatch(4000)
  const pendingOnlineRef = useRef(false)
  const history = useProviderHistory(!!provider)
  const service = socket.service
  const offer = socket.offer
  const online = socket.state?.online ?? provider?.isAvailable ?? false
  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [profileName, setProfileName] = useState(userName)
  const [profilePhone, setProfilePhone] = useState('')
  const [profileVehicle, setProfileVehicle] = useState(provider?.vehicle || '')
  const [profilePlate, setProfilePlate] = useState(provider?.plate || '')
  const [profileCity, setProfileCity] = useState(provider?.city || '')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [ratingStars, setRatingStars] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingMessage, setRatingMessage] = useState<string | null>(null)
  const [locationConsentAccepted, setLocationConsentAccepted] = useState(initialLocationConsent.accepted)
  const [locationConsentLoading, setLocationConsentLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const consentsCurrent = initialConsents.every((item) => item.accepted)
  const canChat = consentsCurrent && !!service && activePublicStatuses.includes(service.status)
  const selectedDetail = history.detail
  const selectedCanRate = consentsCurrent && selectedDetail?.status === 'COMPLETED' && !selectedDetail.providerRatingStars
  const historySummary = useMemo(() => {
    const completed = history.history.filter((item) => item.status === 'COMPLETED').length
    const active = history.history.filter((item) => !['COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED'].includes(item.status)).length
    return { completed, active }
  }, [history.history])

  useEffect(() => {
    if (!provider) return
    async function loadProfile() {
      const response = await fetch('/api/provider/profile', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      const nextProfile = data.profile as ProviderProfile
      setProfile(nextProfile)
      setProfileName(nextProfile.name || userName)
      setProfilePhone(nextProfile.phone || '')
      setProfileVehicle(nextProfile.vehicle || '')
      setProfilePlate(nextProfile.plate || '')
      setProfileCity(nextProfile.city || '')
    }
    void loadProfile()
  }, [provider, userName])

  useEffect(() => {
    geolocation.onPosition((coords) => {
      socket.sendPosition(coords, (accepted) => {
        if (!accepted || !pendingOnlineRef.current) return
        pendingOnlineRef.current = false
        socket.toggleOnline(true)
      })
    })
  }, [geolocation.onPosition, socket.sendPosition, socket.toggleOnline])

  useEffect(() => {
    if (socket.connected) return
    pendingOnlineRef.current = false
    geolocation.stopWatch()
  }, [socket.connected, geolocation.stopWatch])

  useEffect(() => {
    if (!['denied', 'unavailable', 'error'].includes(geolocation.status)) return
    pendingOnlineRef.current = false
    geolocation.stopWatch()
    socket.clearPosition()
  }, [geolocation.status, geolocation.stopWatch, socket.clearPosition])

  useEffect(() => {
    if (socket.state?.canOperate !== false && socket.state?.locationConsentCurrent !== false) return
    pendingOnlineRef.current = false
    geolocation.stopWatch()
  }, [socket.state?.canOperate, socket.state?.locationConsentCurrent, geolocation.stopWatch])

  async function ensureLocationConsent(): Promise<boolean> {
    if (locationConsentAccepted) return true
    setLocationConsentLoading(true)
    setLocationError(null)
    const response = await fetch('/api/consents/accept', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ types: ['LOCATION'] }),
    })
    const data = await response.json().catch(() => ({}))
    setLocationConsentLoading(false)
    if (!response.ok) {
      setLocationError(data?.message || 'Nao foi possivel registrar o consentimento de localizacao.')
      return false
    }
    setLocationConsentAccepted(true)
    return true
  }

  async function startOperationalLocation(enableAvailability: boolean) {
    setLocationError(null)
    if (!(await ensureLocationConsent())) return
    pendingOnlineRef.current = enableAvailability
    geolocation.startWatch()
  }

  function stopOperationalLocation() {
    pendingOnlineRef.current = false
    geolocation.stopWatch()
    socket.clearPosition()
    socket.toggleOnline(false)
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileMessage(null)
    const response = await fetch('/api/provider/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: profileName,
        phone: profilePhone,
        vehicle: profileVehicle,
        plate: profilePlate,
        city: profileCity,
      }),
    })
    if (!response.ok) {
      setProfileMessage('Nao foi possivel atualizar o perfil.')
      return
    }
    const data = await response.json()
    setProfile(data.profile)
    setProfileMessage('Perfil atualizado.')
  }

  async function submitRating(detail: ServiceHistoryDetail) {
    setRatingMessage(null)
    const response = await fetch(`/api/services/${detail.id}/ratings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stars: ratingStars, comment: ratingComment }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setRatingMessage(data?.message || 'Nao foi possivel enviar a avaliacao.')
      return
    }
    setRatingComment('')
    setRatingMessage('Avaliacao registrada.')
    await history.fetchDetail(detail.id)
    await history.fetchHistory()
  }

  if (!provider) {
    return (
      <Shell userName={userName} connected={socket.connected} refresh={socket.refreshSnapshot}>
        <ConsentRequiredPanel initialConsents={initialConsents} />
        <Blocked title="Cadastro incompleto" message="Seu perfil de prestador ainda nao foi criado." />
      </Shell>
    )
  }

  if (!provider.canOperate) {
    return (
      <Shell userName={userName} connected={socket.connected} refresh={socket.refreshSnapshot}>
        <ConsentRequiredPanel initialConsents={initialConsents} />
        <Blocked
          title={`Operacao bloqueada - ${approvalLabel[provider.approvalStatus] || provider.approvalStatus}`}
          message={provider.approvalReason || 'Aguarde a analise do ADM antes de ficar disponivel.'}
        />
        <ProviderProfileCard
          profile={profile}
          profileName={profileName}
          setProfileName={setProfileName}
          profilePhone={profilePhone}
          setProfilePhone={setProfilePhone}
          profileVehicle={profileVehicle}
          setProfileVehicle={setProfileVehicle}
          profilePlate={profilePlate}
          setProfilePlate={setProfilePlate}
          profileCity={profileCity}
          setProfileCity={setProfileCity}
          profileMessage={profileMessage}
          onSubmit={saveProfile}
        />
      </Shell>
    )
  }

  return (
    <Shell userName={profile?.name || userName} connected={socket.connected} refresh={() => { void socket.refreshSnapshot(); void history.fetchHistory() }}>
      {socket.connectionError ? <Alert message={socket.connectionError} /> : null}
      {socket.operationError ? <Alert message={socket.operationError} danger /> : null}
      <ConsentRequiredPanel initialConsents={initialConsents} />

      <section id="inicio" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase text-help-orange">Operacao em campo</p>
            <h1 className="mt-1 text-2xl font-extrabold text-foreground">
              {offer
                ? 'Nova chamada recebida'
                : service
                  ? STATUS_LABELS[service.status]?.label || service.status
                  : online
                    ? 'Voce esta disponivel'
                    : 'Voce esta offline'}
            </h1>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            {offer || service
              ? 'A rota usa somente as posicoes recebidas durante o atendimento.'
              : 'Ative o GPS para aparecer no matching de prestadores aprovados.'}
          </p>
        </div>
        <OperationalMap
          pickup={offer?.pickup || service?.pickup}
          destination={offer?.destination || service?.destination}
          providerPosition={geolocation.coords}
          pickupLabel={offer?.pickupLabel || service?.pickupLabel}
          providerLabel={profile?.name || userName}
          distanceKm={offer?.distanceKm ?? service?.distanceKm}
          etaMin={offer?.etaMin ?? service?.etaMin}
          className="min-h-[20rem] sm:min-h-[24rem]"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard icon={<Car className="size-5" />} label="Veiculo" value={profileVehicle || provider.vehicle} />
        <StatusCard icon={<BadgeCheck className="size-5" />} label="Aprovacao" value={approvalLabel[provider.approvalStatus] || provider.approvalStatus} />
        <StatusCard icon={<Radio className="size-5" />} label="Disponibilidade" value={online ? 'Disponivel' : 'Offline'} />
      </section>

      <section id="atendimento" className="scroll-mt-24 rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Disponibilidade operacional</h2>
            <p className="mt-1 text-sm text-slate-400">Ao ficar disponivel, o navegador compartilha sua posicao durante a disponibilidade e o atendimento.</p>
            {geolocation.status === 'located' && geolocation.isReal ? (
              <p className="mt-2 text-xs text-emerald-300">GPS ativo e enviando posicao real.</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Sem posicao valida, voce nao entra no matching.</p>
            )}
            {geolocation.error || locationError ? <p className="mt-2 text-xs text-red-300">{geolocation.error || locationError}</p> : null}
            {locationConsentAccepted && geolocation.status !== 'located' ? <p className="mt-1 text-xs text-slate-500">Consentimento registrado; permissao do navegador ainda necessaria.</p> : null}
          </div>
          {service ? (
            <Button
              className="bg-orange-400 text-slate-950 hover:bg-orange-300"
              onClick={() => void startOperationalLocation(false)}
              disabled={!consentsCurrent || locationConsentLoading || geolocation.status === 'locating' || geolocation.status === 'located'}
            >
              {locationConsentLoading || geolocation.status === 'locating' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LocateFixed className="mr-2 size-4" />}
              Ativar GPS do atendimento
            </Button>
          ) : (
            <Button
              className={online ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-orange-400 text-slate-950 hover:bg-orange-300'}
              onClick={() => online ? stopOperationalLocation() : void startOperationalLocation(true)}
              disabled={!consentsCurrent || locationConsentLoading || geolocation.status === 'locating'}
            >
              {locationConsentLoading || geolocation.status === 'locating' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LocateFixed className="mr-2 size-4" />}
              {online ? 'Ficar indisponivel' : 'Ficar disponivel'}
            </Button>
          )}
        </div>
      </section>

      {offer ? (
        <ServiceCard title="Nova chamada" service={offer}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!consentsCurrent} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={() => socket.accept(offer.id)}>
              <Check className="mr-2 size-4" />
              Aceitar
            </Button>
            <Button disabled={!consentsCurrent} variant="outline" className="border-red-900 bg-red-950/30 text-red-200 hover:bg-red-950/50" onClick={() => socket.reject(offer.id)}>
              <X className="mr-2 size-4" />
              Recusar
            </Button>
          </div>
        </ServiceCard>
      ) : null}

      {service ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ServiceCard title="Atendimento ativo" service={service}>
            <div className="mt-4 flex flex-wrap gap-2">
              {service.status === 'accepted' ? <Button disabled={!consentsCurrent} onClick={() => socket.updateStatus('arrived', service.id)}>Cheguei ao local</Button> : null}
              {service.status === 'arrived' ? <Button disabled={!consentsCurrent} onClick={() => socket.updateStatus('start', service.id)}>Iniciar atendimento</Button> : null}
              {service.status === 'in_progress' ? <Button disabled={!consentsCurrent} onClick={() => socket.updateStatus('complete', service.id)}>Finalizar</Button> : null}
            </div>
          </ServiceCard>
          {canChat ? (
            <ChatPanel
              compact
              messages={socket.messages}
              myRole="provider"
              counterpartName={service.clientName}
              onSend={(text) => socket.sendChat(service.id, text)}
            />
          ) : null}
        </section>
      ) : (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
          Nenhum atendimento vinculado no momento.
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ProviderProfileCard
          profile={profile}
          profileName={profileName}
          setProfileName={setProfileName}
          profilePhone={profilePhone}
          setProfilePhone={setProfilePhone}
          profileVehicle={profileVehicle}
          setProfileVehicle={setProfileVehicle}
          profilePlate={profilePlate}
          setProfilePlate={setProfilePlate}
          profileCity={profileCity}
          setProfileCity={setProfileCity}
          profileMessage={profileMessage}
          onSubmit={saveProfile}
        />

        <section id="historico" className="scroll-mt-24 rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Historico operacional</h2>
              <p className="mt-1 text-sm text-slate-400">{historySummary.completed} concluidos, {historySummary.active} em andamento.</p>
            </div>
            <Button variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={history.fetchHistory} disabled={history.loading}>
              <RefreshCcw className="mr-2 size-4" />
              Recarregar
            </Button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {history.history.length === 0 ? (
                <p className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">Nenhum servico encontrado.</p>
              ) : history.history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { void history.fetchDetail(item.id); setRatingMessage(null) }}
                  className={`w-full rounded-md border p-3 text-left text-sm transition ${selectedDetail?.id === item.id ? 'border-orange-700 bg-orange-950/30' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                >
                  <p className="font-medium text-white">{item.typeLabel}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.statusLabel}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.clientName || 'Cliente'}</p>
                </button>
              ))}
            </div>

            <div className="min-h-[240px] rounded-md border border-slate-800 bg-slate-950 p-4">
              {!selectedDetail ? (
                <p className="text-sm text-slate-400">Selecione um atendimento para ver detalhes.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-300">{selectedDetail.typeLabel}</p>
                      <h3 className="mt-1 text-lg font-semibold">{selectedDetail.statusLabel}</h3>
                      <p className="mt-1 text-sm text-slate-400">{selectedDetail.pickupLabel} para {selectedDetail.destinationLabel}</p>
                    </div>
                    <span className="w-fit rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300">{money(selectedDetail.providerPayout ?? selectedDetail.price)}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Info label="Cliente" value={selectedDetail.clientName || 'Cliente'} />
                    <Info label="Pagamento" value={selectedDetail.latestPayment?.status || selectedDetail.paymentStatus} />
                  </div>

                  <ol className="space-y-2">
                    {selectedDetail.timeline.map((event, index) => (
                      <li key={`${event.at}-${index}`} className="rounded-md border border-slate-800 bg-slate-900 p-3">
                        <p className="text-sm text-white">{event.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(event.at).toLocaleString('pt-BR')}</p>
                      </li>
                    ))}
                  </ol>

                  {selectedCanRate ? (
                    <div className="rounded-md border border-slate-800 bg-slate-900 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Star className="size-4 text-yellow-300" />
                        Avaliar cliente
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <select value={ratingStars} onChange={(event) => setRatingStars(Number(event.target.value))} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} estrelas</option>)}
                        </select>
                        <Input value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} className="border-slate-700 bg-slate-950 text-white" placeholder="Comentario opcional" />
                      </div>
                      {ratingMessage ? <p className="mt-2 text-xs text-orange-300">{ratingMessage}</p> : null}
                      <Button className="mt-3 bg-orange-400 text-slate-950 hover:bg-orange-300" onClick={() => void submitRating(selectedDetail)}>
                        Enviar avaliacao
                      </Button>
                    </div>
                  ) : selectedDetail.providerRatingStars ? (
                    <p className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                      Sua avaliacao: {selectedDetail.providerRatingStars} estrela(s).
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </Shell>
  )
}

function Shell({ userName, connected, refresh, children }: { userName: string; connected: boolean; refresh: () => void; children: React.ReactNode }) {
  return (
    <RescueAppShell
      roleLabel="Area do prestador"
      userName={userName}
      connected={connected}
      onRefresh={refresh}
      accent="orange"
    >
      {children}
    </RescueAppShell>
  )
}

function ProviderProfileCard({
  profile,
  profileName,
  setProfileName,
  profilePhone,
  setProfilePhone,
  profileVehicle,
  setProfileVehicle,
  profilePlate,
  setProfilePlate,
  profileCity,
  setProfileCity,
  profileMessage,
  onSubmit,
}: {
  profile: ProviderProfile | null
  profileName: string
  setProfileName: (value: string) => void
  profilePhone: string
  setProfilePhone: (value: string) => void
  profileVehicle: string
  setProfileVehicle: (value: string) => void
  profilePlate: string
  setProfilePlate: (value: string) => void
  profileCity: string
  setProfileCity: (value: string) => void
  profileMessage: string | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form id="perfil" onSubmit={onSubmit} className="scroll-mt-24 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center gap-2 text-orange-300">
        <UserRound className="size-4" />
        <h2 className="text-base font-semibold text-white">Perfil</h2>
      </div>
      <label className="space-y-2">
        <span className="text-sm text-slate-300">Nome</span>
        <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
      </label>
      <label className="mt-3 block space-y-2">
        <span className="text-sm text-slate-300">Telefone</span>
        <Input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
      </label>
      <label className="mt-3 block space-y-2">
        <span className="text-sm text-slate-300">Veiculo</span>
        <Input value={profileVehicle} onChange={(event) => setProfileVehicle(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
      </label>
      <label className="mt-3 block space-y-2">
        <span className="text-sm text-slate-300">Placa</span>
        <Input value={profilePlate} onChange={(event) => setProfilePlate(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
      </label>
      <label className="mt-3 block space-y-2">
        <span className="text-sm text-slate-300">Cidade</span>
        <Input value={profileCity} onChange={(event) => setProfileCity(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
      </label>
      <p className="mt-3 text-xs text-slate-500">{profile?.email || 'Email nao informado'}</p>
      {profileMessage ? <p className="mt-3 text-xs text-orange-300">{profileMessage}</p> : null}
      <Button type="submit" className="mt-4 bg-orange-400 text-slate-950 hover:bg-orange-300">
        <Save className="mr-2 size-4" />
        Salvar perfil
      </Button>
    </form>
  )
}

function Blocked({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-lg border border-amber-800 bg-amber-950/30 p-5 text-amber-100">
      <div className="flex gap-3">
        <Ban className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm">{message}</p>
        </div>
      </div>
    </section>
  )
}

function StatusCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-3 text-orange-300">
        {icon}
        <span className="text-sm font-medium text-slate-300">{label}</span>
      </div>
      <p className="mt-3 break-words text-xl font-semibold">{value}</p>
    </div>
  )
}

function ServiceCard({ title, service, children }: { title: string; service: ServiceData; children?: React.ReactNode }) {
  const status = STATUS_LABELS[service.status]
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-orange-300">{title}</p>
          <h2 className="mt-1 text-lg font-semibold">{service.typeLabel}</h2>
          <p className="mt-1 text-sm text-slate-400">{service.pickupLabel} para {service.destinationLabel}</p>
        </div>
        <span className="w-fit rounded-md border border-orange-800 bg-orange-950/40 px-3 py-1.5 text-xs font-semibold text-orange-200">
          {status?.label || service.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <Info label="Cliente" value={service.clientName} />
        <Info label="Valor" value={money(service.price)} />
        <Info label="ETA" value={`${service.etaMin} min`} />
      </div>
      {children}
    </section>
  )
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <p className="flex items-center gap-2 text-xs uppercase text-slate-500"><Clock3 className="size-3" />{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  )
}

function Alert({ message, danger = false }: { message: string; danger?: boolean }) {
  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${danger ? 'border-red-900 bg-red-950/40 text-red-200' : 'border-amber-800 bg-amber-950/40 text-amber-200'}`}>
      {message}
    </p>
  )
}
