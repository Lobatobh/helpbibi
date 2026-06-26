import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

// ============================================================
// Help Bibi — Real-time rescue orchestration service
// Handles: provider presence, service requests, live tracking,
//          ratings, payment method, provider stats, chat, promos.
// Now with Prisma persistence (Phase 13).
// ============================================================

const db = new PrismaClient({ log: ['error'] })

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, name: 'Help Bibi', providers: providers.size, activeServices: services.size }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Help Bibi rescue-service running')
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

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
  online: boolean; position: LatLng; destination?: LatLng | null; currentServiceId?: string | null;
  tripStartPos?: LatLng | null; tripTarget?: LatLng | null; tripStartedAt?: number | null; tripTotalKm?: number;
  // DB linkage
  dbUserId?: string; dbProviderProfileId?: string;
}

type ServiceRequest = {
  id: string; clientId: string; clientName: string; type: ServiceType; description: string;
  pickup: LatLng; pickupLabel: string; destination: LatLng; destinationLabel: string;
  price: number; originalPrice: number; discount: number; promoCode: string | null;
  distanceKm: number; etaMin: number; status: ServiceStatus; paymentMethod: PaymentMethod;
  providerId?: string | null; notifiedProviderIds: string[];
  createdAt: number; acceptedAt?: number | null; completedAt?: number | null;
  timeline: TimelineEvent[]; rating?: Rating | null; clientRating?: Rating | null; loyaltyPoints: number;
  // DB linkage
  dbServiceId?: string;
}

type TimelineEvent = { status: ServiceStatus; label: string; at: number }

type ServiceTypeMeta = { label: string; basePrice: number; icon: string }

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
const clients = new Map<string, { id: string; socketId: string; name: string; dbUserId?: string }>()
const services = new Map<string, ServiceRequest>()
const chats = new Map<string, ChatMessage[]>()
const socketToRole = new Map<string, { role: Role; id: string }>()

const CITY = { center: { lat: -23.5505, lng: -46.6333 }, span: 0.05 }

// ----------------------- Helpers -----------------------
const uid = (p = '') => p + Math.random().toString(36).slice(2, 10)

const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const calcPrice = (type: ServiceType, distanceKm: number) => {
  const meta = SERVICE_TYPES[type]
  return Math.round(meta.basePrice + distanceKm * 4.5)
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
  // Persist timeline event to DB (fire-and-forget)
  if (svc.dbServiceId) {
    db.serviceTimelineEvent.create({
      data: {
        serviceId: svc.dbServiceId,
        status: STATUS_MAP[status] as any,
        label,
      }
    }).catch(() => {})
  }
}

// Persist service status update to DB (fire-and-forget, non-blocking)
const persistServiceStatus = (svc: ServiceRequest) => {
  if (!svc.dbServiceId) return
  db.serviceRequest.update({
    where: { id: svc.dbServiceId },
    data: {
      status: STATUS_MAP[svc.status] as any,
      ...(svc.acceptedAt && { acceptedAt: new Date(svc.acceptedAt) }),
      ...(svc.completedAt && { completedAt: new Date(svc.completedAt) }),
    },
  }).catch(() => {})
}

