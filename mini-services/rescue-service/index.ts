import { createServer } from 'http'
import { Server } from 'socket.io'

// ============================================================
// Help Bibi — Real-time rescue orchestration service
// Handles: provider presence, service requests, live tracking,
//          ratings, payment method, provider stats, chat, promos.
// ============================================================

const httpServer = createServer((req, res) => {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, name: 'Help Bibi', providers: providers.size, activeServices: services.size }))
    return
  }

  // Public tracking endpoint: GET /track/:serviceId
  const trackMatch = req.url?.match(/^\/track\/(.+)$/)
  if (trackMatch && req.method === 'GET') {
    const serviceId = decodeURIComponent(trackMatch[1])
    const svc = services.get(serviceId)
    if (!svc) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ available: false, message: 'Rastreamento indisponível ou encerrado.' }))
      return
    }
    // Return public-safe data (no client personal info, no payment details)
    const publicData = {
      available: true,
      serviceId: svc.id,
      status: svc.status,
      type: svc.type,
      typeLabel: SERVICE_TYPES[svc.type]?.label || svc.type,
      icon: SERVICE_TYPES[svc.type]?.icon || 'wrench',
      pickupLabel: svc.pickupLabel,
      destinationLabel: svc.destinationLabel,
      distanceKm: svc.distanceKm,
      etaMin: svc.etaMin,
      createdAt: svc.createdAt,
      acceptedAt: svc.acceptedAt || null,
      completedAt: svc.completedAt || null,
      timeline: svc.timeline,
      // Provider public info (name + vehicle only, no plate)
      provider: svc.providerId ? (() => {
        const p = providers.get(svc.providerId)
        return p ? { name: p.name, vehicle: p.vehicle, rating: p.rating } : null
      })() : null,
      // Provider position for map (if available)
      providerPosition: svc.providerId ? (() => {
        const p = providers.get(svc.providerId)
        return p ? p.position : null
      })() : null,
      pickup: svc.pickup,
      destination: svc.destination,
      tripProgress: svc.providerId ? (() => {
        const p = providers.get(svc.providerId)
        return p ? {
          startPos: p.tripStartPos || null,
          target: p.tripTarget || null,
          startedAt: p.tripStartedAt || null,
          totalKm: p.tripTotalKm || 0,
        } : null
      })() : null,
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(publicData))
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
  id: string
  serviceId: string
  from: 'client' | 'provider'
  fromName: string
  text: string
  at: number
}

type Provider = {
  id: string
  socketId: string
  name: string
  vehicle: string
  plate: string
  rating: number
  ratingSum: number
  ratingCount: number
  completedCount: number
  earningsToday: number
  online: boolean
  position: LatLng
  destination?: LatLng | null
  currentServiceId?: string | null
  // trip progress tracking
  tripStartPos?: LatLng | null
  tripTarget?: LatLng | null
  tripStartedAt?: number | null
  tripTotalKm?: number
}

