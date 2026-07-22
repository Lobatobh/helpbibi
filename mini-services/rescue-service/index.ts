import { createServer } from 'http'
import { randomUUID } from 'crypto'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import {
  AUTH_POSITION_MAX_AGE_MS,
  createPublicDemoMatchingOptions,
  getMatchingRejectionReason,
  rankProvidersByDistanceExcluding,
} from './matching'
import { calculatePrice } from '../../src/server/pricing/pricing-engine'
import { validateEnv } from '../../src/server/env'
import { audit } from '../../src/server/audit'
import {
  acceptServiceOffer,
  createOperationalService,
  declineServiceOffer,
  registerServiceOffers,
  transitionServiceStatus,
  updateServiceProviderPosition,
} from '../../src/server/services/service-lifecycle'
import { createServiceChatMessage, listServiceChatMessages } from '../../src/server/services/service-chat'
import { loadServiceWithParticipants } from '../../src/server/services/service-access'
import { COOKIE_NAME, getSessionUserFromCookieHeader } from '../../src/server/auth/session-token'
import { hasCurrentConsents, hasCurrentConsentType } from '../../src/server/consents/consent-service'
// FASE 26 — Socket.IO hardening helpers (per-socket rate limit + payload validation)
import {
  socketRateBuckets, socketRateLimit,
  isValidLatLng, isValidText, isNonEmptyString,
} from './validation'

// FASE 25.2/25.4 — Environment validation + CORS hardening
const _envResult = validateEnv()
const IS_PROD = process.env.NODE_ENV === 'production'
const IS_DEV_MODE = !IS_PROD

function parseCorsOrigin(): string | string[] {
  const raw = process.env.SOCKET_CORS_ORIGIN
  if (!raw) { if (IS_PROD) { console.error('[rescue-service] SOCKET_CORS_ORIGIN not set in production — blocking all origins'); return [] }; return '*' }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
const CORS_ORIGIN = parseCorsOrigin()

const db = new PrismaClient({ log: ['error'] })

const httpServer = createServer((req, res) => {
  const origin = req.headers.origin
  if (origin && (CORS_ORIGIN === '*' || (Array.isArray(CORS_ORIGIN) && CORS_ORIGIN.includes(origin)))) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, name: 'Help Bibi', providers: providers.size, activeServices: services.size })); return }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Help Bibi rescue-service running')
})

const io = new Server(httpServer, { path: '/socket.io', cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }, pingTimeout: 60000, pingInterval: 25000 })

// ----------------------- Types -----------------------
type Role = 'client' | 'provider'
type LatLng = { lat: number; lng: number }
type ServiceType = 'reboque' | 'pneu' | 'bateria' | 'combustivel' | 'chaveiro' | 'pane'
type PaymentMethod = 'pix' | 'card' | 'cash'
type ServiceStatus =
  | 'searching' | 'offered' | 'accepted' | 'arriving' | 'arrived'
  | 'in_progress' | 'completed' | 'cancelled' | 'expired'

type Rating = { stars: number; comment: string; at: number; from: string }
type ChatMessage = {
  id: string; serviceId: string; from: 'client' | 'provider'; fromName: string; text: string; at: number
}

type Provider = {
  id: string; socketId: string; name: string; vehicle: string; plate: string;
  rating: number; ratingSum: number; ratingCount: number; completedCount: number; earningsToday: number;
  online: boolean; position: LatLng | null; destination?: LatLng | null; currentServiceId?: string | null;
  tripStartPos?: LatLng | null; tripTarget?: LatLng | null; tripStartedAt?: number | null; tripTotalKm?: number;
  // DB linkage
  dbUserId?: string; dbProviderProfileId?: string;
  isDemoProvider: boolean; isVerified: boolean; approvalStatus: string; documentStatus: string; vehicleStatus: string; userStatus: string; isGpsPosition: boolean;
  isAvailableIntent?: boolean; locationConsentCurrent?: boolean; lastPositionAt?: number | null;
}

type ServiceRequest = {
  id: string; clientId: string; clientName: string; type: ServiceType; description: string;
  pickup: LatLng; pickupLabel: string; destination: LatLng | null; destinationLabel: string;
  price: number; originalPrice: number; discount: number; promoCode: string | null;
  distanceKm: number; etaMin: number; status: ServiceStatus; paymentMethod: PaymentMethod;
  providerId?: string | null; notifiedProviderIds: string[]; rejectedProviderIds: string[];
  createdAt: number; acceptedAt?: number | null; completedAt?: number | null;
  timeline: TimelineEvent[]; rating?: Rating | null; clientRating?: Rating | null; loyaltyPoints: number;
  // DB linkage
  dbServiceId?: string;
  // FASE 25.4 — Pricing breakdown
  breakdown?: any;
}

type TimelineEvent = { status: ServiceStatus; label: string; at: number }

type ServiceTypeMeta = { label: string; basePrice: number; icon: string }

type AuthenticatedSocket = {
  userId: string
  role: 'CLIENT' | 'PROVIDER'
  name: string
  email: string | null
  providerProfileId?: string
}

const SERVICE_TYPES: Record<ServiceType, ServiceTypeMeta> = {
  reboque: { label: 'Reboque / Guincho', basePrice: 180, icon: 'tow-truck' },
  pneu: { label: 'Troca de Pneu', basePrice: 90, icon: 'tire' },
  bateria: { label: 'Carga de Bateria', basePrice: 70, icon: 'battery' },
  combustivel: { label: 'Combustível', basePrice: 60, icon: 'fuel' },
  chaveiro: { label: 'Chaveiro Automotivo', basePrice: 120, icon: 'key' },
  pane: { label: 'Pane Seca / Mecânica', basePrice: 110, icon: 'wrench' },
}

// Map frontend status to Prisma enum
const STATUS_MAP: Record<ServiceStatus, string> = {
  searching: 'REQUESTED',
  offered: 'OFFERED',
  accepted: 'ACCEPTED',
  arriving: 'PROVIDER_EN_ROUTE',
  arrived: 'ARRIVED',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  cancelled: 'CANCELED',
  expired: 'EXPIRED',
}

// Map frontend service type to Prisma enum
const TYPE_MAP: Record<ServiceType, string> = {
  reboque: 'REBOQUE', pneu: 'PNEU', bateria: 'BATERIA',
  combustivel: 'COMBUSTIVEL', chaveiro: 'CHAVEIRO', pane: 'PANE',
}

// Map frontend payment method to Prisma enum
const PAYMENT_MAP: Record<PaymentMethod, string> = {
  pix: 'PIX', card: 'CARD', cash: 'CASH',
}

type PromoDef = { type: 'percent' | 'fixed'; value: number; label: string }
const PROMO_CODES: Record<string, PromoDef> = {
  HELPBIBI10: { type: 'percent', value: 10, label: '10% OFF' },
  BEMVINDO20: { type: 'fixed', value: 20, label: 'R$ 20 OFF' },
  PROMO15: { type: 'percent', value: 15, label: '15% OFF' },
}

const LOYALTY_REWARDS = [
  { id: 'reward_5pct', cost: 100, code: 'FIDEL5', type: 'percent' as const, value: 5, label: '5% OFF', desc: 'Cupom de 5% de desconto' },
  { id: 'reward_10pct', cost: 200, code: 'FIDEL10', type: 'percent' as const, value: 10, label: '10% OFF', desc: 'Cupom de 10% de desconto' },
  { id: 'reward_25', cost: 300, code: 'FIDEL25', type: 'fixed' as const, value: 25, label: 'R$ 25 OFF', desc: 'Cupom de R$ 25 de desconto' },
  { id: 'reward_15pct', cost: 500, code: 'FIDEL15', type: 'percent' as const, value: 15, label: '15% OFF', desc: 'Cupom de 15% de desconto' },
]

const LOYALTY_TIERS = [
  { name: 'Bronze', min: 0, color: '#a16207', perk: '5% OFF no próximo' },
  { name: 'Prata', min: 200, color: '#94a3b8', perk: '8% OFF + prioridade' },
  { name: 'Ouro', min: 500, color: '#00BFFF', perk: '12% OFF + suporte VIP' },
  { name: 'Diamante', min: 1000, color: '#38bdf8', perk: '15% OFF + benefícios exclusivos' },
]
const loyaltyTier = (points: number) => {
  let tier = LOYALTY_TIERS[0]
  for (const t of LOYALTY_TIERS) if (points >= t.min) tier = t
  return tier
}
const nextTierMin = (points: number): number | null => {
  for (const t of LOYALTY_TIERS) if (points < t.min) return t.min
  return null
}
const clientLoyalty = new Map<string, number>()
const MULTI_NOTIFY_COUNT = 3

// ----------------------- State (in-memory for realtime) -----------------------
const providers = new Map<string, Provider>()
const clients = new Map<string, { id: string; socketId: string; name: string }>()
const services = new Map<string, ServiceRequest>()
const chats = new Map<string, ChatMessage[]>()
const socketToRole = new Map<string, { role: Role; id: string }>()
const authenticatedProviders = new Map<string, Provider>()
const authenticatedClients = new Map<string, { id: string; socketId: string; name: string; dbUserId: string }>()
const authenticatedServices = new Map<string, ServiceRequest>()
const authenticatedSocketToRole = new Map<string, { role: Role; id: string }>()
const authenticatedSockets = new Map<string, AuthenticatedSocket>()

