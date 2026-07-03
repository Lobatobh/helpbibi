'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Shield, Phone, Star, MapPin, Navigation, X, Truck, Battery, Fuel, Key, Wrench,
  CircleDot, Clock, CheckCircle2, Loader2, AlertTriangle, MessageCircle,
  Zap, CreditCard, Wallet, History, Home, Send, Tag, Eye, ArrowRight, ChevronRight, User,
  TrendingUp, Trophy, Heart, Volume2, VolumeX, Briefcase, Share2, Check, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useClientSocket } from '@/hooks/use-rescue-socket'
import { useServiceToasts } from '@/hooks/use-service-toasts'
import { useSoundNotifications, useChatSound } from '@/hooks/use-sound-notifications'
import {
  SERVICE_TYPES, PAYMENT_METHODS, STATUS_LABELS,
  type ServiceType, type LatLng, type PaymentMethod, type ServiceData, type ServiceRecord, type PromoResult, type LoyaltyInfo,
} from '@/lib/rescue-types'
import { getHistoryForRole, addRecord, recordFromService, updateRecord } from '@/lib/rescue-history'
import { getFavorites, addFavorite, removeFavorite, isFavorite, type FavoriteLocation } from '@/lib/rescue-favorites'
import { RescueMap } from './rescue-map'
import { ChatPanel } from './chat-panel'
import { TripProgressBar } from './trip-progress-bar'
import { LoyaltyCard } from './loyalty-card'
import { SettingsView } from './settings-view'
import { LiveCountdown } from './live-countdown'

const ICONS: Record<string, any> = {
  'tow-truck': Truck, tire: CircleDot, battery: Battery, fuel: Fuel, key: Key, wrench: Wrench,
}
const PAY_ICONS: Record<string, any> = { zap: Zap, 'credit-card': CreditCard, wallet: Wallet }

const PRESETS: { id: string; label: string; pos: LatLng }[] = [
  { id: 'paulista', label: 'Av. Paulista, 1578', pos: { lat: -23.5614, lng: -46.6559 } },
  { id: 'centro', label: 'Praça da Sé, Centro', pos: { lat: -23.5503, lng: -46.6334 } },
  { id: 'pinheiros', label: 'Rua dos Pinheiros, 100', pos: { lat: -23.5673, lng: -46.6910 } },
  { id: 'vilamariana', label: 'Vila Mariana, 220', pos: { lat: -23.5876, lng: -46.6376 } },
  { id: 'moema', label: 'Moema, Av. Ibirapuera 3100', pos: { lat: -23.6075, lng: -46.6660 } },
  { id: 'ibirapuera', label: 'Parque Ibirapuera', pos: { lat: -23.5874, lng: -46.6576 } },
]