// Throttled position persistence
let lastPositionSave = 0
const persistProviderPosition = (svc: ServiceRequest, p: Provider) => {
  if (!svc.dbServiceId) return
  const now = Date.now()
  if (now - lastPositionSave < 3000) return // throttle: max once per 3s
  lastPositionSave = now
  db.serviceRequest.update({
    where: { id: svc.dbServiceId },
    data: { providerLat: p.position.lat, providerLng: p.position.lng },
  }).catch(() => {})
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

const providerPublic = (p: Provider) => ({
  id: p.id, name: p.name, vehicle: p.vehicle, rating: p.rating,
  position: p.position, online: p.online, completedCount: p.completedCount,
})

const emitProvider = (p: Provider) => {
  io.to(p.socketId).emit('provider:state', {
    id: p.id, name: p.name, vehicle: p.vehicle, plate: p.plate,
    rating: p.rating, online: p.online, position: p.position,
    currentServiceId: p.currentServiceId, completedCount: p.completedCount,
    earningsToday: p.earningsToday,
    tripStartPos: p.tripStartPos || null, tripTarget: p.tripTarget || null,
    tripStartedAt: p.tripStartedAt || null, tripTotalKm: p.tripTotalKm || 0,
  } as any)
  io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
}

const sanitizeService = (svc: ServiceRequest) => ({
  id: svc.id, clientId: svc.clientId, clientName: svc.clientName,
  type: svc.type, typeLabel: SERVICE_TYPES[svc.type].label, icon: SERVICE_TYPES[svc.type].icon,
  description: svc.description, pickup: svc.pickup, pickupLabel: svc.pickupLabel,
  destination: svc.destination, destinationLabel: svc.destinationLabel,
  price: svc.price, originalPrice: svc.originalPrice, discount: svc.discount, promoCode: svc.promoCode,
  distanceKm: svc.distanceKm, etaMin: svc.etaMin, status: svc.status,
  paymentMethod: svc.paymentMethod, providerId: svc.providerId,
  notifiedProviderIds: svc.notifiedProviderIds, notifiedCount: svc.notifiedProviderIds.length,
  provider: svc.providerId ? providers.get(svc.providerId) : null,
  createdAt: svc.createdAt, acceptedAt: svc.acceptedAt, completedAt: svc.completedAt,
  timeline: svc.timeline, rating: svc.rating || null, clientRating: svc.clientRating || null,
  loyaltyPoints: svc.loyaltyPoints,
})

const emitService = (svc: ServiceRequest) => {
  const payload = sanitizeService(svc)
  const client = clients.get(svc.clientId)
  if (client) io.to(client.socketId).emit('service:update', payload)
  if (svc.providerId) {
    const p = providers.get(svc.providerId)
    if (p) io.to(p.socketId).emit('service:update', payload)
  }
}

const emitChatToService = (serviceId: string, msg?: ChatMessage) => {
  const svc = services.get(serviceId)
  if (!svc) return
  if (msg) {
    if (!chats.has(serviceId)) chats.set(serviceId, [])
    chats.get(serviceId)!.push(msg)
    // Persist chat message to DB (fire-and-forget)
    if (svc.dbServiceId) {
      db.serviceChatMessage.create({
        data: {
          serviceId: svc.dbServiceId,
          authorRole: msg.from,
          authorName: msg.fromName,
          text: msg.text,
        }
      }).catch(() => {})
    }
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

// ----------------------- Connection -----------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`)

  socket.on('client:register', async (data: { name: string }) => {
    const id = uid('cli_')
    // Persist user to DB
    let dbUserId: string | undefined
    try {
      const user = await db.user.upsert({
        where: { email: `demo_${data.name}@helpbibi.com` },
        update: { name: data.name },
        create: {
          name: data.name,
          email: `demo_${data.name}@helpbibi.com`,
          role: 'CLIENT',
          clientProfile: { create: {} },
          loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
        },
        include: { loyaltyAccount: true },
      })
      dbUserId = user.id
      const points = user.loyaltyAccount?.points || 0
      clientLoyalty.set(data.name, points)
    } catch (e) {
      console.error('[db] client register error:', e)
    }

    clients.set(id, { id, socketId: socket.id, name: data.name, dbUserId })
    socketToRole.set(socket.id, { role: 'client', id })
    const points = clientLoyalty.get(data.name) || 0
    const tier = loyaltyTier(points)
    socket.emit('client:registered', { id, name: data.name })
    socket.emit('client:loyalty', { points, tier: { name: tier.name, color: tier.color, perk: tier.perk }, nextTierMin: nextTierMin(points) })
    socket.emit('loyalty:rewards', LOYALTY_REWARDS.map(r => ({ ...r, affordable: points >= r.cost })))
    socket.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
    console.log(`[client] registered ${id} (${data.name}) — loyalty ${points}pts (${tier.name}) dbUser=${dbUserId}`)
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
    // Persist loyalty deduction
    if (client.dbUserId) {
      db.loyaltyAccount.update({ where: { userId: client.dbUserId }, data: { points: newPoints } }).catch(() => {})
    }
    console.log(`[loyalty] ${name} redeemed ${reward.code} for ${reward.cost}pts (remaining ${newPoints})`)
  })

  socket.on('provider:register', async (data: { name: string; vehicle: string; plate: string }) => {
    const id = uid('prv_')
    // Persist user + provider profile to DB
    let dbUserId: string | undefined
    let dbProviderProfileId: string | undefined
    try {
      const user = await db.user.upsert({
        where: { email: `demo_${data.name}@helpbibi.com` },
        update: { name: data.name, role: 'PROVIDER' },
        create: {
          name: data.name,
          email: `demo_${data.name}@helpbibi.com`,
          role: 'PROVIDER',
          providerProfile: {
            create: { vehicle: data.vehicle, plate: data.plate, isAvailable: true },
          },
          loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
        },
        include: { providerProfile: true },
      })
      dbUserId = user.id
      dbProviderProfileId = user.providerProfile?.id
    } catch (e) {
      console.error('[db] provider register error:', e)
    }

    const provider: Provider = {
      id, socketId: socket.id, name: data.name, vehicle: data.vehicle, plate: data.plate,
      rating: 4.8, ratingSum: 48, ratingCount: 10, completedCount: 0, earningsToday: 0,
      online: true,
      position: { lat: CITY.center.lat + (Math.random() - 0.5) * CITY.span, lng: CITY.center.lng + (Math.random() - 0.5) * CITY.span },
      currentServiceId: null,
      dbUserId, dbProviderProfileId,
    }
    providers.set(id, provider)
    socketToRole.set(socket.id, { role: 'provider', id })
    emitProvider(provider)
    socket.emit('provider:registered', { id })
    console.log(`[provider] registered ${id} (${data.name}) dbUser=${dbUserId}`)
  })

  socket.on('provider:toggle-online', (data: { online: boolean }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const p = providers.get(role.id)
    if (!p) return
    p.online = data.online
    emitProvider(p)
    if (p.dbProviderProfileId) {
      db.providerProfile.update({ where: { id: p.dbProviderProfileId }, data: { isAvailable: data.online } }).catch(() => {})
    }
  })

  socket.on('promo:validate', (data: { code: string; type: ServiceType; distanceKm: number }) => {
    const code = (data.code || '').trim().toUpperCase()
    const promo = PROMO_CODES[code]
    if (!promo) { socket.emit('promo:result', { valid: false, code, message: 'Cupom inválido ou expirado' }); return }
    const base = calcPrice(data.type, data.distanceKm)
    const { final, discount } = applyPromo(base, code)
    socket.emit('promo:result', { valid: true, code, label: promo.label, type: promo.type, value: promo.value, originalPrice: base, discount, finalPrice: final, message: `Cupom aplicado: ${promo.label}` })
  })

  socket.on('service:request', async (data: {
    clientName: string; type: ServiceType; description: string;
    pickup: LatLng; pickupLabel: string; destination: LatLng; destinationLabel: string;
    paymentMethod: PaymentMethod; promoCode?: string | null
  }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const client = clients.get(role.id)
    if (!client) return

    const distanceKm = haversineKm(data.pickup, data.destination)
    const originalPrice = calcPrice(data.type, distanceKm)
    const promoResult = applyPromo(originalPrice, data.promoCode || null)
    const price = promoResult.valid ? promoResult.final : originalPrice
    const etaMin = calcEta(distanceKm)

    const svc: ServiceRequest = {
      id: uid('svc_'), clientId: role.id, clientName: data.clientName,
      type: data.type, description: data.description,
      pickup: data.pickup, pickupLabel: data.pickupLabel,
      destination: data.destination, destinationLabel: data.destinationLabel,
      price, originalPrice, discount: promoResult.discount,
      promoCode: promoResult.valid ? (data.promoCode || '').trim().toUpperCase() : null,
      distanceKm: Number(distanceKm.toFixed(2)), etaMin,
      status: 'searching', paymentMethod: data.paymentMethod || 'pix',
      providerId: null, notifiedProviderIds: [],
      createdAt: Date.now(),
      timeline: [{ status: 'searching', label: 'Solicitação enviada — procurando prestador próximo', at: Date.now() }],
      rating: null, loyaltyPoints: 0,
    }
    if (promoResult.valid) {
      svc.timeline.push({ status: 'searching', label: `Cupom ${svc.promoCode} aplicado: -R$ ${promoResult.discount}`, at: Date.now() })
    }

    // Persist ServiceRequest to DB
    try {
      if (client.dbUserId) {
        const dbSvc = await db.serviceRequest.create({
          data: {
            clientId: client.dbUserId,
            type: TYPE_MAP[data.type] as any,
            description: data.description,
            status: 'REQUESTED',
            pickup: JSON.stringify(data.pickup),
            pickupLabel: data.pickupLabel,
            destination: JSON.stringify(data.destination),
            destinationLabel: data.destinationLabel,
            distanceKm: svc.distanceKm,
            etaMin,
            price, originalPrice, discount: promoResult.discount,
            promoCode: svc.promoCode,
            paymentMethod: PAYMENT_MAP[data.paymentMethod || 'pix'] as any,
            loyaltyPoints: 0,
            timeline: { create: { status: 'REQUESTED', label: 'Solicitação enviada — procurando prestador próximo' } },
          },
        })
        svc.dbServiceId = dbSvc.id
        if (promoResult.valid) {
          await db.serviceTimelineEvent.create({
            data: { serviceId: dbSvc.id, status: 'REQUESTED', label: `Cupom ${svc.promoCode} aplicado: -R$ ${promoResult.discount}` }
          })
        }
        // Create tracking share
        await db.trackingShare.create({ data: { serviceId: dbSvc.id } }).catch(() => {})
        console.log(`[db] service persisted ${svc.id} → dbId=${dbSvc.id}`)
      }
    } catch (e) {
      console.error('[db] service create error:', e)
    }

    services.set(svc.id, svc)
    emitService(svc)

    // Multi-provider notification
    const candidates = Array.from(providers.values()).filter((p) => p.online && !p.currentServiceId)
    if (candidates.length === 0) {
      setTimeout(() => {
        const s = services.get(svc.id)
        if (s && s.status === 'searching') { pushTimeline(s, 'expired', 'Nenhum prestador disponível no momento'); persistServiceStatus(s); emitService(s) }
      }, 8000)
      return
    }
    candidates.sort((a, b) => haversineKm(a.position, data.pickup) - haversineKm(b.position, data.pickup))
    const toNotify = candidates.slice(0, Math.min(MULTI_NOTIFY_COUNT, candidates.length))
    svc.notifiedProviderIds = toNotify.map((p) => p.id)
    const primary = toNotify[0]
    svc.providerId = primary.id
    primary.currentServiceId = svc.id
    const names = toNotify.map((p) => p.name).join(', ')
    pushTimeline(svc, 'offered', `Chamada enviada para ${toNotify.length} prestador(es) próximo(s): ${names}`)
    persistServiceStatus(svc)
    emitService(svc)
    emitProvider(primary)
    toNotify.forEach((p) => io.to(p.socketId).emit('service:offer', sanitizeService(svc)))

    const expireTimer = setTimeout(() => {
      const s = services.get(svc.id)
      if (s && s.status === 'offered') {
        pushTimeline(s, 'expired', `Prestador(es) não respondeu(ram) a tempo — reofertando...`)
        persistServiceStatus(s)
        s.notifiedProviderIds.forEach((pid) => { const np = providers.get(pid); if (np && np.currentServiceId === s.id) { np.currentServiceId = null; emitProvider(np) } })
        const nextBatch = Array.from(providers.values()).filter((p) => p.online && !p.currentServiceId && !s.notifiedProviderIds.includes(p.id)).sort((a, b) => haversineKm(a.position, s.pickup) - haversineKm(b.position, s.pickup)).slice(0, MULTI_NOTIFY_COUNT)
        if (nextBatch.length > 0) {
          s.notifiedProviderIds = nextBatch.map((p) => p.id); const np = nextBatch[0]; s.providerId = np.id; np.currentServiceId = s.id
          pushTimeline(s, 'offered', `Chamada enviada para ${nextBatch.length} prestador(es): ${nextBatch.map((p) => p.name).join(', ')}`)
          persistServiceStatus(s); emitService(s); emitProvider(np)
          nextBatch.forEach((p) => io.to(p.socketId).emit('service:offer', sanitizeService(s)))
        } else { pushTimeline(s, 'expired', 'Nenhum prestador disponível'); persistServiceStatus(s); emitService(s) }
      }
    }, 12000)
    ;(svc as any)._expireTimer = expireTimer
  })

  socket.on('service:accept', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    if (!svc.notifiedProviderIds.includes(role.id)) return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    const winner = providers.get(role.id)!
    svc.notifiedProviderIds.forEach((pid) => {
      if (pid !== role.id) {
        const np = providers.get(pid)
        if (np) { if (np.currentServiceId === svc.id) np.currentServiceId = null; emitProvider(np); io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: winner.name, cancelled: false }) }
      }
    })
    svc.providerId = winner.id; winner.currentServiceId = svc.id; winner.online = false
    svc.acceptedAt = Date.now()
    pushTimeline(svc, 'accepted', `${winner.name} aceitou a chamada e está a caminho`)
    persistServiceStatus(svc)
    // Link provider to service in DB
    if (svc.dbServiceId && winner.dbProviderProfileId) {
      db.serviceRequest.update({ where: { id: svc.dbServiceId }, data: { providerId: winner.dbProviderProfileId, status: 'ACCEPTED', acceptedAt: new Date() } }).catch(() => {})
    }
    winner.tripStartPos = { ...winner.position }; winner.tripTarget = svc.pickup; winner.tripStartedAt = Date.now(); winner.tripTotalKm = haversineKm(winner.position, svc.pickup); winner.destination = svc.pickup
    emitProvider(winner); emitService(svc); emitChatToService(svc.id)
    console.log(`[service] accepted ${svc.id} by ${winner.name}`)
  })

  socket.on('service:reject', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    if (!svc.notifiedProviderIds.includes(role.id)) return
    const p = providers.get(role.id)!
    if (p.currentServiceId === svc.id) p.currentServiceId = null
    svc.notifiedProviderIds = svc.notifiedProviderIds.filter((id) => id !== role.id)
    emitProvider(p)
    if (svc.providerId === role.id && svc.notifiedProviderIds.length > 0) {
      svc.providerId = svc.notifiedProviderIds[0]; const np = providers.get(svc.providerId); if (np) { np.currentServiceId = svc.id; emitProvider(np) }
    }
    pushTimeline(svc, 'searching', `${p.name} recusou — ${svc.notifiedProviderIds.length} prestador(es) ainda notificado(s)`)
    persistServiceStatus(svc); emitService(svc)
    if (svc.notifiedProviderIds.length === 0) {
      const nextBatch = Array.from(providers.values()).filter((x) => x.online && !x.currentServiceId).sort((a, b) => haversineKm(a.position, svc.pickup) - haversineKm(b.position, svc.pickup)).slice(0, MULTI_NOTIFY_COUNT)
      if (nextBatch.length > 0) {
        svc.notifiedProviderIds = nextBatch.map((x) => x.id); svc.providerId = nextBatch[0].id; nextBatch[0].currentServiceId = svc.id
        pushTimeline(svc, 'offered', `Chamada enviada para ${nextBatch.length} prestador(es): ${nextBatch.map((x) => x.name).join(', ')}`)
        persistServiceStatus(svc); emitService(svc); nextBatch.forEach((x) => { emitProvider(x); io.to(x.socketId).emit('service:offer', sanitizeService(svc)) })
      } else { pushTimeline(svc, 'expired', 'Nenhum prestador disponível'); persistServiceStatus(svc); emitService(svc) }
    }
  })

  socket.on('service:arrived', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    p.position = { ...svc.pickup }
    pushTimeline(svc, 'arrived', `${p.name} chegou ao local do atendimento`)
    persistServiceStatus(svc)
    p.destination = svc.destination; p.tripStartPos = { ...svc.pickup }; p.tripTarget = svc.destination; p.tripStartedAt = Date.now(); p.tripTotalKm = haversineKm(svc.pickup, svc.destination)
    emitProvider(p); emitService(svc)
  })

  socket.on('service:start', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    p.destination = svc.destination; p.tripStartPos = { ...p.position }; p.tripTarget = svc.destination; p.tripStartedAt = Date.now(); p.tripTotalKm = haversineKm(p.position, svc.destination)
    pushTimeline(svc, 'in_progress', 'Serviço em andamento — rumo ao destino final')
    persistServiceStatus(svc)
    emitProvider(p); emitService(svc)
  })

  socket.on('service:complete', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
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
    persistServiceStatus(svc)
    // Persist loyalty + provider stats to DB
    const client = clients.get(svc.clientId)
    if (client?.dbUserId) {
      db.loyaltyAccount.update({ where: { userId: client.dbUserId }, data: { points: newPoints, tier: newTier.name } }).catch(() => {})
    }
    if (p.dbProviderProfileId) {
      db.providerProfile.update({ where: { id: p.dbProviderProfileId }, data: { completedCount: { increment: 1 }, earningsToday: { increment: svc.price }, isAvailable: true } }).catch(() => {})
    }
    emitProvider(p); emitService(svc)
    if (client) {
      io.to(client.socketId).emit('client:loyalty', { points: newPoints, tier: { name: newTier.name, color: newTier.color, perk: newTier.perk }, nextTierMin: nextTierMin(newPoints), earnedThisService: earned, tierUpgraded: newTier.name !== prevTier.name })
    }
    console.log(`[service] completed ${svc.id} — provider ${p.name} earned R$ ${svc.price}, client +${earned}pts`)
  })

  socket.on('service:rate', (data: { serviceId: string; stars: number; comment: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id || svc.status !== 'completed' || svc.rating) return
    const stars = Math.max(1, Math.min(5, Math.round(data.stars)))
    svc.rating = { stars, comment: (data.comment || '').slice(0, 240), at: Date.now(), from: svc.clientName }
    if (svc.providerId) {
      const p = providers.get(svc.providerId)
      if (p) { p.ratingSum += stars; p.ratingCount += 1; p.rating = Number((p.ratingSum / p.ratingCount).toFixed(2)); emitProvider(p) }
    }
    // Persist rating to DB
    const client = clients.get(svc.clientId)
    if (svc.dbServiceId && client?.dbUserId) {
      db.serviceRating.create({ data: { serviceId: svc.dbServiceId, authorId: client.dbUserId, targetRole: 'provider', stars, comment: (data.comment || '').slice(0, 240) } }).catch(() => {})
      if (svc.providerId) {
        const p = providers.get(svc.providerId)
        if (p?.dbProviderProfileId) {
          db.providerProfile.update({ where: { id: p.dbProviderProfileId }, data: { ratingSum: { increment: stars }, ratingCount: { increment: 1 }, rating: Number(((p.ratingSum + stars) / (p.ratingCount + 1)).toFixed(2)) } }).catch(() => {})
        }
      }
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
    // Persist rating to DB
    if (svc.dbServiceId && p.dbUserId) {
      db.serviceRating.create({ data: { serviceId: svc.dbServiceId, authorId: p.dbUserId, targetRole: 'client', stars, comment: (data.comment || '').slice(0, 240) } }).catch(() => {})
    }
    emitService(svc)
    console.log(`[rating] service ${svc.id} client rated ${stars}★ by ${p.name}`)
  })

  socket.on('service:cancel', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id || svc.status === 'completed' || svc.status === 'cancelled') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    svc.notifiedProviderIds.forEach((pid) => {
      const np = providers.get(pid)
      if (np) { if (np.currentServiceId === svc.id) np.currentServiceId = null; np.destination = null; np.tripStartPos = null; np.tripTarget = null; np.tripStartedAt = null; np.tripTotalKm = 0; np.online = true; emitProvider(np); io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: null, cancelled: true }) }
    })
    pushTimeline(svc, 'cancelled', 'Solicitação cancelada pelo cliente')
    persistServiceStatus(svc)
    svc.completedAt = Date.now()
    emitService(svc)
  })

  // ---------- Chat ----------
  socket.on('chat:send', (data: { serviceId: string; text: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    const svc = services.get(data.serviceId)
    if (!svc) return
    if (role.role === 'client' && svc.clientId !== role.id) return
    if (role.role === 'provider' && svc.providerId !== role.id) return
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

  // Public tracking — tries DB first, falls back to in-memory
  socket.on('public:track', async (data: { serviceId: string }) => {
    const svc = services.get(data.serviceId)
    if (svc) {
      // In-memory service found — return from memory
      const p = svc.providerId ? providers.get(svc.providerId) : null
      socket.emit('public:track-result', {
        available: true, serviceId: svc.id, status: svc.status, type: svc.type,
        typeLabel: SERVICE_TYPES[svc.type]?.label || svc.type, icon: SERVICE_TYPES[svc.type]?.icon || 'wrench',
        pickupLabel: svc.pickupLabel, destinationLabel: svc.destinationLabel, distanceKm: svc.distanceKm, etaMin: svc.etaMin,
        createdAt: svc.createdAt, acceptedAt: svc.acceptedAt || null, completedAt: svc.completedAt || null,
        timeline: svc.timeline,
        provider: p ? { name: p.name, vehicle: p.vehicle, rating: p.rating } : null,
        providerPosition: p ? p.position : null, pickup: svc.pickup, destination: svc.destination,
        tripProgress: p ? { startPos: p.tripStartPos || null, target: p.tripTarget || null, startedAt: p.tripStartedAt || null, totalKm: p.tripTotalKm || 0 } : null,
      })
      return
    }
    // Try DB by the socket service ID (could be the DB ID itself)
    try {
      const dbSvc = await db.serviceRequest.findUnique({
        where: { id: data.serviceId },
        include: { timeline: { orderBy: { createdAt: 'asc' } }, provider: { include: { user: true } } },
      })
      if (dbSvc) {
        const statusMap: Record<string, string> = { REQUESTED: 'searching', OFFERED: 'offered', ACCEPTED: 'accepted', PROVIDER_EN_ROUTE: 'arriving', ARRIVED: 'arrived', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELED: 'cancelled', EXPIRED: 'expired', FAILED: 'expired' }
        const typeLabels: Record<string, string> = { REBOQUE: 'Reboque / Guincho', PNEU: 'Troca de Pneu', BATERIA: 'Carga de Bateria', COMBUSTIVEL: 'Combustível', CHAVEIRO: 'Chaveiro', PANE: 'Pane Mecânica' }
        const typeIcons: Record<string, string> = { REBOQUE: 'tow-truck', PNEU: 'tire', BATERIA: 'battery', COMBUSTIVEL: 'fuel', CHAVEIRO: 'key', PANE: 'wrench' }
        socket.emit('public:track-result', {
          available: true, serviceId: data.serviceId,
          status: statusMap[dbSvc.status] || 'expired',
          type: dbSvc.type.toLowerCase(), typeLabel: typeLabels[dbSvc.type] || dbSvc.type, icon: typeIcons[dbSvc.type] || 'wrench',
          pickupLabel: dbSvc.pickupLabel, destinationLabel: dbSvc.destinationLabel,
          distanceKm: dbSvc.distanceKm, etaMin: dbSvc.etaMin,
          createdAt: dbSvc.createdAt.getTime(), acceptedAt: dbSvc.acceptedAt?.getTime() || null, completedAt: dbSvc.completedAt?.getTime() || null,
          timeline: dbSvc.timeline.map((ev: any) => ({ status: statusMap[ev.status] || 'expired', label: ev.label, at: ev.createdAt.getTime() })),
          provider: dbSvc.provider ? { name: dbSvc.provider.user.name, vehicle: dbSvc.provider.vehicle, rating: dbSvc.provider.rating } : null,
          providerPosition: dbSvc.providerLat && dbSvc.providerLng ? { lat: dbSvc.providerLat, lng: dbSvc.providerLng } : null,
          pickup: JSON.parse(dbSvc.pickup), destination: JSON.parse(dbSvc.destination),
          tripProgress: null,
        })
        return
      }
    } catch (e) {
      console.error('[db] public:track error:', e)
    }
    socket.emit('public:track-result', { available: false, message: 'Rastreamento indisponível ou encerrado.' })
  })

  socket.on('disconnect', () => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    if (role.role === 'client') { clients.delete(role.id) }
    else if (role.role === 'provider') {
      const p = providers.get(role.id)
      if (p) { p.online = false; providers.delete(role.id); io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic)) }
    }
    socketToRole.delete(socket.id)
    console.log(`[socket] disconnected ${socket.id}`)
  })
})