const CITY = { center: { lat: -23.5505, lng: -46.6333 }, span: 0.05 }

// ----------------------- Helpers -----------------------
const uid = (prefix = '') => `${prefix}${randomUUID()}`

const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// FASE 25.2/25.4 — Matching options + pricing delegation
const MATCHING_OPTIONS = createPublicDemoMatchingOptions(IS_PROD)
const calcPrice = (type: ServiceType, distanceKm: number): number => {
  const breakdown = calculatePrice({ serviceType: type as any, pickup: { lat: 0, lng: 0 }, destination: null, providerPosition: null, pickupDistanceKm: 0, destinationDistanceKm: distanceKm })
  return Math.round(breakdown.total)
}
const calcPriceBreakdown = (type: ServiceType, pickup: LatLng, destination: LatLng | null, distanceKm: number, promoCode?: string | null) => {
  const promo = promoCode ? PROMO_CODES[promoCode.toUpperCase()] : null
  return calculatePrice({ serviceType: type as any, pickup, destination, providerPosition: null, pickupDistanceKm: 0, destinationDistanceKm: distanceKm, promoCode: promo ? promoCode : null, promoType: promo ? (promo.type as 'percent' | 'fixed') : null, promoValue: promo ? promo.value : null })
}

const applyPromo = (price: number, code: string | null): { final: number; discount: number; valid: boolean } => {
  if (!code) return { final: price, discount: 0, valid: false }
  const promo = PROMO_CODES[code.toUpperCase()]
  if (!promo) return { final: price, discount: 0, valid: false }
  let discount = 0
  if (promo.type === 'percent') discount = Math.round((price * promo.value) / 100)
  else discount = Math.min(promo.value, price)
  return { final: Math.max(0, price - discount), discount, valid: true }
}

const calcEta = (distanceKm: number) => Math.max(3, Math.round(distanceKm / 0.5))

const pushTimeline = (svc: ServiceRequest, status: ServiceStatus, label: string) => {
  svc.status = status
  svc.timeline.push({ status, label, at: Date.now() })
}

const stepToward = (from: LatLng, to: LatLng, stepKm: number): { pos: LatLng; arrived: boolean } => {
  const dist = haversineKm(from, to)
  if (dist <= stepKm) return { pos: { ...to }, arrived: true }
  const ratio = stepKm / dist
  return {
    pos: { lat: from.lat + (to.lat - from.lat) * ratio, lng: from.lng + (to.lng - from.lng) * ratio },
    arrived: false,
  }
}

// FASE 26 — Socket.IO hardening: per-socket rate limiting + payload validation
// (Helpers extracted to validation.ts and imported above.)

const providerPublic = (p: Provider) => ({
  id: p.id, name: p.name, vehicle: p.vehicle, rating: p.rating,
  position: p.position, online: p.online, completedCount: p.completedCount,
})

const getProviderOperationBlockReason = (p: Provider): string | null => {
  if (p.userStatus !== 'ACTIVE') return 'user_not_active'
  if (p.isDemoProvider) {
    if (!MATCHING_OPTIONS.isDevMode && !MATCHING_OPTIONS.demoMode) return 'demo_mode_disabled'
    return null
  }
  if (p.approvalStatus !== 'APPROVED') return `provider_${p.approvalStatus.toLowerCase()}`
  if (p.isVerified !== true) return 'provider_not_verified'
  if (p.documentStatus !== 'APPROVED') return 'documents_not_approved'
  if (p.vehicleStatus !== 'APPROVED') return 'vehicle_not_approved'
  return null
}

const availableProviderPublic = () => Array.from(providers.values())
  .filter((x) => x.online && !x.currentServiceId && getProviderOperationBlockReason(x) === null)
  .map(providerPublic)

const emitProvider = (p: Provider) => {
  io.to(p.socketId).emit('provider:state', {
    id: p.id, name: p.name, vehicle: p.vehicle, plate: p.plate,
    rating: p.rating, online: p.online, position: p.position,
    currentServiceId: p.currentServiceId, completedCount: p.completedCount,
    earningsToday: p.earningsToday,
    approvalStatus: p.approvalStatus, canOperate: getProviderOperationBlockReason(p) === null,
    tripStartPos: p.tripStartPos || null, tripTarget: p.tripTarget || null,
    tripStartedAt: p.tripStartedAt || null, tripTotalKm: p.tripTotalKm || 0,
  } as any)
  io.emit('providers:nearby', availableProviderPublic())
}

const sanitizeService = (svc: ServiceRequest, providerMap: Map<string, Provider> = providers) => ({
  id: svc.id, clientId: svc.clientId, clientName: svc.clientName,
  type: svc.type, typeLabel: SERVICE_TYPES[svc.type].label, icon: SERVICE_TYPES[svc.type].icon,
  description: svc.description, pickup: svc.pickup, pickupLabel: svc.pickupLabel,
  destination: svc.destination, destinationLabel: svc.destinationLabel,
  price: svc.price, originalPrice: svc.originalPrice, discount: svc.discount, promoCode: svc.promoCode,
  distanceKm: svc.distanceKm, etaMin: svc.etaMin, status: svc.status,
  paymentMethod: svc.paymentMethod, providerId: svc.providerId,
  notifiedProviderIds: svc.notifiedProviderIds, notifiedCount: svc.notifiedProviderIds.length,
  provider: svc.providerId ? providerMap.get(svc.providerId) : null,
  createdAt: svc.createdAt, acceptedAt: svc.acceptedAt, completedAt: svc.completedAt,
  timeline: svc.timeline, rating: svc.rating || null, clientRating: svc.clientRating || null,
  loyaltyPoints: svc.loyaltyPoints,
})

const ACTIVE_DB_STATUSES = ['REQUESTED', 'OFFERED', 'ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']

const DB_STATUS_TO_SOCKET: Record<string, ServiceStatus> = {
  REQUESTED: 'searching',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  PROVIDER_EN_ROUTE: 'arriving',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'expired',
}

const DB_TYPE_TO_SOCKET: Record<string, ServiceType> = {
  REBOQUE: 'reboque',
  PNEU: 'pneu',
  BATERIA: 'bateria',
  COMBUSTIVEL: 'combustivel',
  CHAVEIRO: 'chaveiro',
  PANE: 'pane',
}

const DB_PAYMENT_TO_SOCKET: Record<string, PaymentMethod> = {
  PIX: 'pix',
  CARD: 'card',
  CASH: 'cash',
}

const parseDbLocation = (value: string): LatLng | null => {
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed
  } catch {
    // ignore legacy malformed data
  }
  return null
}

const authenticatedServiceInclude = {
  client: { select: { id: true, name: true } },
  provider: { include: { user: { select: { id: true, name: true } } } },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  offers: { orderBy: { createdAt: 'asc' as const } },
} as const

const serviceFromDb = (dbSvc: any): ServiceRequest => {
  const type = DB_TYPE_TO_SOCKET[dbSvc.type] || 'reboque'
  const status = DB_STATUS_TO_SOCKET[dbSvc.status] || 'expired'
  const pickup = parseDbLocation(dbSvc.pickup)
  if (!pickup) throw new Error('ServiceRequest has an invalid pickup location')
  const pendingOffers = (dbSvc.offers || []).filter((offer: any) => offer.status === 'PENDING').map((offer: any) => offer.providerId)
  return {
    id: dbSvc.id,
    clientId: dbSvc.clientId,
    clientName: dbSvc.client?.name || 'Cliente',
    type,
    description: dbSvc.description || '',
    pickup,
    pickupLabel: dbSvc.pickupLabel,
    destination: parseDbLocation(dbSvc.destination),
    destinationLabel: dbSvc.destinationLabel,
    price: dbSvc.price,
    originalPrice: dbSvc.originalPrice,
    discount: dbSvc.discount,
    promoCode: dbSvc.promoCode,
    distanceKm: dbSvc.distanceKm,
    etaMin: dbSvc.etaMin,
    status,
    paymentMethod: DB_PAYMENT_TO_SOCKET[dbSvc.paymentMethod] || 'pix',
    providerId: dbSvc.providerId,
    notifiedProviderIds: pendingOffers,
    rejectedProviderIds: (dbSvc.offers || []).filter((offer: any) => offer.status === 'DECLINED').map((offer: any) => offer.providerId),
    createdAt: dbSvc.createdAt.getTime(),
    acceptedAt: dbSvc.acceptedAt?.getTime() || null,
    completedAt: dbSvc.completedAt?.getTime() || null,
    timeline: (dbSvc.timeline || []).map((event: any) => ({
      status: DB_STATUS_TO_SOCKET[event.status] || 'expired',
      label: event.label,
      at: event.createdAt.getTime(),
    })),
    rating: null,
    clientRating: null,
    loyaltyPoints: dbSvc.loyaltyPoints || 0,
    dbServiceId: dbSvc.id,
  }
}

const loadDbService = (serviceId: string) => db.serviceRequest.findUnique({
  where: { id: serviceId },
  include: authenticatedServiceInclude,
})

