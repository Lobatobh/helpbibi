import { createServer } from 'http'
import { Server } from 'socket.io'

// ============================================================
// SocorroJá — Real-time rescue orchestration service
// Handles: provider presence, service requests, live tracking,
//          ratings, payment method, provider stats, chat, promos.
// ============================================================

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, providers: providers.size, activeServices: services.size }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('SocorroJá rescue-service running')
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
  createdAt: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline: TimelineEvent[]
  rating?: Rating | null
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

// ----------------------- State -----------------------
const providers = new Map<string, Provider>()
const clients = new Map<string, { id: string; socketId: string }>()
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
  provider: svc.providerId ? providers.get(svc.providerId) : null,
  createdAt: svc.createdAt, acceptedAt: svc.acceptedAt, completedAt: svc.completedAt,
  timeline: svc.timeline, rating: svc.rating || null,
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
    clients.set(id, { id, socketId: socket.id })
    socketToRole.set(socket.id, { role: 'client', id })
    socket.emit('client:registered', { id, name: data.name })
    socket.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map(providerPublic))
    console.log(`[client] registered ${id} (${data.name})`)
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
      createdAt: Date.now(),
      timeline: [{ status: 'searching', label: 'Solicitação enviada — procurando prestador próximo', at: Date.now() }],
      rating: null,
    }
    if (promoResult.valid) {
      svc.timeline.push({ status: 'searching', label: `Cupom ${svc.promoCode} aplicado: -R$ ${promoResult.discount}`, at: Date.now() })
    }
    services.set(svc.id, svc)
    emitService(svc)

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
    const chosen = candidates[0]
    svc.providerId = chosen.id
    chosen.currentServiceId = svc.id
    pushTimeline(svc, 'offered', `Chamada enviada para ${chosen.name} (${chosen.vehicle})`)
    emitService(svc)
    emitProvider(chosen)

    io.to(chosen.socketId).emit('service:offer', sanitizeService(svc))

    const expireTimer = setTimeout(() => {
      const s = services.get(svc.id)
      if (s && s.status === 'offered') {
        pushTimeline(s, 'expired', `${chosen.name} não respondeu a tempo — reofertando...`)
        chosen.currentServiceId = null
        emitProvider(chosen)
        const next = Array.from(providers.values())
          .filter((p) => p.online && !p.currentServiceId && p.id !== chosen.id)
          .sort((a, b) => haversineKm(a.position, s.pickup) - haversineKm(b.position, s.pickup))[0]
        if (next) {
          s.providerId = next.id
          next.currentServiceId = s.id
          pushTimeline(s, 'offered', `Chamada enviada para ${next.name} (${next.vehicle})`)
          emitService(s)
          emitProvider(next)
          io.to(next.socketId).emit('service:offer', sanitizeService(s))
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
    if (!svc || svc.providerId !== role.id || svc.status !== 'offered') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    const p = providers.get(role.id)!
    p.online = false
    svc.acceptedAt = Date.now()
    pushTimeline(svc, 'accepted', `${p.name} aceitou a chamada e está a caminho`)
    p.destination = svc.pickup
    emitProvider(p)
    emitService(svc)
    // send existing chat history to provider (if any)
    emitChatToService(svc.id)
  })

  socket.on('service:reject', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id || svc.status !== 'offered') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    const p = providers.get(role.id)!
    p.currentServiceId = null
    emitProvider(p)
    pushTimeline(svc, 'searching', `${p.name} recusou — procurando outro prestador`)
    const next = Array.from(providers.values())
      .filter((x) => x.online && !x.currentServiceId && x.id !== p.id)
      .sort((a, b) => haversineKm(a.position, svc.pickup) - haversineKm(b.position, svc.pickup))[0]
    if (next) {
      svc.providerId = next.id
      next.currentServiceId = svc.id
      pushTimeline(svc, 'offered', `Chamada enviada para ${next.name} (${next.vehicle})`)
      emitService(svc)
      emitProvider(next)
      io.to(next.socketId).emit('service:offer', sanitizeService(svc))
    } else {
      pushTimeline(svc, 'expired', 'Nenhum prestador disponível')
      emitService(svc)
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
    svc.completedAt = Date.now()
    pushTimeline(svc, 'completed', 'Serviço concluído com sucesso. Avalie o atendimento!')
    emitProvider(p)
    emitService(svc)
    console.log(`[service] completed ${svc.id} — provider ${p.name} earned R$ ${svc.price}`)
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

  socket.on('service:cancel', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.clientId !== role.id) return
    if (svc.status === 'completed' || svc.status === 'cancelled') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    if (svc.providerId) {
      const p = providers.get(svc.providerId)
      if (p) {
        p.currentServiceId = null
        p.destination = null
        p.online = true
        emitProvider(p)
      }
    }
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
}, 2000)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`🚑 SocorroJá rescue-service running on port ${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