// ----------------------- Movement simulation loop -----------------------
setInterval(() => {
  for (const p of providers.values()) {
    if (!p.destination) continue
    const stepKm = 0.18
    const { pos, arrived } = stepToward(p.position, p.destination, stepKm)
    p.position = pos
    emitProvider(p)
    if (p.currentServiceId) {
      const svc = services.get(p.currentServiceId)
      if (svc) {
        // Persist provider position (throttled)
        persistProviderPosition(svc, p)
        if (arrived) {
          if (svc.status === 'accepted') { pushTimeline(svc, 'arriving', `${p.name} está próximo do local`); persistServiceStatus(svc); emitService(svc) }
        } else if (svc.status === 'accepted') {
          pushTimeline(svc, 'arriving', `${p.name} está a caminho do local`); emitService(svc)
        }
      }
    }
  }
}, 1000)

setInterval(() => {
  io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
  const leaderboard = Array.from(providers.values()).map(p => ({ id: p.id, name: p.name, vehicle: p.vehicle, rating: p.rating, completedCount: p.completedCount, earningsToday: p.earningsToday })).sort((a, b) => { if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount; return b.rating - a.rating }).slice(0, 10)
  io.emit('leaderboard', leaderboard)
}, 5000)

const PORT = 3003
httpServer.listen(PORT, () => { console.log(`🚑 Help Bibi rescue-service running on port ${PORT} (with Prisma persistence)`) })

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
