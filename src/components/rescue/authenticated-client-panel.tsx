'use client'

import { useEffect, useMemo, useState } from 'react'
import { CreditCard, MapPin, Navigation, RefreshCcw, Save, Send, Shield, Star, UserRound, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatPanel } from '@/components/rescue/chat-panel'
import { SERVICE_TYPES, PAYMENT_METHODS, STATUS_LABELS, type PaymentMethod, type ServiceData, type ServiceType } from '@/lib/rescue-types'
import { useAuthenticatedClientSocket } from '@/hooks/use-authenticated-rescue-socket'
import { useClientHistory, type ServiceHistoryDetail } from '@/hooks/use-service-history'
import { ConsentRequiredPanel } from '@/components/consents/consent-required-panel'
import type { ConsentStatus } from '@/server/consents/consent-service'

type Props = {
  userName: string
  initialService: ServiceData | null
  initialConsents: ConsentStatus[]
}

type ClientProfile = {
  name: string
  email: string | null
  phone: string | null
}

const defaultPickup = { lat: -23.5505, lng: -46.6333 }
const defaultDestination = { lat: -23.5614, lng: -46.6559 }
const activePublicStatuses = ['searching', 'offered', 'accepted', 'arriving', 'arrived', 'in_progress']

export function AuthenticatedClientPanel({ userName, initialService, initialConsents }: Props) {
  const socket = useAuthenticatedClientSocket(initialService)
  const history = useClientHistory()
  const [type, setType] = useState<ServiceType>('reboque')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [pickupLabel, setPickupLabel] = useState('Av. Paulista, 1000')
  const [destinationLabel, setDestinationLabel] = useState('Rua Augusta, 500')
  const [description, setDescription] = useState('Preciso de socorro veicular')
  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [profileName, setProfileName] = useState(userName)
  const [profilePhone, setProfilePhone] = useState('')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [ratingStars, setRatingStars] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingMessage, setRatingMessage] = useState<string | null>(null)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [payingServiceId, setPayingServiceId] = useState<string | null>(null)

  const service = socket.service
  const status = service ? STATUS_LABELS[service.status] : null
  const trackingUrl = service ? `/?track=${service.id}` : null
  const canCancel = !!service && activePublicStatuses.includes(service.status)
  const consentsCurrent = initialConsents.every((item) => item.accepted)
  const canChat = consentsCurrent && !!service?.provider && activePublicStatuses.includes(service.status)

  const selectedDetail = history.detail
  const selectedCanRate = consentsCurrent && selectedDetail?.status === 'COMPLETED' && !selectedDetail.clientRatingStars
  const selectedPaymentStatus = selectedDetail?.latestPayment?.status || selectedDetail?.paymentStatus || 'PENDING'
  const selectedCanPay = consentsCurrent && selectedDetail?.status === 'COMPLETED' && !['PAID', 'REFUNDED'].includes(selectedPaymentStatus)

  const historySummary = useMemo(() => {
    const completed = history.history.filter((item) => item.status === 'COMPLETED').length
    const active = history.history.filter((item) => !['COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED'].includes(item.status)).length
    return { completed, active }
  }, [history.history])

  useEffect(() => {
    async function loadProfile() {
      const response = await fetch('/api/client/profile', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      const nextProfile = data.profile as ClientProfile
      setProfile(nextProfile)
      setProfileName(nextProfile.name || userName)
      setProfilePhone(nextProfile.phone || '')
    }
    void loadProfile()
  }, [userName])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileMessage(null)
    const response = await fetch('/api/client/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: profileName, phone: profilePhone }),
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

  async function simulatePayment(detail: ServiceHistoryDetail) {
    setPaymentMessage(null)
    setPayingServiceId(detail.id)
    try {
      const response = await fetch('/api/payments/simulate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceRequestId: detail.id, outcome: 'success' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setPaymentMessage(data?.message || 'Nao foi possivel confirmar o pagamento simulado.')
        return
      }
      setPaymentMessage('Pagamento simulado confirmado.')
      await history.fetchDetail(detail.id)
      await history.fetchHistory()
    } finally {
      setPayingServiceId(null)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    socket.requestService({
      type,
      description,
      pickup: defaultPickup,
      pickupLabel,
      destination: defaultDestination,
      destinationLabel,
      paymentMethod,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-300">Area do cliente</p>
            <h1 className="mt-1 text-2xl font-semibold">Ola, {profile?.name || userName}</h1>
            <p className="mt-1 text-sm text-slate-400">Solicite e acompanhe atendimentos reais do MVP.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md border px-3 py-1.5 text-xs font-semibold ${socket.connected ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-amber-800 bg-amber-950/40 text-amber-200'}`}>
              {socket.connected ? 'Tempo real conectado' : 'Reconectando tempo real'}
            </span>
            <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-100" onClick={() => { void socket.refreshSnapshot(); void history.fetchHistory() }}>
              <RefreshCcw className="mr-2 size-4" />
              Atualizar
            </Button>
          </div>
        </header>

        {socket.connectionError ? <Alert tone="amber" message={socket.connectionError} /> : null}
        {socket.operationError ? <Alert tone="red" message={socket.operationError} /> : null}
        <ConsentRequiredPanel initialConsents={initialConsents} />

        {service ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-300">{service.typeLabel}</p>
                  <h2 className="mt-1 text-xl font-semibold">{status?.label || service.status}</h2>
                  <p className="mt-2 text-sm text-slate-400">{service.description}</p>
                </div>
                <span className="w-fit rounded-md border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs font-semibold text-sky-200">
                  {service.id}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Info icon={<MapPin className="size-4" />} label="Origem" value={service.pickupLabel} />
                <Info icon={<Navigation className="size-4" />} label="Destino" value={service.destinationLabel} />
                <Info label="Distancia" value={`${service.distanceKm.toFixed(2)} km`} />
                <Info label="Valor" value={money(service.price)} />
              </div>

              <ol className="mt-6 space-y-3">
                {service.timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <p className="text-sm font-medium text-white">{event.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.at).toLocaleString('pt-BR')}</p>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Prestador</h2>
                {service.provider ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>{service.provider.name}</p>
                    <p>{service.provider.vehicle}</p>
                    <p>Nota {service.provider.rating.toFixed(1)}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">Aguardando aceite.</p>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Tracking</h2>
                {trackingUrl ? (
                  <a href={trackingUrl} className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
                    Abrir rastreamento
                  </a>
                ) : null}
                {canCancel ? (
                  <Button variant="outline" className="mt-3 w-full border-red-900 bg-red-950/30 text-red-200 hover:bg-red-950/50" onClick={() => socket.cancelService(service.id)}>
                    <XCircle className="mr-2 size-4" />
                    Cancelar solicitacao
                  </Button>
                ) : null}
              </section>

              {canChat ? (
                <ChatPanel
                  compact
                  messages={socket.messages}
                  myRole="client"
                  counterpartName={service.provider?.name || 'Prestador'}
                  onSend={(text) => socket.sendChat(service.id, text)}
                />
              ) : null}
            </aside>
          </section>
        ) : (
          <form onSubmit={submit} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-sky-500 text-slate-950">
                <Shield className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Nova solicitacao</h2>
                <p className="text-sm text-slate-400">A solicitacao sera salva antes de avisar prestadores.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Tipo</span>
                <select value={type} onChange={(event) => setType(event.target.value as ServiceType)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                  {SERVICE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Pagamento</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                  {PAYMENT_METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Origem</span>
                <Input value={pickupLabel} onChange={(event) => setPickupLabel(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Destino</span>
                <Input value={destinationLabel} onChange={(event) => setDestinationLabel(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">Descricao</span>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} className="border-slate-700 bg-slate-950 text-white" required />
              </label>
            </div>

            <Button type="submit" disabled={!consentsCurrent || !socket.connected || socket.submitting} className="mt-5 bg-sky-500 text-slate-950 hover:bg-sky-400">
              <Send className="mr-2 size-4" />
              {socket.submitting ? 'Criando...' : 'Confirmar solicitacao'}
            </Button>
          </form>
        )}

        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <form onSubmit={saveProfile} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-sky-300">
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
            <p className="mt-3 text-xs text-slate-500">{profile?.email || 'Email nao informado'}</p>
            {profileMessage ? <p className="mt-3 text-xs text-sky-300">{profileMessage}</p> : null}
            <Button type="submit" className="mt-4 bg-sky-500 text-slate-950 hover:bg-sky-400">
              <Save className="mr-2 size-4" />
              Salvar perfil
            </Button>
          </form>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Historico de servicos</h2>
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
                    onClick={() => { void history.fetchDetail(item.id); setRatingMessage(null); setPaymentMessage(null) }}
                    className={`w-full rounded-md border p-3 text-left text-sm transition ${selectedDetail?.id === item.id ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                  >
                    <p className="font-medium text-white">{item.typeLabel}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.statusLabel}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.pickupLabel}</p>
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
                        <p className="text-sm font-medium text-sky-300">{selectedDetail.typeLabel}</p>
                        <h3 className="mt-1 text-lg font-semibold">{selectedDetail.statusLabel}</h3>
                        <p className="mt-1 text-sm text-slate-400">{selectedDetail.pickupLabel} para {selectedDetail.destinationLabel}</p>
                      </div>
                      <span className="w-fit rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300">{money(selectedDetail.price)}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Info label="Prestador" value={selectedDetail.providerName || 'Nao vinculado'} />
                      <Info label="Pagamento" value={selectedPaymentStatus} />
                    </div>

                    {selectedCanPay ? (
                      <div className="rounded-md border border-sky-900 bg-sky-950/30 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">Pagamento simulado do piloto</p>
                            <p className="mt-1 text-xs text-slate-400">Valor canonico: {money(selectedDetail.price)}</p>
                          </div>
                          <Button
                            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
                            onClick={() => void simulatePayment(selectedDetail)}
                            disabled={payingServiceId === selectedDetail.id}
                          >
                            <CreditCard className="mr-2 size-4" />
                            {payingServiceId === selectedDetail.id ? 'Confirmando...' : 'Confirmar pagamento'}
                          </Button>
                        </div>
                        {paymentMessage ? <p className="mt-2 text-xs text-sky-300">{paymentMessage}</p> : null}
                      </div>
                    ) : paymentMessage ? (
                      <p className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">{paymentMessage}</p>
                    ) : null}

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
                          Avaliar prestador
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <select value={ratingStars} onChange={(event) => setRatingStars(Number(event.target.value))} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} estrelas</option>)}
                          </select>
                          <Input value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} className="border-slate-700 bg-slate-950 text-white" placeholder="Comentario opcional" />
                        </div>
                        {ratingMessage ? <p className="mt-2 text-xs text-sky-300">{ratingMessage}</p> : null}
                        <Button className="mt-3 bg-sky-500 text-slate-950 hover:bg-sky-400" onClick={() => void submitRating(selectedDetail)}>
                          Enviar avaliacao
                        </Button>
                      </div>
                    ) : selectedDetail.clientRatingStars ? (
                      <p className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                        Sua avaliacao: {selectedDetail.clientRatingStars} estrela(s).
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <p className="flex items-center gap-2 text-xs uppercase text-slate-500">{icon}{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  )
}

function Alert({ tone, message }: { tone: 'amber' | 'red'; message: string }) {
  const className = tone === 'amber'
    ? 'border-amber-800 bg-amber-950/40 text-amber-200'
    : 'border-red-900 bg-red-950/40 text-red-200'
  return <p className={`rounded-md border px-3 py-2 text-sm ${className}`}>{message}</p>
}