const findActiveDbServiceForClient = (clientId: string) => db.serviceRequest.findFirst({
  where: { clientId, status: { in: ACTIVE_DB_STATUSES as any } },
  include: authenticatedServiceInclude,
  orderBy: { createdAt: 'desc' },
})

const findActiveDbServiceForProvider = (providerId: string) => db.serviceRequest.findFirst({
  where: { providerId, status: { in: ACTIVE_DB_STATUSES as any } },
  include: authenticatedServiceInclude,
  orderBy: { createdAt: 'desc' },
})

function rememberDbService(dbSvc: any): ServiceRequest {
  const svc = serviceFromDb(dbSvc)
  authenticatedServices.set(svc.id, svc)
  return svc
}

async function emitAuthenticatedService(serviceId: string) {
  const dbSvc = await loadDbService(serviceId)
  if (!dbSvc) return null
  const svc = rememberDbService(dbSvc)
  const payload = sanitizeService(svc, authenticatedProviders)
  const client = authenticatedClients.get(dbSvc.clientId)
  if (client) io.to(client.socketId).emit('auth:service:update', payload)
  if (dbSvc.providerId) {
    const provider = authenticatedProviders.get(dbSvc.providerId)
    if (provider) io.to(provider.socketId).emit('auth:service:update', payload)
  }
  return svc
}

function currentUserFromAuth(auth: AuthenticatedSocket) {
  return {
    id: auth.userId,
    role: auth.role,
    name: auth.name,
    email: auth.email,
  }
}

async function emitAuthenticatedChatMessage(serviceId: string, message: ChatMessage) {
  const service = await loadServiceWithParticipants(serviceId)
  if (!service) return
  authenticatedSockets.forEach((auth, socketId) => {
    const isClient = auth.role === 'CLIENT' && auth.userId === service.clientId
    const isProvider = auth.role === 'PROVIDER' && !!service.providerId && auth.providerProfileId === service.providerId
    if (isClient || isProvider) {
      io.to(socketId).emit('auth:chat:new', message)
    }
  })
}

function emitAuthenticatedProviderState(p: Provider) {
  io.to(p.socketId).emit('auth:provider:state', {
    id: p.id,
    name: p.name,
    vehicle: p.vehicle,
    plate: p.plate,
    online: p.online,
    canOperate: getProviderOperationBlockReason(p) === null,
    currentServiceId: p.currentServiceId || null,
    approvalStatus: p.approvalStatus,
    positionFresh: !!p.position && !!p.lastPositionAt && Date.now() - p.lastPositionAt <= AUTH_POSITION_MAX_AGE_MS,
    locationConsentCurrent: p.locationConsentCurrent === true,
  })
}

const emitService = (svc: ServiceRequest) => {
  const payload = sanitizeService(svc)
  const client = clients.get(svc.clientId)
  if (client) io.to(client.socketId).emit('service:update', payload)
  if (svc.providerId) {
    const p = providers.get(svc.providerId)
    if (p) io.to(p.socketId).emit('service:update', payload)
  }
}

function emitLiveTrackingUpdate(svc: ServiceRequest, p: Provider) {
  emitService(svc)
  const now = Date.now()
  if (now - ((p as any)._lastTrackingLogAt || 0) >= 3000) {
    ;(p as any)._lastTrackingLogAt = now
    console.log(`[tracking] update emitted service=${svc.id} provider=${p.id} status=${svc.status}`)
  }
}

const emitChatToService = (serviceId: string, msg?: ChatMessage) => {
  const svc = services.get(serviceId)
  if (!svc) return
  if (msg) {
    if (!chats.has(serviceId)) chats.set(serviceId, [])
    chats.get(serviceId)!.push(msg)
  }
  const payload = { serviceId, messages: chats.get(serviceId) || [] }
  const client = clients.get(svc.clientId)
  if (client) {
    io.to(client.socketId).emit('chat:messages', payload)
    if (msg && msg.from === 'provider') io.to(client.socketId).emit('chat:new', msg)
  }
  if (svc.providerId) {
    const p = providers.get(svc.providerId)
    if (p) {
      io.to(p.socketId).emit('chat:messages', payload)
      if (msg && msg.from === 'client') io.to(p.socketId).emit('chat:new', msg)
    }
  }
}

const logMatchingDiagnostics = (svc: ServiceRequest, providerPool: Provider[], candidates: Provider[]) => {
  console.log(`[matching] service=${svc.id} type=${svc.type} providers=${providerPool.length} candidates=${candidates.length}`)
  providerPool.forEach((provider) => {
    const reason = getMatchingRejectionReason(provider, MATCHING_OPTIONS)
    if (reason) {
      console.log(`[matching] discarded service=${svc.id} provider=${provider.id} reason=${reason}`)
    }
  })
}

const excludedProviderIdsFor = (svc: ServiceRequest) => new Set([
  ...svc.notifiedProviderIds,
  ...svc.rejectedProviderIds,
])

const clearOfferTimer = (svc: ServiceRequest) => {
  if ((svc as any)._expireTimer) {
    clearTimeout((svc as any)._expireTimer)
    ;(svc as any)._expireTimer = null
  }
}

function closeServiceWithoutProviders(svc: ServiceRequest, label: string) {
  clearOfferTimer(svc)
  pushTimeline(svc, 'expired', label)

  const providerPayload = sanitizeService(svc)
  svc.notifiedProviderIds.forEach((pid) => {
    const provider = providers.get(pid)
    if (!provider) return
    if (provider.currentServiceId === svc.id) provider.currentServiceId = null
    provider.destination = null
    provider.tripStartPos = null
    provider.tripTarget = null
    provider.tripStartedAt = null
    provider.tripTotalKm = 0
    provider.online = true
    emitProvider(provider)
    io.to(provider.socketId).emit('service:update', providerPayload)
  })

  svc.providerId = null
  svc.notifiedProviderIds = []
  emitService(svc)
  console.log(`[service] request closed service=${svc.id} reason=no_candidates`)
  console.log(`[service] client notified closed service=${svc.id} status=${svc.status}`)
}

function offerServiceToProviders(svc: ServiceRequest, toNotify: Provider[], label: string) {
  svc.notifiedProviderIds = toNotify.map((p) => p.id)
  const primary = toNotify[0]
  svc.providerId = primary.id
  primary.currentServiceId = svc.id
  pushTimeline(svc, 'offered', label)
  emitService(svc)
  emitProvider(primary)
  toNotify.forEach((p) => io.to(p.socketId).emit('service:offer', sanitizeService(svc)))
  console.log(`[service] offer emitted service=${svc.id} providers=${svc.notifiedProviderIds.join(',')} status=${svc.status}`)
  scheduleOfferExpiry(svc)
}

function scheduleOfferExpiry(svc: ServiceRequest) {
  clearOfferTimer(svc)
  ;(svc as any)._expireTimer = setTimeout(() => {
    const s = services.get(svc.id)
    if (!s || s.status !== 'offered') return

    const expiryLabel = `Prestador(es) não respondeu(ram) a tempo — reofertando...`
    pushTimeline(s, 'expired', expiryLabel)
    s.notifiedProviderIds.forEach((pid) => {
      const provider = providers.get(pid)
      if (!provider) return
      if (provider.currentServiceId === s.id) provider.currentServiceId = null
      emitProvider(provider)
    })

    const nextBatch = rankProvidersByDistanceExcluding(
      Array.from(providers.values()) as any,
      s.pickup,
      MATCHING_OPTIONS,
      excludedProviderIdsFor(s),
      MULTI_NOTIFY_COUNT
    ) as unknown as Provider[]

    if (nextBatch.length > 0) {
      offerServiceToProviders(
        s,
        nextBatch,
        `Chamada enviada para ${nextBatch.length} prestador(es): ${nextBatch.map((p) => p.name).join(', ')}`
      )
      return
    }

    closeServiceWithoutProviders(s, 'Nenhum prestador disponível')
  }, 12000)
}

async function resolveAuthenticatedSocket(cookieHeader: string | undefined): Promise<AuthenticatedSocket | null> {
  const session = getSessionUserFromCookieHeader(cookieHeader)
  if (!session || (session.role !== 'CLIENT' && session.role !== 'PROVIDER')) return null
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      status: true,
      providerProfile: { select: { id: true } },
    },
  }).catch(() => null)
  if (!user || user.role !== session.role || user.status !== 'ACTIVE') return null
  return {
    userId: user.id,
    role: user.role as 'CLIENT' | 'PROVIDER',
    name: user.name,
    email: user.email,
    providerProfileId: user.providerProfile?.id,
  }
}

async function bindAuthenticatedClient(socket: any, auth: AuthenticatedSocket) {
  authenticatedClients.set(auth.userId, { id: auth.userId, socketId: socket.id, name: auth.name, dbUserId: auth.userId })
  authenticatedSocketToRole.set(socket.id, { role: 'client', id: auth.userId })
  const dbSvc = await findActiveDbServiceForClient(auth.userId)
  if (dbSvc) rememberDbService(dbSvc)
  socket.emit('auth:snapshot', {
    service: dbSvc ? sanitizeService(serviceFromDb(dbSvc)) : null,
  })
}