// haversine to estimate distance for promo preview
const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function ClientPanel() {
  const {
    connected, registered, nearby, currentService, messages, newMessage, promoResult, loyalty, rewards, redeemResult,
    register, requestService, cancelService, rateService,
    validatePromo, clearPromo, sendChat, clearNewMessage,
    redeemReward, clearRedeemResult, clearCurrent,
  } = useClientSocket()

  useServiceToasts(currentService, 'client')
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundNotifications(currentService, 'client')
  useChatSound(soundEnabled, messages.length)

  const [name, setName] = useState('')
  const [view, setView] = useState<'home' | 'form' | 'history' | 'profile' | 'settings'>('home')
  const [svcType, setSvcType] = useState<ServiceType>('reboque')
  const [description, setDescription] = useState('')
  const [pickupId, setPickupId] = useState('paulista')
  const [destId, setDestId] = useState('moema')
  const [payment, setPayment] = useState<PaymentMethod>('pix')
  const [promoInput, setPromoInput] = useState('')
  const [promoValidating, setPromoValidating] = useState(false)
  const [history, setHistory] = useState<ServiceRecord[]>(() =>
    typeof window !== 'undefined' ? getHistoryForRole('client') : []
  )
  const [ratedServices, setRatedServices] = useState<Set<string>>(new Set())
  const [detailRecord, setDetailRecord] = useState<ServiceRecord | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const recordedRef = useRef<Set<string>>(new Set())
  const promoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track unread chat messages when chat is closed
  useEffect(() => {
    if (!newMessage) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!chatOpen) setUnreadChat((n) => n + 1)
    clearNewMessage()
  }, [newMessage, chatOpen, clearNewMessage])

  // Reset chat state when service changes or clears
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChatOpen(false)
    setUnreadChat(0)
  }, [currentService?.id])

  const toggleChat = () => {
    setChatOpen(!chatOpen)
    if (!chatOpen) setUnreadChat(0)
  }

  // When a service reaches a terminal state, persist it to history once
  useEffect(() => {
    if (!currentService) return
    const s = currentService
    if (s.status !== 'completed' && s.status !== 'cancelled' && s.status !== 'expired') return
    if (recordedRef.current.has(s.id)) return
    recordedRef.current.add(s.id)
    const rec = recordFromService(s, 'client')
    if (rec) {
      addRecord(rec)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory((prev) => (prev.some((r) => r.id === rec.id) ? prev : [rec, ...prev]))
    }
  }, [currentService?.status, currentService?.id])

  const handleRegister = () => {
    if (!name.trim()) return
    register(name.trim())
  }

  // Debounced promo validation
  const handlePromoInput = (val: string) => {
    setPromoInput(val)
    clearPromo()
    setPromoValidating(false)
    if (promoTimer.current) clearTimeout(promoTimer.current)
    if (!val.trim()) return
    setPromoValidating(true)
    promoTimer.current = setTimeout(() => {
      const pickup = PRESETS.find((p) => p.id === pickupId)!
      const dest = PRESETS.find((p) => p.id === destId)!
      validatePromo(val.trim(), svcType, haversineKm(pickup.pos, dest.pos))
      setPromoValidating(false)
    }, 600)
  }

  const handleSubmit = () => {
    const pickup = PRESETS.find((p) => p.id === pickupId)!
    const dest = PRESETS.find((p) => p.id === destId)!
    requestService({
      clientName: name.trim(),
      type: svcType,
      description: description.trim() || 'Sem detalhes adicionais',
      pickup: pickup.pos,
      pickupLabel: pickup.label,
      destination: dest.pos,
      destinationLabel: dest.label,
      paymentMethod: payment,
      promoCode: promoResult?.valid ? promoResult.code : null,
    })
    setView('home')
    setDescription('')
    setPromoInput('')
    clearPromo()
  }

  const handleRate = (svc: ServiceData, stars: number, comment: string) => {
    rateService(svc.id, stars, comment)
    setRatedServices((prev) => new Set(prev).add(svc.id))
    updateRecord(svc.id, 'client', { rating: { stars, comment } })
    setHistory(getHistoryForRole('client'))
  }

  const handleNewRequest = () => {
    clearCurrent()
    setView('form')
  }

  // -------- Render states --------
  if (!registered) {
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
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
          />
          <Button
            onClick={handleRegister}
            disabled={!name.trim() || !connected}
            className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400"
          >
            Entrar como cliente
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {connected ? '✓ Conectado ao serviço' : 'Conectando...'}
        </p>
      </div>
    )
  }

  const svc = currentService
  const hasActive = svc && !['completed', 'cancelled', 'expired'].includes(svc.status)

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-slate-950 shadow-md shadow-sky-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Help Bibi · Cliente</p>
            <p className="text-[11px] text-slate-400">Olá, {name || 'motorista'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSound}
            className={`h-7 w-7 ${soundEnabled ? 'text-sky-400' : 'text-slate-500'} hover:bg-slate-800`}
            aria-label="Alternar som"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </Button>
          <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-400">
            <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            Online
          </Badge>
        </div>
      </div>

      {/* Map area */}
      <div className="relative h-[34%] min-h-[150px] p-3">
        <RescueMap
          providers={nearby}
          pickup={svc?.pickup}
          destination={svc?.destination}
          clientPos={PRESETS.find((p) => p.id === pickupId)?.pos}
          providerState={svc?.provider}
          height="h-full"
        />
        <div className="absolute left-5 top-5 flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          {nearby.length} prestador(es) por perto
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-slate-800 px-3 pt-1">
        <TabBtn active={view === 'home' || view === 'form'} onClick={() => setView('home')} icon={Home} label="Início" />
        <TabBtn active={view === 'history'} onClick={() => { setView('history'); setHistory(getHistoryForRole('client')) }} icon={History} label="Histórico" badge={history.length} />
        <TabBtn active={view === 'profile'} onClick={() => setView('profile')} icon={User} label="Perfil" />
        <TabBtn active={view === 'settings'} onClick={() => setView('settings')} icon={Settings} label="Ajustes" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {!connected && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Conexão perdida. Reconectando...</span>
          </div>
        )}
        {view === 'history' && (
          <HistoryView history={history} role="client" onSelect={setDetailRecord} />
        )}

        {view === 'home' && !svc && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                  <Shield className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-white">Pronto para ajudar</p>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Toque abaixo para solicitar um serviço. O prestador mais próximo receberá a chamada
                automaticamente.
              </p>
            </div>
            <Button
              onClick={() => setView('form')}
              className="w-full bg-sky-500 py-6 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-400"
            >
              <Shield className="mr-2 h-5 w-5" />
              Solicitar socorro
            </Button>

            {/* Emergency SOS quick button */}
            <button
              onClick={() => {
                setSvcType('reboque')
                setDescription('EMERGÊNCIA — veículo imobilizado, necessita guincho urgente')
                setView('form')
              }}
              className="group relative w-full overflow-hidden rounded-xl border-2 border-rose-500/60 bg-gradient-to-r from-rose-500/20 to-rose-600/10 p-4 text-left transition hover:from-rose-500/30 hover:to-rose-600/20"
            >
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                  <span className="absolute -inset-1 animate-ping rounded-xl bg-rose-500/40" />
                  <AlertTriangle className="relative h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-extrabold text-rose-400">SOS · Emergência</p>
                  <p className="text-[10px] text-slate-400">Reboque urgente com 1 toque — prioridade máxima</p>
                </div>
                <ArrowRight className="h-4 w-4 text-rose-400 transition group-hover:translate-x-1" />
              </div>
            </button>

            {loyalty && (
              <LoyaltyCard
                loyalty={loyalty}
                rewards={rewards}
                redeemResult={redeemResult}
                onRedeem={redeemReward}
                onClearRedeem={clearRedeemResult}
              />
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prestadores próximos
              </p>
              <div className="space-y-2">
                {nearby.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center">
                    <Truck className="mx-auto mb-1 h-5 w-5 text-slate-600" />
                    <p className="text-xs text-slate-500">Nenhum prestador disponível no momento. Tente novamente em alguns minutos.</p>
                  </div>
                )}
                {nearby.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 transition hover:border-slate-700"
                  >
                    <Avatar className="h-8 w-8 bg-gradient-to-br from-orange-500 to-orange-700">
                      <AvatarFallback className="bg-transparent text-xs font-bold text-white">
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-white">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.vehicle}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1 text-sky-400">
                        <Star className="h-3 w-3" fill="currentColor" />
                        <span className="text-[11px] font-semibold">{p.rating.toFixed(1)}</span>
                      </div>
                      <span className="text-[9px] text-slate-500">{p.completedCount} serviços</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'home' && svc && (
          <ServiceTracker
            svc={svc}
            onCancel={() => cancelService(svc.id)}
            onRate={(stars, comment) => handleRate(svc, stars, comment)}
            rated={ratedServices.has(svc.id) || !!svc.rating}
            onNewRequest={handleNewRequest}
            messages={messages}
            onSendChat={(text) => sendChat(svc.id, text)}
            chatOpen={chatOpen}
            setChatOpen={toggleChat}
            unreadChat={unreadChat}
          />
        )}

        {view === 'form' && !hasActive && (
          <RequestForm
            svcType={svcType} setSvcType={setSvcType}
            description={description} setDescription={setDescription}
            pickupId={pickupId} setPickupId={setPickupId}
            destId={destId} setDestId={setDestId}
            payment={payment} setPayment={setPayment}
            promoInput={promoInput} onPromoInput={handlePromoInput}
            promoResult={promoResult}
            promoValidating={promoValidating}
            onCancel={() => setView('home')}
            onSubmit={handleSubmit}
            presets={PRESETS}
          />
        )}
        {view === 'form' && hasActive && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-center text-xs text-sky-300">
            Você já tem um serviço em andamento. Acompanhe na aba Início.
          </div>
        )}

        {view === 'profile' && (
          <ClientProfileView name={name} loyalty={loyalty} history={history} />
        )}

        {view === 'settings' && (
          <SettingsView soundEnabled={soundEnabled} onToggleSound={toggleSound} />
        )}
      </div>

      {/* Service detail dialog */}
      <ServiceDetailDialog record={detailRecord} onClose={() => setDetailRecord(null)} role="client" />
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: any; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${
        active ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge ? (
        <span className="ml-0.5 rounded-full bg-slate-700 px-1.5 text-[10px] text-white">{badge}</span>
      ) : null}
    </button>
  )
}