type ServiceRequest = {
  id: string
  clientId: string
  clientName: string
  type: ServiceType
  description: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng
  destinationLabel: string
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  distanceKm: number
  etaMin: number
  status: ServiceStatus
  paymentMethod: PaymentMethod
  providerId?: string | null
  notifiedProviderIds: string[]
  createdAt: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline: TimelineEvent[]
  rating?: Rating | null
  clientRating?: Rating | null
  // loyalty
  loyaltyPoints: number
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

// Promo codes (demo): code -> { type, value, label }
type PromoDef = { type: 'percent' | 'fixed'; value: number; label: string }
const PROMO_CODES: Record<string, PromoDef> = {
  SOCORRO10: { type: 'percent', value: 10, label: '10% OFF' },
  BEMVINDO20: { type: 'fixed', value: 20, label: 'R$ 20 OFF' },
  PROMO15: { type: 'percent', value: 15, label: '15% OFF' },
}

// Loyalty rewards: spend points to get a one-time promo code
const LOYALTY_REWARDS = [
  { id: 'reward_5pct', cost: 100, code: 'FIDEL5', type: 'percent' as const, value: 5, label: '5% OFF', desc: 'Cupom de 5% de desconto' },
  { id: 'reward_10pct', cost: 200, code: 'FIDEL10', type: 'percent' as const, value: 10, label: '10% OFF', desc: 'Cupom de 10% de desconto' },
  { id: 'reward_25', cost: 300, code: 'FIDEL25', type: 'fixed' as const, value: 25, label: 'R$ 25 OFF', desc: 'Cupom de R$ 25 de desconto' },
  { id: 'reward_15pct', cost: 500, code: 'FIDEL15', type: 'percent' as const, value: 15, label: '15% OFF', desc: 'Cupom de 15% de desconto' },
]

// Loyalty: clients earn 1 point per R$ 1 spent. Tiers based on total points.
const LOYALTY_TIERS = [
  { name: 'Bronze', min: 0, color: '#a16207', perk: '5% OFF no próximo' },
  { name: 'Prata', min: 200, color: '#94a3b8', perk: '8% OFF + prioridade' },
  { name: 'Ouro', min: 500, color: '#f59e0b', perk: '12% OFF + suporte VIP' },
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
// client loyalty points (in-memory; keyed by clientName for demo persistence across sessions)
const clientLoyalty = new Map<string, number>()

// How many nearby providers to notify simultaneously for a new request
const MULTI_NOTIFY_COUNT = 3

// ----------------------- State -----------------------
const providers = new Map<string, Provider>()
const clients = new Map<string, { id: string; socketId: string; name: string }>()
const services = new Map<string, ServiceRequest>()
const chats = new Map<string, ChatMessage[]>() // serviceId -> messages
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
  const perKm = 4.5
  return Math.round(meta.basePrice + distanceKm * perKm)
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
    tripStartPos: p.tripStartPos || null,
    tripTarget: p.tripTarget || null,
    tripStartedAt: p.tripStartedAt || null,
    tripTotalKm: p.tripTotalKm || 0,
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
  paymentMethod: svc.paymentMethod,
  providerId: svc.providerId,
  notifiedProviderIds: svc.notifiedProviderIds,
  notifiedCount: svc.notifiedProviderIds.length,
  provider: svc.providerId ? providers.get(svc.providerId) : null,
  createdAt: svc.createdAt, acceptedAt: svc.acceptedAt, completedAt: svc.completedAt,
  timeline: svc.timeline, rating: svc.rating || null,
  clientRating: svc.clientRating || null,
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
  io.emit('service:public', {
    id: svc.id, status: svc.status, clientId: svc.clientId, providerId: svc.providerId,
    pickup: svc.pickup, destination: svc.destination,
  })
}

// Send chat history + emit to both parties
const emitChatToService = (serviceId: string, msg?: ChatMessage) => {
  const svc = services.get(serviceId)
  if (!svc) return
  const msgs = chats.get(serviceId) || []
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

// ----------------------- Connection -----------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`)

  socket.on('client:register', (data: { name: string }) => {
    const id = uid('cli_')
    clients.set(id, { id, socketId: socket.id, name: data.name })
    socketToRole.set(socket.id, { role: 'client', id })
    const points = clientLoyalty.get(data.name) || 0
    const tier = loyaltyTier(points)
    socket.emit('client:registered', { id, name: data.name })
    socket.emit('client:loyalty', { points, tier: { name: tier.name, color: tier.color, perk: tier.perk }, nextTierMin: nextTierMin(points) })
    socket.emit('loyalty:rewards', LOYALTY_REWARDS.map(r => ({ ...r, affordable: points >= r.cost })))
    socket.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
    console.log(`[client] registered ${id} (${data.name}) — loyalty ${points}pts (${tier.name})`)
  })

  // Redeem loyalty points for a promo code
  socket.on('loyalty:redeem', (data: { rewardId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const client = clients.get(role.id)
    if (!client) return
    const name = client.name
    const reward = LOYALTY_REWARDS.find(r => r.id === data.rewardId)
    if (!reward) {
      socket.emit('loyalty:redeem-result', { success: false, message: 'Recompensa não encontrada' })
      return
    }
    const points = clientLoyalty.get(name) || 0
    if (points < reward.cost) {
      socket.emit('loyalty:redeem-result', { success: false, message: `Pontos insuficientes. Necessário: ${reward.cost}` })
      return
    }
    // Deduct points and grant the promo code (add to PROMO_CODES so it's valid)
    const newPoints = points - reward.cost
    clientLoyalty.set(name, newPoints)
    PROMO_CODES[reward.code] = { type: reward.type, value: reward.value, label: reward.label }
    const tier = loyaltyTier(newPoints)
    socket.emit('loyalty:redeem-result', {
      success: true,
      code: reward.code,
      label: reward.label,
      pointsSpent: reward.cost,
      pointsRemaining: newPoints,
      message: `Cupom ${reward.code} resgatado! Use no próximo serviço.`,
    })
    socket.emit('client:loyalty', {
      points: newPoints,
      tier: { name: tier.name, color: tier.color, perk: tier.perk },
      nextTierMin: nextTierMin(newPoints),
    })
    socket.emit('loyalty:rewards', LOYALTY_REWARDS.map(r => ({ ...r, affordable: newPoints >= r.cost })))
    console.log(`[loyalty] ${name} redeemed ${reward.code} for ${reward.cost}pts (remaining ${newPoints})`)
  })

  socket.on('provider:register', (data: { name: string; vehicle: string; plate: string }) => {
    const id = uid('prv_')
    const provider: Provider = {
      id, socketId: socket.id, name: data.name, vehicle: data.vehicle, plate: data.plate,
      rating: 4.8, ratingSum: 48, ratingCount: 10, completedCount: 0, earningsToday: 0,
      online: true,
      position: {
        lat: CITY.center.lat + (Math.random() - 0.5) * CITY.span,
        lng: CITY.center.lng + (Math.random() - 0.5) * CITY.span,
      },
      currentServiceId: null,
    }
    providers.set(id, provider)
    socketToRole.set(socket.id, { role: 'provider', id })
    emitProvider(provider)
    socket.emit('provider:registered', { id })
    console.log(`[provider] registered ${id} (${data.name})`)
  })

  socket.on('provider:toggle-online', (data: { online: boolean }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const p = providers.get(role.id)
    if (!p) return
    p.online = data.online
    emitProvider(p)
  })

  // Validate a promo code (returns discount preview without creating a service)
  socket.on('promo:validate', (data: { code: string; type: ServiceType; distanceKm: number }) => {
    const code = (data.code || '').trim().toUpperCase()
    const promo = PROMO_CODES[code]
    if (!promo) {
      socket.emit('promo:result', { valid: false, code, message: 'Cupom inválido ou expirado' })
      return
    }
    const base = calcPrice(data.type, data.distanceKm)
    const { final, discount } = applyPromo(base, code)
    socket.emit('promo:result', {
      valid: true, code, label: promo.label, type: promo.type, value: promo.value,
      originalPrice: base, discount, finalPrice: final,
      message: `Cupom aplicado: ${promo.label}`,
    })
  })

  socket.on('service:request', (data: {
    clientName: string
    type: ServiceType
    description: string
    pickup: LatLng
    pickupLabel: string
    destination: LatLng
    destinationLabel: string
    paymentMethod: PaymentMethod
    promoCode?: string | null
  }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return

    const distanceKm = haversineKm(data.pickup, data.destination)
    const originalPrice = calcPrice(data.type, distanceKm)
    const promoResult = applyPromo(originalPrice, data.promoCode || null)
    const price = promoResult.valid ? promoResult.final : originalPrice
    const etaMin = calcEta(distanceKm)

    const svc: ServiceRequest = {
      id: uid('svc_'),
      clientId: role.id,
      clientName: data.clientName,
      type: data.type,
      description: data.description,
      pickup: data.pickup, pickupLabel: data.pickupLabel,
      destination: data.destination, destinationLabel: data.destinationLabel,
      price, originalPrice, discount: promoResult.discount,
      promoCode: promoResult.valid ? (data.promoCode || '').trim().toUpperCase() : null,
      distanceKm: Number(distanceKm.toFixed(2)), etaMin,
      status: 'searching',
      paymentMethod: data.paymentMethod || 'pix',
      providerId: null,
      notifiedProviderIds: [],
      createdAt: Date.now(),
      timeline: [{ status: 'searching', label: 'Solicitação enviada — procurando prestador próximo', at: Date.now() }],
      rating: null,
      loyaltyPoints: 0,
    }
    if (promoResult.valid) {
      svc.timeline.push({ status: 'searching', label: `Cupom ${svc.promoCode} aplicado: -R$ ${promoResult.discount}`, at: Date.now() })
    }
    services.set(svc.id, svc)
    emitService(svc)

    // --- Multi-provider notification: notify up to MULTI_NOTIFY_COUNT nearest providers ---
    const candidates = Array.from(providers.values()).filter((p) => p.online && !p.currentServiceId)
    if (candidates.length === 0) {
      setTimeout(() => {
        const s = services.get(svc.id)
        if (s && s.status === 'searching') {
          pushTimeline(s, 'expired', 'Nenhum prestador disponível no momento')
          emitService(s)
        }
      }, 8000)
      return
    }
    candidates.sort((a, b) => haversineKm(a.position, data.pickup) - haversineKm(b.position, data.pickup))
    const toNotify = candidates.slice(0, Math.min(MULTI_NOTIFY_COUNT, candidates.length))
    svc.notifiedProviderIds = toNotify.map((p) => p.id)
    // The primary (nearest) provider "claims" the service but all notified can accept (first-accept wins)
    const primary = toNotify[0]
    svc.providerId = primary.id
    primary.currentServiceId = svc.id
    const names = toNotify.map((p) => p.name).join(', ')
    pushTimeline(svc, 'offered', `Chamada enviada para ${toNotify.length} prestador(es) próximo(s): ${names}`)
    emitService(svc)
    emitProvider(primary)

    // Send offer to ALL notified providers simultaneously
    toNotify.forEach((p) => {
      io.to(p.socketId).emit('service:offer', sanitizeService(svc))
    })

    const expireTimer = setTimeout(() => {
      const s = services.get(svc.id)
      if (s && s.status === 'offered') {
        pushTimeline(s, 'expired', `Prestador(es) não respondeu(ram) a tempo — reofertando...`)
        // free up all notified providers
        s.notifiedProviderIds.forEach((pid) => {
          const np = providers.get(pid)
          if (np && np.currentServiceId === s.id) {
            np.currentServiceId = null
            emitProvider(np)
          }
        })
        // try next batch of providers
        const nextBatch = Array.from(providers.values())
          .filter((p) => p.online && !p.currentServiceId && !s.notifiedProviderIds.includes(p.id))
          .sort((a, b) => haversineKm(a.position, s.pickup) - haversineKm(b.position, s.pickup))
          .slice(0, MULTI_NOTIFY_COUNT)
        if (nextBatch.length > 0) {
          s.notifiedProviderIds = nextBatch.map((p) => p.id)
          const np = nextBatch[0]
          s.providerId = np.id
          np.currentServiceId = s.id
          const nextNames = nextBatch.map((p) => p.name).join(', ')
          pushTimeline(s, 'offered', `Chamada enviada para ${nextBatch.length} prestador(es): ${nextNames}`)
          emitService(s)
          emitProvider(np)
          nextBatch.forEach((p) => io.to(p.socketId).emit('service:offer', sanitizeService(s)))
        } else {
          pushTimeline(s, 'expired', 'Nenhum prestador disponível')
          emitService(s)
        }
      }
    }, 12000)
    ;(svc as any)._expireTimer = expireTimer
  })

  socket.on('service:accept', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    // First-accept-wins: any notified provider can accept
    if (!svc.notifiedProviderIds.includes(role.id)) return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    const winner = providers.get(role.id)!
    // Free up all other notified providers (they didn't win)
    svc.notifiedProviderIds.forEach((pid) => {
      if (pid !== role.id) {
        const np = providers.get(pid)
        if (np) {
          // Clear currentServiceId if it was set (for the primary provider)
          if (np.currentServiceId === svc.id) np.currentServiceId = null
          emitProvider(np)
          // Notify ALL other notified providers that the offer was taken
          io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: winner.name, cancelled: false })
        }
      }
    })
    // Assign to winner
    svc.providerId = winner.id
    winner.currentServiceId = svc.id
    winner.online = false
    svc.acceptedAt = Date.now()
    pushTimeline(svc, 'accepted', `${winner.name} aceitou a chamada e está a caminho`)
    // Start trip progress tracking (provider -> pickup)
    winner.tripStartPos = { ...winner.position }
    winner.tripTarget = svc.pickup
    winner.tripStartedAt = Date.now()
    winner.tripTotalKm = haversineKm(winner.position, svc.pickup)
    winner.destination = svc.pickup
    emitProvider(winner)
    emitService(svc)
    emitChatToService(svc.id)
    console.log(`[service] accepted ${svc.id} by ${winner.name} (first-accept-wins among ${svc.notifiedProviderIds.length})`)
  })

  socket.on('service:reject', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.status !== 'offered') return
    if (!svc.notifiedProviderIds.includes(role.id)) return
    const p = providers.get(role.id)!
    if (p.currentServiceId === svc.id) p.currentServiceId = null
    // remove this provider from notified list
    svc.notifiedProviderIds = svc.notifiedProviderIds.filter((id) => id !== role.id)
    emitProvider(p)
    // If the rejecting provider was the primary, reassign primary to next notified
    if (svc.providerId === role.id && svc.notifiedProviderIds.length > 0) {
      svc.providerId = svc.notifiedProviderIds[0]
      const np = providers.get(svc.providerId)
      if (np) {
        np.currentServiceId = svc.id
        emitProvider(np)
      }
    }
    pushTimeline(svc, 'searching', `${p.name} recusou — ${svc.notifiedProviderIds.length} prestador(es) ainda notificado(s)`)
    emitService(svc)
    // If no notified providers left, try to find more
    if (svc.notifiedProviderIds.length === 0) {
      const nextBatch = Array.from(providers.values())
        .filter((x) => x.online && !x.currentServiceId)
        .sort((a, b) => haversineKm(a.position, svc.pickup) - haversineKm(b.position, svc.pickup))
        .slice(0, MULTI_NOTIFY_COUNT)
      if (nextBatch.length > 0) {
        svc.notifiedProviderIds = nextBatch.map((x) => x.id)
        svc.providerId = nextBatch[0].id
        nextBatch[0].currentServiceId = svc.id
        const names = nextBatch.map((x) => x.name).join(', ')
        pushTimeline(svc, 'offered', `Chamada enviada para ${nextBatch.length} prestador(es): ${names}`)
        emitService(svc)
        nextBatch.forEach((x) => {
          emitProvider(x)
          io.to(x.socketId).emit('service:offer', sanitizeService(svc))
        })
      } else {
        pushTimeline(svc, 'expired', 'Nenhum prestador disponível')
        emitService(svc)
      }
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
    p.destination = svc.destination
    // reset trip tracking for the next leg (pickup -> destination)
    p.tripStartPos = { ...svc.pickup }
    p.tripTarget = svc.destination
    p.tripStartedAt = Date.now()
    p.tripTotalKm = haversineKm(svc.pickup, svc.destination)
    emitProvider(p)
    emitService(svc)
  })

  socket.on('service:start', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    p.destination = svc.destination
    // ensure trip tracking is for the destination leg
    p.tripStartPos = { ...p.position }
    p.tripTarget = svc.destination
    p.tripStartedAt = Date.now()
    p.tripTotalKm = haversineKm(p.position, svc.destination)
    pushTimeline(svc, 'in_progress', 'Serviço em andamento — rumo ao destino final')
    emitProvider(p)
    emitService(svc)
  })

  socket.on('service:complete', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    const p = providers.get(role.id)!
    p.position = { ...svc.destination }
    p.destination = null
    p.currentServiceId = null
    p.online = true
    p.completedCount += 1
    p.earningsToday += svc.price
    // clear trip tracking
    p.tripStartPos = null
    p.tripTarget = null
    p.tripStartedAt = null
    p.tripTotalKm = 0
    svc.completedAt = Date.now()
    // Award loyalty points to client (1 point per R$ 1 spent)
    const earned = Math.round(svc.price)
    const prevPoints = clientLoyalty.get(svc.clientName) || 0
    const newPoints = prevPoints + earned
    clientLoyalty.set(svc.clientName, newPoints)
    svc.loyaltyPoints = earned
    const prevTier = loyaltyTier(prevPoints)
    const newTier = loyaltyTier(newPoints)
    pushTimeline(svc, 'completed', 'Serviço concluído com sucesso. Avalie o atendimento!')
    if (earned > 0) {
      svc.timeline.push({ status: 'completed', label: `+${earned} pontos de fidelidade (${newTier.name})`, at: Date.now() })
    }
    if (newTier.name !== prevTier.name) {
      svc.timeline.push({ status: 'completed', label: `🎉 Subiu para o tier ${newTier.name}! ${newTier.perk}`, at: Date.now() })
    }
    emitProvider(p)
    emitService(svc)
    // Send updated loyalty to client
    const client = clients.get(svc.clientId)
    if (client) {
      io.to(client.socketId).emit('client:loyalty', {
        points: newPoints,
        tier: { name: newTier.name, color: newTier.color, perk: newTier.perk },
        nextTierMin: nextTierMin(newPoints),
        earnedThisService: earned,
        tierUpgraded: newTier.name !== prevTier.name,
      })
    }
    console.log(`[service] completed ${svc.id} — provider ${p.name} earned R$ ${svc.price}, client ${svc.clientName} +${earned}pts (total ${newPoints})`)
  })

  socket.on('service:rate', (data: { serviceId: string; stars: number; comment: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id) return
    if (svc.status !== 'completed') return
    if (svc.rating) return
    const stars = Math.max(1, Math.min(5, Math.round(data.stars)))
    svc.rating = { stars, comment: (data.comment || '').slice(0, 240), at: Date.now(), from: svc.clientName }
    if (svc.providerId) {
      const p = providers.get(svc.providerId)
      if (p) {
        p.ratingSum += stars
        p.ratingCount += 1
        p.rating = Number((p.ratingSum / p.ratingCount).toFixed(2))
        emitProvider(p)
      }
    }
    emitService(svc)
    console.log(`[rating] service ${svc.id} rated ${stars}★ by ${svc.clientName}`)
  })

  // Provider rates the client after completion (bidirectional rating)
  socket.on('service:rate-client', (data: { serviceId: string; stars: number; comment: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id) return
    if (svc.status !== 'completed') return
    if (svc.clientRating) return
    const stars = Math.max(1, Math.min(5, Math.round(data.stars)))
    const p = providers.get(role.id)!
    svc.clientRating = { stars, comment: (data.comment || '').slice(0, 240), at: Date.now(), from: p.name }
    emitService(svc)
    console.log(`[rating] service ${svc.id} client rated ${stars}★ by ${p.name}`)
  })

  socket.on('service:cancel', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id) return
    if (svc.status === 'completed' || svc.status === 'cancelled') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    // free all notified providers
    svc.notifiedProviderIds.forEach((pid) => {
      const np = providers.get(pid)
      if (np) {
        if (np.currentServiceId === svc.id) np.currentServiceId = null
        np.destination = null
        np.tripStartPos = null
        np.tripTarget = null
        np.tripStartedAt = null
        np.tripTotalKm = 0
        np.online = true
        emitProvider(np)
        io.to(np.socketId).emit('service:offer-taken', { serviceId: svc.id, acceptedBy: null, cancelled: true })
      }
    })
    pushTimeline(svc, 'cancelled', 'Solicitação cancelada pelo cliente')
    svc.completedAt = Date.now()
    emitService(svc)
  })

  // ---------- Chat ----------
  socket.on('chat:send', (data: { serviceId: string; text: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    const svc = services.get(data.serviceId)
    if (!svc) return
    // Only client or assigned provider can chat
    if (role.role === 'client' && svc.clientId !== role.id) return
    if (role.role === 'provider' && svc.providerId !== role.id) return
    const text = (data.text || '').trim().slice(0, 500)
    if (!text) return
    const fromName = role.role === 'client' ? svc.clientName : (providers.get(role.id)?.name || 'Prestador')
    const msg: ChatMessage = {
      id: uid('msg_'),
      serviceId: svc.id,
      from: role.role,
      fromName,
      text,
      at: Date.now(),
    }
    emitChatToService(svc.id, msg)
    console.log(`[chat] ${fromName}: ${text}`)
  })

  // Request chat history for a service (e.g. after reconnect)
  socket.on('chat:history', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    const svc = services.get(data.serviceId)
    if (!svc) return
    if (role.role === 'client' && svc.clientId !== role.id) return
    if (role.role === 'provider' && svc.providerId !== role.id) return
    socket.emit('chat:messages', { serviceId: svc.id, messages: chats.get(svc.id) || [] })
  })

  // Public tracking — any connection can request service status by ID (no login required)
  socket.on('public:track', (data: { serviceId: string }) => {
    const svc = services.get(data.serviceId)
    if (!svc) {
      socket.emit('public:track-result', { available: false, message: 'Rastreamento indisponível ou encerrado.' })
      return
    }
    // Return public-safe data (no client name, no payment details, no plate)
    const p = svc.providerId ? providers.get(svc.providerId) : null
    socket.emit('public:track-result', {
      available: true,
      serviceId: svc.id,
      status: svc.status,
      type: svc.type,
      typeLabel: SERVICE_TYPES[svc.type]?.label || svc.type,
      icon: SERVICE_TYPES[svc.type]?.icon || 'wrench',
      pickupLabel: svc.pickupLabel,
      destinationLabel: svc.destinationLabel,
      distanceKm: svc.distanceKm,
      etaMin: svc.etaMin,
      createdAt: svc.createdAt,
      acceptedAt: svc.acceptedAt || null,
      completedAt: svc.completedAt || null,
      timeline: svc.timeline,
      provider: p ? { name: p.name, vehicle: p.vehicle, rating: p.rating } : null,
      providerPosition: p ? p.position : null,
      pickup: svc.pickup,
      destination: svc.destination,
      tripProgress: p ? {
        startPos: p.tripStartPos || null,
        target: p.tripTarget || null,
        startedAt: p.tripStartedAt || null,
        totalKm: p.tripTotalKm || 0,
      } : null,
    })
  })

  socket.on('disconnect', () => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    if (role.role === 'client') {
      clients.delete(role.id)
    } else if (role.role === 'provider') {
      const p = providers.get(role.id)
      if (p) {
        p.online = false
        providers.delete(role.id)
        io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
      }
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
        if (arrived) {
          if (svc.status === 'accepted') {
            pushTimeline(svc, 'arriving', `${p.name} está próximo do local`)
            emitService(svc)
          }
        } else if (svc.status === 'accepted') {
          pushTimeline(svc, 'arriving', `${p.name} está a caminho do local`)
          emitService(svc)
        }
      }
    }
  }
}, 1000)

setInterval(() => {
  io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
  // Broadcast leaderboard (top providers by completedCount + rating)
  const leaderboard = Array.from(providers.values())
    .map(p => ({
      id: p.id, name: p.name, vehicle: p.vehicle, rating: p.rating,
      completedCount: p.completedCount, earningsToday: p.earningsToday,
    }))
    .sort((a, b) => {
      // Sort by completedCount desc, then rating desc
      if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount
      return b.rating - a.rating
    })
    .slice(0, 10)
  io.emit('leaderboard', leaderboard)
}, 5000)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`🚑 Help Bibi rescue-service running on port ${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