async function bindAuthenticatedProvider(socket: any, auth: AuthenticatedSocket) {
  if (!auth.providerProfileId) {
    socket.emit('auth:error', { message: 'Perfil de prestador nao encontrado.' })
    return
  }
  const profile = await db.providerProfile.findUnique({
    where: { id: auth.providerProfileId },
    include: { user: { select: { id: true, name: true, status: true } } },
  })
  if (!profile) {
    socket.emit('auth:error', { message: 'Perfil de prestador nao encontrado.' })
    return
  }
  const dbSvc = await findActiveDbServiceForProvider(profile.id)
  const consentsCurrent = await hasCurrentConsents(auth.userId, auth.role, db as any)
  const locationConsentCurrent = await hasCurrentConsentType(auth.userId, 'LOCATION', db as any)
  if (!consentsCurrent && profile.isAvailable) {
    await db.providerProfile.update({ where: { id: profile.id }, data: { isAvailable: false } }).catch(() => null)
  }
  const provider: Provider = {
    id: profile.id,
    socketId: socket.id,
    name: profile.user.name,
    vehicle: profile.vehicle,
    plate: profile.plate,
    rating: profile.rating,
    ratingSum: profile.ratingSum,
    ratingCount: profile.ratingCount,
    completedCount: profile.completedCount,
    earningsToday: profile.earningsToday,
    online: false,
    position: null,
    currentServiceId: dbSvc?.id || null,
    dbUserId: auth.userId,
    dbProviderProfileId: profile.id,
    isDemoProvider: false,
    isVerified: profile.isVerified,
    approvalStatus: profile.approvalStatus,
    documentStatus: profile.documentStatus,
    vehicleStatus: profile.vehicleStatus,
    userStatus: profile.user.status || 'ACTIVE',
    isGpsPosition: false,
    isAvailableIntent: consentsCurrent && profile.isAvailable,
    locationConsentCurrent,
    lastPositionAt: null,
  }
  authenticatedProviders.set(provider.id, provider)
  authenticatedSocketToRole.set(socket.id, { role: 'provider', id: provider.id })
  if (dbSvc) rememberDbService(dbSvc)
  emitAuthenticatedProviderState(provider)
  socket.emit('auth:snapshot', {
    provider: {
      id: provider.id,
      name: provider.name,
      vehicle: provider.vehicle,
      plate: provider.plate,
      online: provider.online,
      canOperate: consentsCurrent && getProviderOperationBlockReason(provider) === null,
      currentServiceId: provider.currentServiceId || null,
      approvalStatus: provider.approvalStatus,
      positionFresh: false,
      locationConsentCurrent,
    },
    service: dbSvc ? sanitizeService(serviceFromDb(dbSvc)) : null,
  })
}

async function bindAuthenticatedSocket(socket: any) {
  const auth = await resolveAuthenticatedSocket(socket.handshake.headers.cookie)
  if (!auth) return null
  authenticatedSockets.set(socket.id, auth)
  if (auth.role === 'CLIENT') await bindAuthenticatedClient(socket, auth)
  if (auth.role === 'PROVIDER') await bindAuthenticatedProvider(socket, auth)
  console.log(`[socket] authenticated socket=${socket.id} user=${auth.userId} role=${auth.role}`)
  return auth
}

async function closeAuthenticatedServiceWithoutProviders(svc: ServiceRequest, label: string) {
  clearOfferTimer(svc)
  pushTimeline(svc, 'expired', label)
  if (svc.dbServiceId) {
    await transitionServiceStatus(db as any, svc.dbServiceId, 'EXPIRED' as any, {
      label,
      actorRole: 'SYSTEM',
      eventType: 'service_expired' as any,
    }).catch(() => null)
    await emitAuthenticatedService(svc.dbServiceId)
  } else {
    emitService(svc)
  }
}

async function offerAuthenticatedServiceToProviders(svc: ServiceRequest, toNotify: Provider[], label: string) {
  if (!svc.dbServiceId || toNotify.length === 0) return
  const dbProviderIds = toNotify
    .map((provider) => provider.dbProviderProfileId)
    .filter((id): id is string => !!id)

  const result = await registerServiceOffers(db as any, svc.dbServiceId, dbProviderIds, {
    label,
    actorRole: 'SYSTEM',
    metadata: { socketProviderIds: toNotify.map((provider) => provider.id), authenticated: true },
    audit: audit as any,
  })
  const offered = toNotify.filter((provider) => result.offeredProviderIds.includes(provider.dbProviderProfileId || ''))
  if (offered.length === 0) {
    await closeAuthenticatedServiceWithoutProviders(svc, 'Nenhum prestador disponivel no momento')
    return
  }

  svc.notifiedProviderIds = offered.map((provider) => provider.id)
  svc.providerId = null
  pushTimeline(svc, 'offered', label)
  authenticatedServices.set(svc.id, svc)
  const payload = sanitizeService(svc, authenticatedProviders)
  const client = authenticatedClients.get(svc.clientId)
  if (client) io.to(client.socketId).emit('auth:service:update', payload)
  offered.forEach((provider) => io.to(provider.socketId).emit('auth:service:offer', payload))
  console.log(`[auth-service] offer emitted service=${svc.id} providers=${svc.notifiedProviderIds.join(',')}`)
}

function authenticatedCandidateProviders(svc: ServiceRequest): Provider[] {
  return rankProvidersByDistanceExcluding(
    Array.from(authenticatedProviders.values()).filter((provider) => !provider.isDemoProvider && !!provider.dbProviderProfileId) as any,
    svc.pickup,
    { isDevMode: IS_DEV_MODE, demoMode: false, now: Date.now(), maxPositionAgeMs: AUTH_POSITION_MAX_AGE_MS },
    excludedProviderIdsFor(svc),
    MULTI_NOTIFY_COUNT,
  ) as unknown as Provider[]
}