function RequestForm(props: any) {
  const {
    svcType, setSvcType, description, setDescription, pickupId, setPickupId, destId, setDestId,
    payment, setPayment, promoInput, onPromoInput, promoResult, promoValidating,
    onCancel, onSubmit, presets,
  } = props
  const sameLoc = pickupId === destId
  const [favorites, setFavorites] = useState<FavoriteLocation[]>(() =>
    typeof window !== 'undefined' ? getFavorites() : []
  )
  const [showSaveFav, setShowSaveFav] = useState(false)
  const [favLabel, setFavLabel] = useState('')
  const [favIcon, setFavIcon] = useState<'home' | 'work' | 'star'>('home')
  const [savedFlash, setSavedFlash] = useState(false)

  const selectedPickup = presets?.find((p: any) => p.id === pickupId)
  const pickupIsFav = selectedPickup ? isFavorite(selectedPickup.label) : false

  const handleSaveFavorite = () => {
    if (!selectedPickup || !favLabel.trim()) return
    addFavorite({
      id: Math.random().toString(36).slice(2, 10),
      label: favLabel.trim(),
      address: selectedPickup.label,
      pos: selectedPickup.pos,
      icon: favIcon,
      createdAt: Date.now(),
    })
    setFavorites(getFavorites())
    setFavLabel('')
    setShowSaveFav(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  const handleRemoveFavorite = (id: string) => {
    removeFavorite(id)
    setFavorites(getFavorites())
  }

  const handleSelectFavorite = (fav: FavoriteLocation) => {
    // Find matching preset by position, or just set by label
    const match = presets?.find((p: any) => p.label === fav.address)
    if (match) setPickupId(match.id)
  }

  const effectiveResult = promoResult as PromoResult | null

  // Compute preview price
  const pickup = presets?.find((p: any) => p.id === pickupId)
  const dest = presets?.find((p: any) => p.id === destId)
  const basePrice = (() => {
    if (!pickup || !dest) return 0
    const R = 6371
    const dLat = ((dest.pos.lat - pickup.pos.lat) * Math.PI) / 180
    const dLng = ((dest.pos.lng - pickup.pos.lng) * Math.PI) / 180
    const la1 = (pickup.pos.lat * Math.PI) / 180
    const la2 = (dest.pos.lat * Math.PI) / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
    const dist = 2 * R * Math.asin(Math.sqrt(h))
    const meta = SERVICE_TYPES.find((s) => s.id === svcType)!
    return Math.round(meta.base + dist * 4.5)
  })()

  const finalPrice = effectiveResult?.valid ? effectiveResult.finalPrice! : basePrice
  const discount = effectiveResult?.valid ? effectiveResult.discount! : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Nova solicitação</h3>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-white" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <Label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Tipo de serviço</Label>
        <div className="grid grid-cols-2 gap-2">
          {SERVICE_TYPES.map((s) => {
            const Icon = ICONS[s.icon] || CircleDot
            const active = svcType === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSvcType(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition ${
                  active ? 'border-sky-500 bg-sky-500/10 shadow-sm shadow-sky-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                <span className="text-xs font-semibold text-white">{s.label}</span>
                <span className="text-[10px] text-slate-500">a partir de R$ {s.base}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Descreva o problema</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Carro parado no acostamento, não dá partida..."
          className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
          rows={2}
        />
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Forma de pagamento</Label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const Icon = PAY_ICONS[m.icon]
            const active = payment === m.id
            return (
              <button
                key={m.id}
                onClick={() => setPayment(m.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition ${
                  active ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                <span className="text-[11px] font-semibold text-white">{m.label}</span>
                <span className="text-[9px] text-slate-500">{m.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Promo code */}
      <div>
        <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
          <Tag className="mr-1 inline h-3 w-3 text-sky-400" />
          Cupom de desconto
        </Label>
        <div className="flex gap-2">
          <Input
            value={promoInput}
            onChange={(e) => onPromoInput(e.target.value.toUpperCase())}
            placeholder="Ex: SOCORRO10"
            className="border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 uppercase"
          />
          {promoValidating && !effectiveResult && (
            <Loader2 className="mt-2.5 h-4 w-4 animate-spin text-slate-500" />
          )}
        </div>
        {effectiveResult && (
          <div className={`mt-1.5 flex items-center gap-1.5 rounded-lg border p-2 text-xs ${
            effectiveResult.valid
              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}>
            {effectiveResult.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            <span>{effectiveResult.message}</span>
          </div>
        )}
        {!promoInput && (
          <p className="mt-1 text-[10px] text-slate-500">
            Experimente: <span className="font-mono text-sky-400">SOCORRO10</span> · <span className="font-mono text-sky-400">BEMVINDO20</span> · <span className="font-mono text-sky-400">PROMO15</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {/* Favorites quick-select */}
        {favorites.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase text-slate-500">Locais favoritos</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {favorites.map((fav) => {
                const FavIcon = fav.icon === 'home' ? Home : fav.icon === 'work' ? Briefcase : Star
                return (
                  <div key={fav.id} className="group relative shrink-0">
                    <button
                      onClick={() => handleSelectFavorite(fav)}
                      className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5 text-[10px] font-semibold text-sky-400 transition hover:bg-sky-500/15"
                    >
                      <FavIcon className="h-3 w-3" />
                      {fav.label}
                    </button>
                    <button
                      onClick={() => handleRemoveFavorite(fav.id)}
                      className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-white group-hover:flex"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase text-slate-400">
              <MapPin className="mr-1 inline h-3 w-3 text-sky-400" />
              Local do atendimento
            </Label>
            {!pickupIsFav && !showSaveFav && (
              <button
                onClick={() => setShowSaveFav(true)}
                className="flex items-center gap-0.5 text-[10px] text-sky-400 hover:text-sky-300"
              >
                <Star className="h-2.5 w-2.5" /> Salvar como favorito
              </button>
            )}
            {savedFlash && (
              <span className="flex items-center gap-0.5 text-[10px] text-orange-400">
                <Check className="h-2.5 w-2.5" /> Salvo!
              </span>
            )}
          </div>
          <select
            value={pickupId}
            onChange={(e) => setPickupId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          >
            {presets.map((p: any) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
          {showSaveFav && (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
              <Input
                value={favLabel}
                onChange={(e) => setFavLabel(e.target.value)}
                placeholder="Nome (ex: Casa, Trabalho)"
                className="h-8 border-slate-700 bg-slate-950 text-xs text-white placeholder:text-slate-500"
              />
              <div className="flex gap-1.5">
                {(['home', 'work', 'star'] as const).map((icon) => {
                  const Icon = icon === 'home' ? Home : icon === 'work' ? Briefcase : Star
                  return (
                    <button
                      key={icon}
                      onClick={() => setFavIcon(icon)}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                        favIcon === icon ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  )
                })}
                <Button onClick={handleSaveFavorite} disabled={!favLabel.trim()} size="sm" className="ml-auto h-7 bg-sky-500 px-3 text-[10px] font-bold text-slate-950 hover:bg-sky-400">
                  Salvar
                </Button>
                <Button onClick={() => setShowSaveFav(false)} variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-slate-400">
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
            <Navigation className="mr-1 inline h-3 w-3 text-sky-400" />
            Destino final (reboque)
          </Label>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          >
            {presets.map((p: any) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
        </div>
      </div>

      {/* Price summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Valor do serviço</span>
          <span className={`font-bold ${discount > 0 ? 'text-slate-500 line-through' : 'text-sky-400'}`}>
            R$ {basePrice}
          </span>
        </div>
        {discount > 0 && (
          <>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-orange-400">
                <Tag className="h-3 w-3" /> Desconto ({effectiveResult?.code})
              </span>
              <span className="font-bold text-orange-400">- R$ {discount}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-slate-800 pt-1.5">
              <span className="text-xs font-bold text-white">Total a pagar</span>
              <span className="text-lg font-extrabold text-sky-400">R$ {finalPrice}</span>
            </div>
          </>
        )}
      </div>

      <Button
        onClick={onSubmit}
        disabled={sameLoc}
        className="w-full bg-sky-500 py-5 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-400"
      >
        Confirmar e procurar prestador
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      {sameLoc && <p className="text-center text-xs text-rose-400">Local e destino não podem ser iguais</p>}
    </div>
  )
}

function ServiceTracker({
  svc, onCancel, onRate, rated, onNewRequest,
  messages, onSendChat, chatOpen, setChatOpen, unreadChat,
}: {
  svc: ServiceData
  onCancel: () => void
  onRate: (stars: number, comment: string) => void
  rated: boolean
  onNewRequest: () => void
  messages: any[]
  onSendChat: (text: string) => void
  chatOpen: boolean
  setChatOpen: (v: boolean) => void
  unreadChat: number
}) {
  const status = svc.status
  const statusMeta = STATUS_LABELS[status]
  const isFinal = status === 'completed' || status === 'cancelled' || status === 'expired'
  const isLive = !isFinal
  const PayIcon = PAY_ICONS[PAYMENT_METHODS.find((m) => m.id === svc.paymentMethod)?.icon || 'zap']
  const canChat = isLive && !!svc.provider && ['accepted', 'arriving', 'arrived', 'in_progress'].includes(status)

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <div
        className={`rounded-xl border p-3 ${
          status === 'completed' ? 'border-orange-500/40 bg-orange-500/10'
          : status === 'cancelled' || status === 'expired' ? 'border-rose-500/40 bg-rose-500/10'
          : 'border-sky-500/40 bg-sky-500/10'
        }`}
      >
        <div className="flex items-center gap-2">
          {isLive && <Loader2 className="h-4 w-4 animate-spin text-sky-400" />}
          {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-orange-400" />}
          {(status === 'cancelled' || status === 'expired') && <AlertTriangle className="h-4 w-4 text-rose-400" />}
          <p className="text-sm font-bold text-white">{statusMeta.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Serviço #{svc.id.slice(-6).toUpperCase()} · {svc.typeLabel}
        </p>
      </div>

      {/* Provider card */}
      {svc.provider && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 bg-gradient-to-br from-orange-500 to-orange-700">
              <AvatarFallback className="bg-transparent text-sm font-bold text-white">
                {svc.provider.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{svc.provider.name}</p>
              <p className="text-xs text-slate-400">{svc.provider.vehicle} · {svc.provider.plate}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-sky-400">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                <span className="text-xs font-bold">{svc.provider.rating.toFixed(1)}</span>
              </div>
              {isLive && (
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7 border-slate-700 bg-slate-800 text-orange-400 hover:bg-slate-700">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setChatOpen(!chatOpen)}
                    className={`relative h-7 w-7 border-slate-700 bg-slate-800 text-sky-400 hover:bg-slate-700 ${chatOpen ? 'ring-2 ring-sky-500' : ''}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {unreadChat > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
                        {unreadChat}
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {(status === 'accepted' || status === 'arriving') && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">ETA</p>
                <LiveCountdown seconds={svc.etaMin * 60} variant="inline" />
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Distância</p>
                <p className="text-sm font-bold text-white">{svc.distanceKm} km</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Valor</p>
                <p className="text-sm font-bold text-sky-400">R$ {svc.price}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notified providers indicator (multi-provider) */}
      {(status === 'searching' || status === 'offered') && svc.notifiedCount > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs">
          <div className="flex -space-x-1.5">
            {Array.from({ length: Math.min(svc.notifiedCount, 4) }).map((_, i) => (
              <div key={i} className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-gradient-to-br from-sky-500 to-sky-700 text-[8px] font-bold text-white">
                <Truck className="h-2.5 w-2.5" />
              </div>
            ))}
          </div>
          <span className="text-sky-300">
            <span className="font-bold">{svc.notifiedCount} prestadores</span> sendo notificados simultaneamente
          </span>
        </div>
      )}

      {/* Live trip progress bar */}
      {svc.provider && (status === 'accepted' || status === 'arriving' || status === 'in_progress') && (
        <TripProgressBar
          provider={svc.provider}
          label={status === 'in_progress' ? 'Rumo ao destino final' : 'Prestador a caminho do local'}
          variant="client"
        />
      )}

      {/* Chat panel (collapsible) */}
      {canChat && chatOpen && (
        <ChatPanel
          messages={messages}
          myRole="client"
          onSend={onSendChat}
          counterpartName={svc.provider?.name || 'Prestador'}
          compact
        />
      )}

      {/* Route + payment */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            <div className="my-1 w-0.5 flex-1 bg-slate-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Local do atendimento</p>
              <p className="text-xs font-medium text-white">{svc.pickupLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Destino final</p>
              <p className="text-xs font-medium text-white">{svc.destinationLabel}</p>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <PayIcon className="h-3.5 w-3.5 text-sky-400" />
            {PAYMENT_METHODS.find((m) => m.id === svc.paymentMethod)?.label}
          </span>
          <div className="flex items-center gap-2">
            {svc.discount > 0 && (
              <span className="text-[10px] text-orange-400">
                <Tag className="mr-0.5 inline h-3 w-3" />{svc.promoCode} -R${svc.discount}
              </span>
            )}
            <span className="font-bold text-sky-400">R$ {svc.price}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Acompanhamento</p>
        <ScrollArea className="max-h-32">
          <div className="space-y-2 pr-2">
            {svc.timeline.slice().reverse().map((ev, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                <div className="flex-1">
                  <p className="text-slate-300">{ev.label}</p>
                  <p className="text-[10px] text-slate-600">{new Date(ev.at).toLocaleTimeString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Rating UI after completion */}
      {status === 'completed' && (
        <RatingCard svc={svc} rated={rated} onRate={onRate} />
      )}

      {/* Client rating received from provider (bidirectional) */}
      {status === 'completed' && svc.clientRating && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3">
          <p className="text-xs font-bold text-white">Avaliação que você recebeu do prestador</p>
          <div className="mt-1 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < svc.clientRating!.stars ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
            ))}
            <span className="ml-1 text-xs font-bold text-sky-400">{svc.clientRating.stars}.0</span>
          </div>
          {svc.clientRating.comment && <p className="mt-1 text-xs italic text-slate-300">"{svc.clientRating.comment}"</p>}
        </div>
      )}

      {/* Actions */}
      {isLive && (
        <>
          <ShareTrackingButton svcId={svc.id} />
          <Button onClick={onCancel} variant="outline" className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10">
            Cancelar solicitação
          </Button>
        </>
      )}
      {isFinal && (
        <Button onClick={onNewRequest} className="w-full bg-sky-500 py-5 text-sm font-bold text-slate-950 hover:bg-sky-400">
          <Shield className="mr-2 h-4 w-4" /> Nova solicitação
        </Button>
      )}
    </div>
  )
}

function RatingCard({ svc, rated, onRate }: { svc: ServiceData; rated: boolean; onRate: (s: number, c: string) => void }) {
  const [stars, setStars] = useState(5)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')

  if (svc.rating || rated) {
    const r = svc.rating
    return (
      <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-center">
        <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-orange-400" />
        <p className="text-sm font-bold text-white">Obrigado pela avaliação!</p>
        {r && (
          <div className="mt-1 flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < r.stars ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
            ))}
          </div>
        )}
        {r?.comment && <p className="mt-1 text-xs italic text-slate-400">"{r.comment}"</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-sky-500/40 bg-gradient-to-b from-sky-500/10 to-transparent p-4">
      <p className="text-sm font-bold text-white">Avalie o atendimento</p>
      <p className="mt-0.5 text-xs text-slate-400">Sua avaliação ajuda outros motoristas.</p>
      <div className="mt-3 flex justify-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const val = i + 1
          const active = val <= (hover || stars)
          return (
            <button
              key={i}
              onMouseEnter={() => setHover(val)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setStars(val)}
              className="transition-transform hover:scale-110"
            >
              <Star className={`h-7 w-7 ${active ? 'text-sky-400' : 'text-slate-700'}`} fill={active ? 'currentColor' : 'none'} />
            </button>
          )
        })}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentário (opcional)..."
        className="mt-3 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
        rows={2}
      />
      <Button onClick={() => onRate(stars, comment.trim())} className="mt-2 w-full bg-sky-500 py-4 text-sm font-bold text-slate-950 hover:bg-sky-400">
        <Send className="mr-1.5 h-4 w-4" /> Enviar avaliação
      </Button>
    </div>
  )
}

function HistoryView({ history, role, onSelect }: { history: ServiceRecord[]; role: 'client' | 'provider'; onSelect: (r: ServiceRecord) => void }) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = history.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    return true
  })

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">
          {role === 'client' ? 'Você ainda não possui serviços' : 'Você ainda não possui atendimentos'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {role === 'client' ? 'Solicite seu primeiro socorro!' : 'Aceite uma chamada para começar.'}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="Todos" />
          {SERVICE_TYPES.map((s) => (
            <FilterChip key={s.id} active={typeFilter === s.id} onClick={() => setTypeFilter(s.id)} label={s.label.split(' ')[0]} />
          ))}
        </div>
        <div className="flex gap-1.5">
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Qualquer status" small />
          <FilterChip active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} label="Concluídos" small />
          <FilterChip active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')} label="Cancelados" small />
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {filtered.length} de {history.length} serviço(s)
      </p>
      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
          Nenhum serviço corresponde aos filtros.
        </div>
      )}
      {filtered.map((r) => {
        const Icon = ICONS[r.icon] || CircleDot
        const PayIcon = PAY_ICONS[PAYMENT_METHODS.find((m) => m.id === r.paymentMethod)?.icon || 'zap']
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-slate-700 hover:bg-slate-900/80"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{r.typeLabel}</p>
                  <p className="text-[10px] text-slate-500">
                    {role === 'client' ? 'Prestador' : 'Cliente'}: {r.counterpartName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-sky-400">R$ {r.price}</span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {r.pickupLabel.split(',')[0]}</span>
              <span className="flex items-center gap-0.5"><PayIcon className="h-3 w-3" /> {PAYMENT_METHODS.find((m) => m.id === r.paymentMethod)?.label}</span>
              <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {new Date(r.completedAt).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              {r.rating && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-2.5 w-2.5 ${i < r.rating!.stars ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
                  ))}
                </div>
              )}
              {r.discount > 0 && (
                <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-[9px] text-orange-400">
                  <Tag className="mr-0.5 h-2.5 w-2.5" /> {r.promoCode}
                </Badge>
              )}
              {r.status === 'cancelled' && (
                <Badge variant="outline" className="border-rose-500/40 text-[9px] text-rose-400">Cancelado</Badge>
              )}
              <span className="ml-auto flex items-center gap-0.5 text-[9px] text-sky-400"><Eye className="h-2.5 w-2.5" /> Detalhes</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ServiceDetailDialog({ record, onClose, role }: { record: ServiceRecord | null; onClose: () => void; role: 'client' | 'provider' }) {
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-800 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {record && (() => {
              const Icon = ICONS[record.icon] || CircleDot
              return <Icon className="h-4 w-4 text-sky-400" />
            })()}
            Detalhes do serviço
          </DialogTitle>
        </DialogHeader>
        {record && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <InfoBox label="Tipo" value={record.typeLabel} />
              <InfoBox label="Status" value={STATUS_LABELS[record.status].label} />
              <InfoBox label={role === 'client' ? 'Prestador' : 'Cliente'} value={record.counterpartName} />
              <InfoBox label="Pagamento" value={PAYMENT_METHODS.find((m) => m.id === record.paymentMethod)?.label || record.paymentMethod} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Trajeto</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <div className="my-1 w-0.5 flex-1 bg-slate-700" />
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">Local</p>
                    <p className="text-xs font-medium text-white">{record.pickupLabel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">Destino</p>
                    <p className="text-xs font-medium text-white">{record.destinationLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Valores</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Valor original</span>
                  <span className="text-slate-300">R$ {record.originalPrice}</span>
                </div>
                {record.discount > 0 && (
                  <div className="flex justify-between text-orange-400">
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Desconto ({record.promoCode})</span>
                    <span>- R$ {record.discount}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-800 pt-1.5">
                  <span className="font-bold text-white">Total</span>
                  <span className="text-base font-extrabold text-sky-400">R$ {record.price}</span>
                </div>
              </div>
            </div>

            {record.description && record.description !== 'Sem detalhes adicionais' && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Descrição do problema</p>
                <p className="text-xs text-slate-300">{record.description}</p>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Linha do tempo</p>
              <div className="space-y-2">
                {record.timeline.map((ev, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                    <div className="flex-1">
                      <p className="text-slate-300">{ev.label}</p>
                      <p className="text-[10px] text-slate-600">{new Date(ev.at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {record.rating && (
              <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  {role === 'client' ? 'Sua avaliação do prestador' : 'Avaliação do cliente'}
                </p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < record.rating!.stars ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
                  ))}
                  <span className="ml-1 text-xs font-bold text-sky-400">{record.rating.stars}.0</span>
                </div>
                {record.rating.comment && <p className="mt-1 text-xs italic text-slate-300">"{record.rating.comment}"</p>}
              </div>
            )}

            {record.clientRating && (
              <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  {role === 'client' ? 'Avaliação recebida do prestador' : 'Sua avaliação do cliente'}
                </p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < record.clientRating!.stars ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
                  ))}
                  <span className="ml-1 text-xs font-bold text-sky-400">{record.clientRating.stars}.0</span>
                </div>
                {record.clientRating.comment && <p className="mt-1 text-xs italic text-slate-300">"{record.clientRating.comment}"</p>}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Solicitado: {new Date(record.createdAt).toLocaleString('pt-BR')}</span>
              <span>Concluído: {new Date(record.completedAt).toLocaleString('pt-BR')}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-xs font-semibold text-white">{value}</p>
    </div>
  )
}

function FilterChip({ active, onClick, label, small }: { active: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
        active
          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
      } ${small ? 'text-[9px]' : ''}`}
    >
      {label}
    </button>
  )
}

function ClientProfileView({ name, loyalty, history }: { name: string; loyalty: LoyaltyInfo | null; history: ServiceRecord[] }) {
  const completedServices = history.filter(h => h.status === 'completed')
  const totalSpent = completedServices.reduce((sum, h) => sum + h.price, 0)
  const ratingsReceived = completedServices.filter(h => h.clientRating)
  const avgRatingReceived = ratingsReceived.length > 0
    ? (ratingsReceived.reduce((sum, h) => sum + (h.clientRating?.stars || 0), 0) / ratingsReceived.length).toFixed(1)
    : '—'
  const ratingsGiven = completedServices.filter(h => h.rating)
  const avgRatingGiven = ratingsGiven.length > 0
    ? (ratingsGiven.reduce((sum, h) => sum + (h.rating?.stars || 0), 0) / ratingsGiven.length).toFixed(1)
    : '—'

  return (
    <div className="space-y-4">
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/10 to-slate-900 p-4">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 text-xl font-extrabold text-slate-950 shadow-lg shadow-sky-500/30">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-base font-extrabold text-white">{name}</p>
            <p className="text-xs text-slate-400">Cliente Help Bibi</p>
            {loyalty && (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-400">
                  <Trophy className="mr-1 h-2.5 w-2.5" /> {loyalty.tier.name}
                </Badge>
                <span className="text-[10px] text-slate-500">{loyalty.points} pontos</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-slate-500">
            <Shield className="h-3 w-3 text-sky-400" /> Serviços totais
          </div>
          <p className="text-xl font-extrabold text-white">{completedServices.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-slate-500">
            <Wallet className="h-3 w-3 text-sky-400" /> Total gasto
          </div>
          <p className="text-xl font-extrabold text-white">R$ {totalSpent}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-slate-500">
            <Star className="h-3 w-3 text-sky-400" /> Nota média dada
          </div>
          <p className="text-xl font-extrabold text-white">{avgRatingGiven} ★</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-slate-500">
            <Heart className="h-3 w-3 text-sky-400" /> Nota recebida
          </div>
          <p className="text-xl font-extrabold text-white">{avgRatingReceived} ★</p>
        </div>
      </div>

      {/* Loyalty card */}
      {loyalty && <LoyaltyCard loyalty={loyalty} rewards={[]} redeemResult={null} onRedeem={() => {}} onClearRedeem={() => {}} />}

      {/* Recent ratings received */}
      {ratingsReceived.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Avaliações recebidas</p>
          <div className="space-y-2">
            {ratingsReceived.slice(0, 5).map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{r.counterpartName}</span>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3 w-3 ${i < (r.clientRating?.stars || 0) ? 'text-sky-400' : 'text-slate-700'}`} fill="currentColor" />
                    ))}
                  </div>
                </div>
                {r.clientRating?.comment && <p className="mt-1 text-[10px] italic text-slate-400">"{r.clientRating.comment}"</p>}
                <p className="mt-0.5 text-[9px] text-slate-600">{new Date(r.completedAt).toLocaleDateString('pt-BR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {completedServices.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center">
          <User className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-xs text-slate-500">Conclua seu primeiro serviço para ver suas estatísticas.</p>
        </div>
      )}
    </div>
  )
}

function ShareTrackingButton({ svcId }: { svcId: string }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = `${window.location.origin}/?track=${svcId}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Help Bibi — Acompanhar serviço', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {}
    }
  }

  return (
    <Button onClick={handleShare} variant="outline" className="w-full border-sky-500/40 text-sky-400 hover:bg-sky-500/10">
      {copied ? (
        <>
          <Check className="mr-2 h-4 w-4" /> Link copiado!
        </>
      ) : (
        <>
          <Share2 className="mr-2 h-4 w-4" /> Compartilhar rastreamento
        </>
      )}
    </Button>
  )
}