// ----------------------- Connection -----------------------
io.on('connection', async (socket) => {
  console.log(`[socket] connected ${socket.id}`)
  const boundAuth = await bindAuthenticatedSocket(socket)
  const hasSessionCookie = String(socket.handshake.headers.cookie || '').includes(`${COOKIE_NAME}=`)
  const demoAllowed = !boundAuth && !hasSessionCookie

  const currentAuth = () => authenticatedSockets.get(socket.id)

  const clearAuthenticatedPresence = (auth: AuthenticatedSocket) => {
    authenticatedSockets.delete(socket.id)
    const role = authenticatedSocketToRole.get(socket.id)
    if (role?.role === 'client') {
      authenticatedClients.delete(role.id)
    } else if (role?.role === 'provider') {
      const provider = authenticatedProviders.get(role.id)
      if (provider) {
        provider.online = false
        provider.currentServiceId = null
        emitAuthenticatedProviderState(provider)
        authenticatedProviders.delete(role.id)
      }
    } else if (auth.providerProfileId) {
      authenticatedProviders.delete(auth.providerProfileId)
    }
    authenticatedSocketToRole.delete(socket.id)
  }

  const currentActiveAuth = async () => {
    const auth = currentAuth()
    if (!auth) return null
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        status: true,
        providerProfile: { select: { id: true } },
      },
    }).catch(() => null)
    if (!user || user.role !== auth.role || user.status !== 'ACTIVE') {
      clearAuthenticatedPresence(auth)
      socket.emit('auth:error', { message: 'Sessao invalida.' })
      socket.emit('auth:operation-error', { message: 'Sessao invalida ou usuario suspenso.' })
      return null
    }
    const fresh: AuthenticatedSocket = {
      userId: user.id,
      role: user.role as 'CLIENT' | 'PROVIDER',
      name: user.name,
      email: user.email,
      providerProfileId: user.providerProfile?.id,
    }
    authenticatedSockets.set(socket.id, fresh)
    return fresh
  }

  const currentOperationalAuth = async () => {
    const auth = await currentActiveAuth()
    if (!auth) return null
    const current = await hasCurrentConsents(auth.userId, auth.role, db as any).catch(() => false)
    if (current) return auth

    if (auth.providerProfileId) {
      const provider = authenticatedProviders.get(auth.providerProfileId)
      if (provider) {
        provider.online = false
        emitAuthenticatedProviderState(provider)
      }
    }
    socket.emit('auth:operation-error', {
      code: 'consent_required',
      message: 'Aceite os documentos vigentes antes de continuar.',
    })
    return null
  }

  socket.on('auth:snapshot', async () => {
    const auth = await currentActiveAuth()
    if (!auth) {
      socket.emit('auth:error', { message: 'Sessao invalida.' })
      return
    }
    if (auth.role === 'CLIENT') {
      await bindAuthenticatedClient(socket, auth)
    } else {
      await bindAuthenticatedProvider(socket, auth)
    }
  })

  socket.on('auth:provider:toggle-online', async (data: { online: boolean }) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) return
    const p = authenticatedProviders.get(auth.providerProfileId)
    const profile = await db.providerProfile.findUnique({
      where: { id: auth.providerProfileId },
      include: { user: { select: { id: true, status: true } } },
    })
    if (!profile || !p) return
    Object.assign(p, {
      isVerified: profile.isVerified,
      approvalStatus: profile.approvalStatus,
      documentStatus: profile.documentStatus,
      vehicleStatus: profile.vehicleStatus,
      userStatus: profile.user.status || 'ACTIVE',
    })
    p.locationConsentCurrent = await hasCurrentConsentType(auth.userId, 'LOCATION', db as any)

    const active = await findActiveDbServiceForProvider(profile.id)
    if (data.online && active) {
      p.online = false
      p.currentServiceId = active.id
      emitAuthenticatedProviderState(p)
      socket.emit('auth:operation-error', { message: 'Voce ja possui atendimento ativo.' })
      return
    }

    const reason = getProviderOperationBlockReason(p)
    if (data.online && reason) {
      p.online = false
      await db.providerProfile.update({ where: { id: profile.id }, data: { isAvailable: false } }).catch(() => null)
      emitAuthenticatedProviderState(p)
      socket.emit('provider:online-denied', { reason })
      socket.emit('auth:operation-error', { message: reason })
      return
    }

    const positionFresh = !!p.position && !!p.lastPositionAt && Date.now() - p.lastPositionAt <= AUTH_POSITION_MAX_AGE_MS
    if (data.online && (!p.locationConsentCurrent || !p.isGpsPosition || !positionFresh)) {
      p.online = false
      emitAuthenticatedProviderState(p)
      socket.emit('auth:operation-error', {
        message: p.locationConsentCurrent
          ? 'Aguarde uma posicao GPS valida antes de ficar disponivel.'
          : 'Aceite o uso de localizacao antes de ficar disponivel.',
      })
      return
    }

    await db.providerProfile.update({ where: { id: profile.id }, data: { isAvailable: data.online === true } })
    p.isAvailableIntent = data.online === true
    p.online = data.online === true
    p.currentServiceId = null
    if (!p.online) {
      p.position = null
      p.isGpsPosition = false
      p.lastPositionAt = null
    }
    emitAuthenticatedProviderState(p)
  })

  socket.on('auth:provider:position', async (
    data: { lat: number; lng: number; accuracy?: number },
    acknowledge?: (result: { ok: boolean }) => void,
  ) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) { acknowledge?.({ ok: false }); return }
    if (!socketRateLimit(socket.id, 'auth:provider:position', 10, 10000)) { acknowledge?.({ ok: false }); return }
    if (!isValidLatLng(data)) {
      socket.emit('auth:operation-error', { message: 'Posicao GPS invalida.' })
      acknowledge?.({ ok: false })
      return
    }

    const locationConsentCurrent = await hasCurrentConsentType(auth.userId, 'LOCATION', db as any)
    const profile = await db.providerProfile.findUnique({
      where: { id: auth.providerProfileId },
      include: { user: { select: { status: true } } },
    })
    const p = authenticatedProviders.get(auth.providerProfileId)
    if (!profile || !p || !locationConsentCurrent) {
      if (p) {
        p.locationConsentCurrent = false
        p.online = false
        p.position = null
        p.isGpsPosition = false
        p.lastPositionAt = null
        emitAuthenticatedProviderState(p)
      }
      socket.emit('auth:operation-error', { message: 'Consentimento de localizacao vigente e obrigatorio.' })
      acknowledge?.({ ok: false })
      return
    }
    Object.assign(p, {
      isVerified: profile.isVerified,
      approvalStatus: profile.approvalStatus,
      documentStatus: profile.documentStatus,
      vehicleStatus: profile.vehicleStatus,
      userStatus: profile.user.status || 'ACTIVE',
      locationConsentCurrent,
    })
    if (getProviderOperationBlockReason(p)) {
      p.online = false
      p.position = null
      p.isGpsPosition = false
      p.lastPositionAt = null
      emitAuthenticatedProviderState(p)
      socket.emit('auth:operation-error', { message: 'Prestador sem autorizacao operacional.' })
      acknowledge?.({ ok: false })
      return
    }

    p.position = { lat: data.lat, lng: data.lng }
    p.isGpsPosition = true
    p.lastPositionAt = Date.now()
    emitAuthenticatedProviderState(p)

    if (p.currentServiceId) {
      const service = await loadDbService(p.currentServiceId)
      if (service?.providerId === p.id && ['ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(service.status)) {
        await updateServiceProviderPosition(db as any, service.id, p.position)
        await emitAuthenticatedService(service.id)
      }
    }
    acknowledge?.({ ok: true })
  })

  socket.on('auth:provider:position-unavailable', async () => {
    const auth = await currentActiveAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) return
    const p = authenticatedProviders.get(auth.providerProfileId)
    if (!p) return
    p.position = null
    p.isGpsPosition = false
    p.lastPositionAt = null
    p.online = false
    emitAuthenticatedProviderState(p)
  })

  socket.on('auth:client:request', async (data: {
    type: ServiceType; description: string;
    pickup: LatLng; pickupLabel: string; destination: null; destinationLabel: string;
    paymentMethod: PaymentMethod
  }) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'CLIENT') return
    if (!(await hasCurrentConsentType(auth.userId, 'LOCATION', db as any))) {
      socket.emit('auth:operation-error', { message: 'Aceite e permita a localizacao antes de criar a solicitacao.' })
      return
    }
    if (!socketRateLimit(socket.id, 'auth:client:request', 5, 60000)) {
      socket.emit('auth:operation-error', { message: 'Muitas solicitacoes. Aguarde alguns segundos.' })
      return
    }
    if (!data || !TYPE_MAP[data.type] || !isValidLatLng(data.pickup) || data.destination !== null ||
      !isNonEmptyString(data.pickupLabel, 200) || !isNonEmptyString(data.destinationLabel, 200)) {
      socket.emit('auth:operation-error', { message: 'Dados da solicitacao invalidos.' })
      return
    }

    const distanceKm = 0
    const breakdown = calcPriceBreakdown(data.type, data.pickup, null, distanceKm, null)
    const price = Math.round(breakdown.total)
    const originalPrice = Math.round(breakdown.beforeDiscount)
    const discount = Math.round(breakdown.discountAmount)
    const etaMin = calcEta(distanceKm)

    try {
      const dbSvc = await createOperationalService(db as any, {
        clientId: auth.userId,
        type: TYPE_MAP[data.type] as any,
        description: (data.description || '').slice(0, 500),
        pickup: data.pickup,
        pickupLabel: data.pickupLabel.slice(0, 200),
        destination: data.destination,
        destinationLabel: data.destinationLabel.slice(0, 200),
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMin,
        price,
        originalPrice,
        discount,
        promoCode: null,
        paymentMethod: PAYMENT_MAP[data.paymentMethod || 'pix'] as any,
        loyaltyPoints: 0,
        label: 'Solicitacao enviada - procurando prestador proximo',
      }, { dedupeActive: true, audit: audit as any })
      const loaded = await loadDbService(dbSvc.id)
      if (!loaded) throw new Error('Service not found after create')
      const svc = rememberDbService(loaded)
      socket.emit('auth:service:update', sanitizeService(svc, authenticatedProviders))

      if ((dbSvc as any).deduped) {
        console.log(`[auth-service] duplicate request blocked service=${svc.id} client=${auth.userId}`)
        return
      }

      const candidates = authenticatedCandidateProviders(svc)
      if (candidates.length === 0) {
        await closeAuthenticatedServiceWithoutProviders(svc, 'Nenhum prestador disponivel no momento')
        return
      }
      await offerAuthenticatedServiceToProviders(
        svc,
        candidates,
        `Chamada enviada para ${candidates.length} prestador(es) aprovado(s)`,
      )
    } catch (error: any) {
      console.error('[auth-service] request error:', error)
      socket.emit('auth:operation-error', { message: error?.message || 'Nao foi possivel criar a solicitacao.' })
    }
  })

  socket.on('auth:service:accept', async (data: { serviceId: string }) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) return
    const p = authenticatedProviders.get(auth.providerProfileId)
    if (!p) return
    const eligibilityReason = getMatchingRejectionReason(p, {
      isDevMode: IS_DEV_MODE,
      demoMode: false,
      now: Date.now(),
      maxPositionAgeMs: AUTH_POSITION_MAX_AGE_MS,
    })
    if (eligibilityReason) {
      socket.emit('auth:operation-error', { message: `Prestador indisponivel: ${eligibilityReason}.` })
      return
    }
    try {
      const result = await acceptServiceOffer(db as any, data.serviceId, auth.providerProfileId, {
        label: `${p.name} aceitou a chamada e esta a caminho`,
        actorRole: 'PROVIDER',
        actorUserId: auth.userId,
        providerProfileId: auth.providerProfileId,
        audit: audit as any,
      })
      if ((result as any).conflict) {
        socket.emit('auth:operation-error', { message: 'Esta chamada ja foi aceita por outro prestador.' })
        return
      }
      p.currentServiceId = data.serviceId
      p.online = true
      emitAuthenticatedProviderState(p)
      const updated = await emitAuthenticatedService(data.serviceId)
      if (updated) {
        updated.notifiedProviderIds.forEach((providerId) => {
          if (providerId === auth.providerProfileId) return
          const other = authenticatedProviders.get(providerId)
          if (other) io.to(other.socketId).emit('auth:offer-taken', { serviceId: data.serviceId })
        })
      }
    } catch (error: any) {
      socket.emit('auth:operation-error', { message: error?.message || 'Nao foi possivel aceitar.' })
    }
  })

  socket.on('auth:service:reject', async (data: { serviceId: string; reason?: string }) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) return
    const p = authenticatedProviders.get(auth.providerProfileId)
    if (!p) return
    await declineServiceOffer(db as any, data.serviceId, auth.providerProfileId, {
      label: `${p.name} recusou a chamada`,
      actorRole: 'PROVIDER',
      actorUserId: auth.userId,
      providerProfileId: auth.providerProfileId,
      reason: data.reason || 'provider_declined',
      audit: audit as any,
    }).catch(() => null)
    if (p.currentServiceId === data.serviceId) p.currentServiceId = null
    emitAuthenticatedProviderState(p)
    await emitAuthenticatedService(data.serviceId)
  })

  const transitionAuthenticatedProviderStatus = async (
    serviceId: string,
    status: 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED',
    label: string,
  ) => {
    const auth = await currentOperationalAuth()
    if (!auth || auth.role !== 'PROVIDER' || !auth.providerProfileId) return
    const p = authenticatedProviders.get(auth.providerProfileId)
    if (!p) return
    const dbSvc = await loadDbService(serviceId)
    if (!dbSvc || dbSvc.providerId !== auth.providerProfileId) return
    await transitionServiceStatus(db as any, serviceId, status as any, {
      label,
      actorRole: 'PROVIDER',
      actorUserId: auth.userId,
      providerProfileId: auth.providerProfileId,
      audit: audit as any,
    })
    if (status === 'COMPLETED') {
      p.currentServiceId = null
      p.destination = null
      p.tripStartPos = null
      p.tripTarget = null
      p.tripStartedAt = null
      p.tripTotalKm = 0
      await db.providerProfile.update({
        where: { id: auth.providerProfileId },
        data: { completedCount: { increment: 1 }, earningsToday: { increment: dbSvc.price }, isAvailable: true },
      }).catch(() => null)
    } else {
      p.currentServiceId = serviceId
    }
    emitAuthenticatedProviderState(p)
    await emitAuthenticatedService(serviceId)
  }

  socket.on('auth:service:arrived', (data: { serviceId: string }) => {
    void transitionAuthenticatedProviderStatus(data.serviceId, 'ARRIVED', 'Prestador chegou ao local do atendimento')
  })
  socket.on('auth:service:start', (data: { serviceId: string }) => {
    void transitionAuthenticatedProviderStatus(data.serviceId, 'IN_PROGRESS', 'Servico em andamento')
  })
  socket.on('auth:service:complete', (data: { serviceId: string }) => {
    void transitionAuthenticatedProviderStatus(data.serviceId, 'COMPLETED', 'Servico concluido com sucesso')
  })

  socket.on('auth:service:cancel', async (data: { serviceId: string; reason?: string }) => {
    const auth = await currentActiveAuth()
    if (!auth || auth.role !== 'CLIENT') return
    const dbSvc = await loadDbService(data.serviceId)
    if (!dbSvc || dbSvc.clientId !== auth.userId) return
    await transitionServiceStatus(db as any, data.serviceId, 'CANCELED' as any, {
      label: 'Solicitacao cancelada pelo cliente',
      actorRole: 'CLIENT',
      actorUserId: auth.userId,
      canceledByRole: 'CLIENT',
      canceledByUserId: auth.userId,
      cancellationReason: (data.reason || 'client_cancelled').slice(0, 500),
      audit: audit as any,
    }).catch(() => null)
    if (dbSvc.providerId) {
      const p = authenticatedProviders.get(dbSvc.providerId)
      if (p) {
        p.currentServiceId = null
        emitAuthenticatedProviderState(p)
      }
    }
    await emitAuthenticatedService(data.serviceId)
  })

  socket.on('auth:chat:history', async (data: { serviceId: string }) => {
    const auth = await currentOperationalAuth()
    if (!auth) return
    try {
      const messages = await listServiceChatMessages(data.serviceId, currentUserFromAuth(auth))
      socket.emit('auth:chat:messages', { serviceId: data.serviceId, messages })
    } catch {
      socket.emit('auth:operation-error', { message: 'Nao foi possivel carregar o chat.' })
    }
  })

  socket.on('auth:chat:send', async (data: { serviceId: string; text: string }) => {
    const auth = await currentOperationalAuth()
    if (!auth) return
    if (!socketRateLimit(socket.id, 'auth:chat:send', 10, 10000)) return
    try {
      const message = await createServiceChatMessage(data.serviceId, currentUserFromAuth(auth), {
        text: data.text,
      })
      await emitAuthenticatedChatMessage(data.serviceId, message)
    } catch {
      socket.emit('auth:operation-error', { message: 'Nao foi possivel enviar a mensagem.' })
    }
  })

  if (demoAllowed) {
  socket.on('client:register', async (data: { name: string }) => {
    if (!socketRateLimit(socket.id, 'client:register', 5, 60000)) return
    if (!data || !isNonEmptyString(data.name, 100)) return
    const id = uid('cli_')

    clients.set(id, { id, socketId: socket.id, name: data.name })
    socketToRole.set(socket.id, { role: 'client', id })
    const points = clientLoyalty.get(data.name) || 0
    const tier = loyaltyTier(points)
    socket.emit('client:registered', { id, name: data.name })
    socket.emit('client:loyalty', { points, tier: { name: tier.name, color: tier.color, perk: tier.perk }, nextTierMin: nextTierMin(points) })
    socket.emit('loyalty:rewards', LOYALTY_REWARDS.map(r => ({ ...r, affordable: points >= r.cost })))
    socket.emit('providers:nearby', availableProviderPublic())
    console.log(`[client:demo] registered ${id} (${data.name})`)
  })

  socket.on('loyalty:redeem', (data: { rewardId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const client = clients.get(role.id)
    if (!client) return
    const name = client.name
    const reward = LOYALTY_REWARDS.find(r => r.id === data.rewardId)
    if (!reward) { socket.emit('loyalty:redeem-result', { success: false, message: 'Recompensa não encontrada' }); return }
    const points = clientLoyalty.get(name) || 0
    if (points < reward.cost) { socket.emit('loyalty:redeem-result', { success: false, message: `Pontos insuficientes. Necessário: ${reward.cost}` }); return }
    const newPoints = points - reward.cost
    clientLoyalty.set(name, newPoints)
    PROMO_CODES[reward.code] = { type: reward.type, value: reward.value, label: reward.label }
    const tier = loyaltyTier(newPoints)
    socket.emit('loyalty:redeem-result', { success: true, code: reward.code, label: reward.label, pointsSpent: reward.cost, pointsRemaining: newPoints, message: `Cupom ${reward.code} resgatado!` })
    socket.emit('client:loyalty', { points: newPoints, tier: { name: tier.name, color: tier.color, perk: tier.perk }, nextTierMin: nextTierMin(newPoints) })
    socket.emit('loyalty:rewards', LOYALTY_REWARDS.map(r => ({ ...r, affordable: newPoints >= r.cost })))
    console.log(`[loyalty] ${name} redeemed ${reward.code} for ${reward.cost}pts (remaining ${newPoints})`)
  })

  socket.on('provider:register', async (data: { name: string; vehicle: string; plate: string }) => {
    if (!socketRateLimit(socket.id, 'provider:register', 5, 60000)) return
    if (!data || !isNonEmptyString(data.name, 100) || !isNonEmptyString(data.vehicle, 100) || !isNonEmptyString(data.plate, 20)) return
    const id = uid('prv_')

    const provider: Provider = {
      id, socketId: socket.id, name: data.name, vehicle: data.vehicle, plate: data.plate,
      rating: 4.8, ratingSum: 48, ratingCount: 10, completedCount: 0, earningsToday: 0,
      online: true,
      position: { lat: CITY.center.lat + (Math.random() - 0.5) * CITY.span, lng: CITY.center.lng + (Math.random() - 0.5) * CITY.span },
      currentServiceId: null,
      isDemoProvider: true, isVerified: true, approvalStatus: 'APPROVED', documentStatus: 'APPROVED', vehicleStatus: 'APPROVED', userStatus: 'ACTIVE', isGpsPosition: false,
    }
    providers.set(id, provider)
    socketToRole.set(socket.id, { role: 'provider', id })
    emitProvider(provider)
    socket.emit('provider:registered', { id })
    console.log(`[provider:demo] registered id=${id} online=${provider.online}`)
  })

  socket.on('provider:toggle-online', (data: { online: boolean }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const p = providers.get(role.id)
    if (!p) return
    if (data.online) {
      const reason = getProviderOperationBlockReason(p)
      if (reason) {
        p.online = false
        emitProvider(p)
        socket.emit('provider:online-denied', { reason })
        console.log(`[provider] online denied id=${p.id} reason=${reason}`)
        return
      }
    }
    p.online = data.online
    emitProvider(p)
    console.log(`[provider] ${data.online ? 'online' : 'offline'} id=${p.id}`)
  })

  socket.on('provider:position', (data: { lat: number; lng: number }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    // FASE 26: rate limit position updates (max 10/sec per socket)
    if (!socketRateLimit(socket.id, 'provider:position', 10, 1000)) return
    const p = providers.get(role.id)
    if (!p) return
    // FASE 26: validate payload
    if (!isValidLatLng(data)) return
    p.position = { lat: data.lat, lng: data.lng }
    p.isGpsPosition = true
    emitProvider(p)
    if (p.currentServiceId) {
      const svc = services.get(p.currentServiceId)
      if (svc && svc.providerId === p.id && ['accepted', 'arriving', 'arrived', 'in_progress'].includes(svc.status)) {
        emitLiveTrackingUpdate(svc, p)
        console.log(`[tracking] location received service=${svc.id} provider=${p.id}`)
      }
    }
  })

  socket.on('promo:validate', (data: { code: string; type: ServiceType; distanceKm: number }) => {
    if (!data || !isNonEmptyString(data.code, 50) || typeof data.distanceKm !== 'number' || data.distanceKm < 0) return
    const code = (data.code || '').trim().toUpperCase()
    const promo = PROMO_CODES[code]
    if (!promo) { socket.emit('promo:result', { valid: false, code, message: 'Cupom inválido ou expirado' }); return }
    const bd = calcPriceBreakdown(data.type, { lat: 0, lng: 0 }, null, data.distanceKm, code)
    socket.emit('promo:result', { valid: true, code, label: promo.label, type: promo.type, value: promo.value, originalPrice: Math.round(bd.beforeDiscount), discount: Math.round(bd.discountAmount), finalPrice: Math.round(bd.total), message: `Cupom aplicado: ${promo.label}` })
  })

  socket.on('service:request', async (data: {
    clientName: string; type: ServiceType; description: string;
    pickup: LatLng; pickupLabel: string; destination: LatLng; destinationLabel: string;
    paymentMethod: PaymentMethod; promoCode?: string | null
  }) => {
    // FASE 26: rate limit service requests (max 5 per minute per socket)
    if (!socketRateLimit(socket.id, 'service:request', 5, 60000)) {
      socket.emit('service:error', { message: 'Too many requests. Please wait before requesting another service.' })
      return
    }
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const client = clients.get(role.id)
    if (!client) return
    // FASE 26: validate payload
    if (!data || !isNonEmptyString(data.clientName) || !isNonEmptyString(data.type as string) ||
        !isNonEmptyString(data.pickupLabel) || !isNonEmptyString(data.destinationLabel) ||
        !isValidLatLng(data.pickup) || !isValidLatLng(data.destination)) {
      socket.emit('service:error', { message: 'Invalid request payload' })
      return
    }

    const distanceKm = haversineKm(data.pickup, data.destination)
    const promoCodeUpper = (data.promoCode || '').trim().toUpperCase()
    const promoValid = !!(promoCodeUpper && PROMO_CODES[promoCodeUpper])
    const breakdown = calcPriceBreakdown(data.type, data.pickup, data.destination, distanceKm, promoValid ? promoCodeUpper : null)
    const originalPrice = Math.round(breakdown.beforeDiscount)
    const price = Math.round(breakdown.total)
    const discount = Math.round(breakdown.discountAmount)
    const etaMin = calcEta(distanceKm)

    const svc: ServiceRequest = {
      id: uid('svc_'), clientId: role.id, clientName: data.clientName,
      type: data.type, description: data.description,
      pickup: data.pickup, pickupLabel: data.pickupLabel,
      destination: data.destination, destinationLabel: data.destinationLabel,
      price, originalPrice, discount,
      promoCode: promoValid ? promoCodeUpper : null,
      distanceKm: Number(distanceKm.toFixed(2)), etaMin,
      status: 'searching', paymentMethod: data.paymentMethod || 'pix',
      providerId: null, notifiedProviderIds: [], rejectedProviderIds: [],
      createdAt: Date.now(),
      timeline: [{ status: 'searching', label: 'Solicitação enviada — procurando prestador próximo', at: Date.now() }],
      rating: null, loyaltyPoints: 0,
      breakdown,
    }
    if (promoValid) {
      svc.timeline.push({ status: 'searching', label: `Cupom ${svc.promoCode} aplicado: -R$ ${discount}`, at: Date.now() })
    }

    services.set(svc.id, svc)
    emitService(svc)
    console.log(`[service] request created service=${svc.id} client=${role.id} type=${svc.type} payment=${svc.paymentMethod}`)

    // Multi-provider notification (FASE 25.4 — uses rankProvidersByDistance)
    const providerPool = Array.from(providers.values())
    const candidates = rankProvidersByDistanceExcluding(providerPool as any, data.pickup, MATCHING_OPTIONS, new Set(), MULTI_NOTIFY_COUNT) as unknown as Provider[]
    logMatchingDiagnostics(svc, providerPool, candidates)
    if (candidates.length === 0) {
      console.log(`[service] no offer emitted service=${svc.id} reason=no_eligible_providers`)
      setTimeout(() => {
        const s = services.get(svc.id)
        if (s && s.status === 'searching') closeServiceWithoutProviders(s, 'Nenhum prestador disponível no momento')
      }, 8000)
      return
    }
    const names = candidates.map((p) => p.name).join(', ')
    offerServiceToProviders(svc, candidates, `Chamada enviada para ${candidates.length} prestador(es) próximo(s): ${names}`)
  })

  socket.on('service:offer-received', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || !svc.notifiedProviderIds.includes(role.id)) return
    console.log(`[service] offer received service=${svc.id} provider=${role.id}`)
  })

  socket.on('service:accept', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    if (!svc.notifiedProviderIds.includes(role.id)) return
    const winner = providers.get(role.id)!
    const blockReason = getProviderOperationBlockReason(winner)
    if (blockReason) {
      winner.online = false
      emitProvider(winner)
      io.to(winner.socketId).emit('provider:online-denied', { reason: blockReason })
      console.log(`[service] accept denied service=${svc.id} provider=${winner.id} reason=${blockReason}`)
      return
    }
    clearOfferTimer(svc)
    svc.notifiedProviderIds.forEach((pid) => {
      if (pid !== role.id) {
        const np = providers.get(pid)
        if (np) { if (np.currentServiceId === svc.id) np.currentServiceId = null; emitProvider(np); io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: winner.name, cancelled: false }) }
      }
    })
    svc.providerId = winner.id; winner.currentServiceId = svc.id; winner.online = true
    svc.acceptedAt = Date.now()
    pushTimeline(svc, 'accepted', `${winner.name} aceitou a chamada e está a caminho`)
    if (!winner.position) return
    winner.tripStartPos = { ...winner.position }; winner.tripTarget = svc.pickup; winner.tripStartedAt = Date.now(); winner.tripTotalKm = haversineKm(winner.position, svc.pickup); winner.destination = svc.pickup
    emitProvider(winner); emitService(svc); emitChatToService(svc.id)
    console.log(`[service] offer accepted service=${svc.id} provider=${winner.id}`)
    console.log(`[tracking] started service=${svc.id} provider=${winner.id}`)
  })

  socket.on('service:reject', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    if (!svc.notifiedProviderIds.includes(role.id)) return
    clearOfferTimer(svc)
    const p = providers.get(role.id)!
    if (p.currentServiceId === svc.id) p.currentServiceId = null
    p.destination = null
    p.tripStartPos = null
    p.tripTarget = null
    p.tripStartedAt = null
    p.tripTotalKm = 0
    p.online = true
    if (!svc.rejectedProviderIds.includes(role.id)) svc.rejectedProviderIds.push(role.id)
    svc.notifiedProviderIds = svc.notifiedProviderIds.filter((id) => id !== role.id)
    if (svc.providerId === role.id || !svc.notifiedProviderIds.includes(svc.providerId || '')) {
      svc.providerId = svc.notifiedProviderIds[0] || null
    }
    emitProvider(p)
    console.log(`[service] offer rejected service=${svc.id} provider=${role.id}`)
    console.log(`[provider] released after rejection id=${p.id} online=${p.online}`)

    if (svc.notifiedProviderIds.length > 0) {
      const nextPrimary = svc.providerId ? providers.get(svc.providerId) : null
      if (nextPrimary) {
        nextPrimary.currentServiceId = svc.id
        emitProvider(nextPrimary)
      }
      pushTimeline(svc, 'offered', `${p.name} recusou — aguardando ${svc.notifiedProviderIds.length} prestador(es) ainda notificado(s)`)
      emitService(svc)
      scheduleOfferExpiry(svc)
      return
    }

    pushTimeline(svc, 'searching', `${p.name} recusou — procurando outro prestador`)
    emitService(svc)

    const nextBatch = rankProvidersByDistanceExcluding(
      Array.from(providers.values()) as any,
      svc.pickup,
      MATCHING_OPTIONS,
      excludedProviderIdsFor(svc),
      MULTI_NOTIFY_COUNT
    ) as unknown as Provider[]
    if (nextBatch.length > 0) {
      offerServiceToProviders(svc, nextBatch, `Chamada enviada para ${nextBatch.length} prestador(es): ${nextBatch.map((x) => x.name).join(', ')}`)
    } else {
      closeServiceWithoutProviders(svc, 'Nenhum prestador disponível')
    }
  })

  socket.on('service:arrived', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    if (svc.status === 'completed' || svc.status === 'cancelled') return
    const p = providers.get(role.id)!
    if (!svc.destination) return
    p.position = { ...svc.pickup }
    pushTimeline(svc, 'arrived', `${p.name} chegou ao local do atendimento`)
    p.destination = svc.destination; p.tripStartPos = { ...svc.pickup }; p.tripTarget = svc.destination; p.tripStartedAt = Date.now(); p.tripTotalKm = haversineKm(svc.pickup, svc.destination)
    emitProvider(p); emitService(svc)
    console.log(`[tracking] arrival marked service=${svc.id} provider=${p.id}`)
  })

  socket.on('service:start', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    if (!p.position || !svc.destination) return
    p.destination = svc.destination; p.tripStartPos = { ...p.position }; p.tripTarget = svc.destination; p.tripStartedAt = Date.now(); p.tripTotalKm = haversineKm(p.position, svc.destination)
    pushTimeline(svc, 'in_progress', 'Serviço em andamento — rumo ao destino final')
    emitProvider(p); emitService(svc)
    console.log(`[tracking] route updated service=${svc.id} provider=${p.id} status=in_progress`)
  })

  socket.on('service:complete', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    if (!svc.destination) return
    p.position = { ...svc.destination }; p.destination = null; p.currentServiceId = null; p.online = true; p.completedCount += 1; p.earningsToday += svc.price
    p.tripStartPos = null; p.tripTarget = null; p.tripStartedAt = null; p.tripTotalKm = 0
    svc.completedAt = Date.now()
    const earned = Math.round(svc.price)
    const prevPoints = clientLoyalty.get(svc.clientName) || 0
    const newPoints = prevPoints + earned
    clientLoyalty.set(svc.clientName, newPoints)
    svc.loyaltyPoints = earned
    const prevTier = loyaltyTier(prevPoints)
    const newTier = loyaltyTier(newPoints)
    pushTimeline(svc, 'completed', 'Serviço concluído com sucesso. Avalie o atendimento!')
    if (earned > 0) svc.timeline.push({ status: 'completed', label: `+${earned} pontos de fidelidade (${newTier.name})`, at: Date.now() })
    if (newTier.name !== prevTier.name) svc.timeline.push({ status: 'completed', label: `🎉 Subiu para o tier ${newTier.name}! ${newTier.perk}`, at: Date.now() })
    const client = clients.get(svc.clientId)
    emitProvider(p); emitService(svc)
    console.log(`[tracking] ended service=${svc.id} provider=${p.id}`)
    if (client) {
      io.to(client.socketId).emit('client:loyalty', { points: newPoints, tier: { name: newTier.name, color: newTier.color, perk: newTier.perk }, nextTierMin: nextTierMin(newPoints), earnedThisService: earned, tierUpgraded: newTier.name !== prevTier.name })
    }
    console.log(`[service] completed ${svc.id} — provider ${p.name} earned R$ ${svc.price}, client +${earned}pts`)
  })

  // Legacy public demo payment simulation. It is intentionally in-memory only:
  // authenticated/canonical pilot payments go through /api/payments/simulate.
  socket.on('payment:simulate', async (data: { serviceId: string; outcome: 'success' | 'failure' }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    const svc = services.get(data.serviceId)
    if (!svc) { socket.emit('payment:result', { ok: false, message: 'Service not found' }); return }
    if (role.role !== 'client' || svc.clientId !== role.id) { socket.emit('payment:result', { ok: false, message: 'Not authorized' }); return }
    const method = svc.paymentMethod.toUpperCase()
    const amount = svc.price
    const toStatus = data.outcome === 'success' ? 'PAID' : 'FAILED'
    const label = data.outcome === 'success' ? `Pagamento aprovado (${method}) - R$ ${amount}` : `Pagamento recusado (${method}) - tente novamente`
    pushTimeline(svc, svc.status, label); emitService(svc)
    socket.emit('payment:result', { ok: true, outcome: data.outcome, status: toStatus, amount, method })
    console.log(`[payment:demo] ${svc.id} simulated ${toStatus} (${method}) without persistence`)
  })

  socket.on('service:rate', (data: { serviceId: string; stars: number; comment: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id || svc.status !== 'completed' || svc.rating) return
    if (typeof data.stars !== 'number' || data.stars < 1 || data.stars > 5) return
    const stars = Math.max(1, Math.min(5, Math.round(data.stars)))
    svc.rating = { stars, comment: (data.comment || '').slice(0, 240), at: Date.now(), from: svc.clientName }
    if (svc.providerId) {
      const p = providers.get(svc.providerId)
      if (p) { p.ratingSum += stars; p.ratingCount += 1; p.rating = Number((p.ratingSum / p.ratingCount).toFixed(2)); emitProvider(p) }
    }
    emitService(svc)
    console.log(`[rating] service ${svc.id} rated ${stars}★ by ${svc.clientName}`)
  })

  socket.on('service:rate-client', (data: { serviceId: string; stars: number; comment: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id || svc.status !== 'completed' || svc.clientRating) return
    const stars = Math.max(1, Math.min(5, Math.round(data.stars)))
    const p = providers.get(role.id)!
    svc.clientRating = { stars, comment: (data.comment || '').slice(0, 240), at: Date.now(), from: p.name }
    emitService(svc)
    console.log(`[rating] service ${svc.id} client rated ${stars}★ by ${p.name}`)
  })

  socket.on('service:cancel', (data: { serviceId: string; reason?: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id || svc.status === 'completed' || svc.status === 'cancelled') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    svc.notifiedProviderIds.forEach((pid) => {
      const np = providers.get(pid)
      if (np) { if (np.currentServiceId === svc.id) np.currentServiceId = null; np.destination = null; np.tripStartPos = null; np.tripTarget = null; np.tripStartedAt = null; np.tripTotalKm = 0; np.online = true; emitProvider(np); io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: null, cancelled: true }) }
    })
    svc.completedAt = Date.now()
    pushTimeline(svc, 'cancelled', 'Solicitação cancelada pelo cliente')
    emitService(svc)
  })

  // ---------- Chat ----------
  socket.on('chat:send', (data: { serviceId: string; text: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    // FASE 26: rate limit chat (max 10 messages per 10 seconds)
    if (!socketRateLimit(socket.id, 'chat:send', 10, 10000)) return
    const svc = services.get(data.serviceId)
    if (!svc) return
    if (role.role === 'client' && svc.clientId !== role.id) return
    if (role.role === 'provider' && svc.providerId !== role.id) return
    // FASE 26: validate text (max 500 chars, non-empty)
    const text = (data.text || '').trim().slice(0, 500)
    if (!text) return
    const fromName = role.role === 'client' ? svc.clientName : (providers.get(role.id)?.name || 'Prestador')
    const msg: ChatMessage = { id: uid('msg_'), serviceId: svc.id, from: role.role, fromName, text, at: Date.now() }
    emitChatToService(svc.id, msg)
    console.log(`[chat] ${fromName}: ${text}`)
  })

  socket.on('chat:history', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    const svc = services.get(data.serviceId)
    if (!svc) return
    if (role.role === 'client' && svc.clientId !== role.id) return
    if (role.role === 'provider' && svc.providerId !== role.id) return
    socket.emit('chat:messages', { serviceId: svc.id, messages: chats.get(svc.id) || [] })
  })

  // Legacy event kept only as a controlled tombstone. Public tracking uses an HTTP token.
  socket.on('public:track', () => {
    socket.emit('public:track-result', { available: false, message: 'Use um link de rastreamento seguro.' })
  })

  }

  socket.on('disconnect', () => {
    const auth = currentAuth()
    if (auth) clearAuthenticatedPresence(auth)
    const role = socketToRole.get(socket.id)
    if (!role) {
      socketRateBuckets.delete(socket.id)
      return
    }
    if (role.role === 'client') { clients.delete(role.id) }
    else if (role.role === 'provider') {
      const p = providers.get(role.id)
      if (p) { p.online = false; providers.delete(role.id); io.emit('providers:nearby', availableProviderPublic()) }
    }
    socketRateBuckets.delete(socket.id)
    socketToRole.delete(socket.id)
    console.log(`[socket] disconnected ${socket.id}`)
  })
})

// ----------------------- Movement simulation loop -----------------------
setInterval(() => {
  for (const p of providers.values()) {
    if (!p.destination || !p.position) continue
    const stepKm = 0.18
    const { pos, arrived } = stepToward(p.position, p.destination, stepKm)
    p.position = pos
    emitProvider(p)
    if (p.currentServiceId) {
      const svc = services.get(p.currentServiceId)
      if (svc) {
        if (arrived) {
          if (svc.status === 'accepted') {
            pushTimeline(svc, 'arriving', `${p.name} está próximo do local`)
          }
        } else if (svc.status === 'accepted') {
          pushTimeline(svc, 'arriving', `${p.name} está a caminho do local`)
        }
        emitLiveTrackingUpdate(svc, p)
      }
    }
  }
}, 1000)

setInterval(() => {
  io.emit('providers:nearby', availableProviderPublic())
  const leaderboard = Array.from(providers.values()).map(p => ({ id: p.id, name: p.name, vehicle: p.vehicle, rating: p.rating, completedCount: p.completedCount, earningsToday: p.earningsToday })).sort((a, b) => { if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount; return b.rating - a.rating }).slice(0, 10)
  io.emit('leaderboard', leaderboard)
}, 5000)

const PORT = parseInt(process.env.RESCUE_SERVICE_PORT || '3003', 10)
httpServer.listen(PORT, () => { console.log(`🚑 Help Bibi rescue-service running on port ${PORT} (with Prisma persistence)`) })

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
