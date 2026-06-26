import { createServer } from 'http'
import { Server } from 'socket.io'

// ============================================================
// SocorroJá — Real-time rescue orchestration service
// Handles: provider presence, service requests, live tracking
// ============================================================

const httpServer = createServer((req, res) => {
  // simple health check
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

type Provider = {
  id: string
  socketId: string
  name: string
  vehicle: string
  plate: string
  rating: number
  online: boolean
  position: LatLng
  destination?: LatLng | null
  currentServiceId?: string | null
}

type ServiceType = 'reboque' | 'pneu' | 'bateria' | 'combustivel' | 'chaveiro' | 'pane'

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
  distanceKm: number
  etaMin: number
  status: 'searching' | 'offered' | 'accepted' | 'arriving' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired'
  providerId?: string | null
  createdAt: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline: TimelineEvent[]
}

type TimelineEvent = {
  status: ServiceRequest['status']
  label: string
  at: number
}

type ServiceTypeMeta = {
  label: string
  basePrice: number
  icon: string
}

const SERVICE_TYPES: Record<ServiceType, ServiceTypeMeta> = {
  reboque: { label: 'Reboque / Guincho', basePrice: 180, icon: 'tow-truck' },
  pneu: { label: 'Troca de Pneu', basePrice: 90, icon: 'tire' },
  bateria: { label: 'Carga de Bateria', basePrice: 70, icon: 'battery' },
  combustivel: { label: 'Combustível', basePrice: 60, icon: 'fuel' },
  chaveiro: { label: 'Chaveiro Automotivo', basePrice: 120, icon: 'key' },
  pane: { label: 'Pane Seca / Mecânica', basePrice: 110, icon: 'wrench' },
}

// ----------------------- State -----------------------
const providers = new Map<string, Provider>() // providerId -> Provider
const clients = new Map<string, { id: string; socketId: string }>()
const services = new Map<string, ServiceRequest>() // serviceId -> request
const socketToRole = new Map<string, { role: Role; id: string }>()

// Simulated city map bounds (a virtual grid we move providers around)
// We use lat/lng-ish coordinates on a small virtual city.
const CITY = {
  center: { lat: -23.5505, lng: -46.6333 }, // São Paulo-ish
  span: 0.05, // ~5km
}

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

const calcEta = (distanceKm: number) => Math.max(3, Math.round(distanceKm / 0.5)) // ~30km/h city

const pushTimeline = (svc: ServiceRequest, status: ServiceRequest['status'], label: string) => {
  svc.status = status
  svc.timeline.push({ status, label, at: Date.now() })
}

// Move a provider one step toward a target, return new position + arrived flag
const stepToward = (from: LatLng, to: LatLng, stepKm: number): { pos: LatLng; arrived: boolean } => {
  const dist = haversineKm(from, to)
  if (dist <= stepKm) return { pos: { ...to }, arrived: true }
  const ratio = stepKm / dist
  return {
    pos: { lat: from.lat + (to.lat - from.lat) * ratio, lng: from.lng + (to.lng - from.lng) * ratio },
    arrived: false,
  }
}

const emitProvider = (p: Provider) => {
  io.to(p.socketId).emit('provider:state', {
    id: p.id,
    name: p.name,
    vehicle: p.vehicle,
    plate: p.plate,
    rating: p.rating,
    online: p.online,
    position: p.position,
    currentServiceId: p.currentServiceId,
  })
  io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map((x) => ({
    id: x.id, name: x.name, vehicle: x.vehicle, rating: x.rating, position: x.position, online: x.online,
  })))
}

const emitService = (svc: ServiceRequest) => {
  const payload = sanitizeService(svc)
  // to client
  const client = clients.get(svc.clientId)
  if (client) io.to(client.socketId).emit('service:update', payload)
  // to provider
  if (svc.providerId) {
    const p = providers.get(svc.providerId)
    if (p) io.to(p.socketId).emit('service:update', payload)
  }
  // broadcast light status for map
  io.emit('service:public', { id: svc.id, status: svc.status, clientId: svc.clientId, providerId: svc.providerId, pickup: svc.pickup, destination: svc.destination })
}

const sanitizeService = (svc: ServiceRequest) => ({
  id: svc.id,
  clientId: svc.clientId,
  clientName: svc.clientName,
  type: svc.type,
  typeLabel: SERVICE_TYPES[svc.type].label,
  icon: SERVICE_TYPES[svc.type].icon,
  description: svc.description,
  pickup: svc.pickup,
  pickupLabel: svc.pickupLabel,
  destination: svc.destination,
  destinationLabel: svc.destinationLabel,
  price: svc.price,
  distanceKm: svc.distanceKm,
  etaMin: svc.etaMin,
  status: svc.status,
  providerId: svc.providerId,
  provider: svc.providerId ? providers.get(svc.providerId) : null,
  createdAt: svc.createdAt,
  acceptedAt: svc.acceptedAt,
  completedAt: svc.completedAt,
  timeline: svc.timeline,
})

// ----------------------- Connection -----------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`)

  socket.on('client:register', (data: { name: string }) => {
    const id = uid('cli_')
    clients.set(id, { id, socketId: socket.id })
    socketToRole.set(socket.id, { role: 'client', id })
    socket.emit('client:registered', { id, name: data.name })
    // send nearby providers immediately
    socket.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map((x) => ({
      id: x.id, name: x.name, vehicle: x.vehicle, rating: x.rating, position: x.position, online: x.online,
    })))
    console.log(`[client] registered ${id} (${data.name})`)
  })

  socket.on('provider:register', (data: { name: string; vehicle: string; plate: string }) => {
    const id = uid('prv_')
    const provider: Provider = {
      id,
      socketId: socket.id,
      name: data.name,
      vehicle: data.vehicle,
      plate: data.plate,
      rating: 4.8,
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

  // Client creates a service request
  socket.on('service:request', (data: {
    clientName: string
    type: ServiceType
    description: string
    pickup: LatLng
    pickupLabel: string
    destination: LatLng
    destinationLabel: string
  }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'client') return

    const distanceKm = haversineKm(data.pickup, data.destination)
    const price = calcPrice(data.type, distanceKm)
    const etaMin = calcEta(distanceKm)

    const svc: ServiceRequest = {
      id: uid('svc_'),
      clientId: role.id,
      clientName: data.clientName,
      type: data.type,
      description: data.description,
      pickup: data.pickup,
      pickupLabel: data.pickupLabel,
      destination: data.destination,
      destinationLabel: data.destinationLabel,
      price,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMin,
      status: 'searching',
      providerId: null,
      createdAt: Date.now(),
      timeline: [{ status: 'searching', label: 'Solicitação enviada — procurando prestador próximo', at: Date.now() }],
    }
    services.set(svc.id, svc)
    emitService(svc)

    // Find nearest online provider without active service
    const candidates = Array.from(providers.values()).filter((p) => p.online && !p.currentServiceId)
    if (candidates.length === 0) {
      // No provider available — let client know; after a short wait auto-expire
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

    // Send the offer to provider; they have 12s to accept or it expires
    const offer = sanitizeService(svc)
    io.to(chosen.socketId).emit('service:offer', offer)

    const expireTimer = setTimeout(() => {
      const s = services.get(svc.id)
      if (s && s.status === 'offered') {
        pushTimeline(s, 'expired', `${chosen.name} não respondeu a tempo — reofertando...`)
        chosen.currentServiceId = null
        emitProvider(chosen)
        // re-offer to next nearest provider
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
    // store for cleanup if accepted
    ;(svc as any)._expireTimer = expireTimer
  })

  // Provider accepts an offer
  socket.on('service:accept', (data: { serviceId: string }) => {
    const role = socketToRole.get(socket.id)
    if (!role || role.role !== 'provider') return
    const svc = services.get(data.serviceId)
    if (!svc || svc.providerId !== role.id || svc.status !== 'offered') return
    if ((svc as any)._expireTimer) clearTimeout((svc as any)._expireTimer)
    const p = providers.get(role.id)!
    p.online = false // busy
    svc.acceptedAt = Date.now()
    pushTimeline(svc, 'accepted', `${p.name} aceitou a chamada e está a caminho`)
    p.destination = svc.pickup
    emitProvider(p)
    emitService(svc)
  })

  // Provider rejects an offer (re-offer to next)
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
    // re-offer
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

  // Provider manually arrived at pickup
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

  // Provider starts the service (begins trip to destination)
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

  // Provider completes the service
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
    svc.completedAt = Date.now()
    pushTimeline(svc, 'completed', 'Serviço concluído com sucesso. Obrigado!')
    emitProvider(p)
    emitService(svc)
    console.log(`[service] completed ${svc.id}`)
  })

  // Client cancels a service
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
    emitService(svc)
  })

  socket.on('disconnect', () => {
    const role = socketToRole.get(socket.id)
    if (!role) return
    if (role.role === 'client') {
      clients.delete(role.id)
    } else if (role.role === 'provider') {
      const p = providers.get(role.id)
      if (p) {
        // if in middle of service, mark provider offline but keep service record
        p.online = false
        providers.delete(role.id)
        io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map((x) => ({
          id: x.id, name: x.name, vehicle: x.vehicle, rating: x.rating, position: x.position, online: x.online,
        })))
      }
    }
    socketToRole.delete(socket.id)
    console.log(`[socket] disconnected ${socket.id}`)
  })
})

// ----------------------- Movement simulation loop -----------------------
// Every 1s, move each provider that has a destination toward it.
setInterval(() => {
  for (const p of providers.values()) {
    if (!p.destination) continue
    const stepKm = 0.18 // ~ moves decently for demo (about 180m/s)
    const { pos, arrived } = stepToward(p.position, p.destination, stepKm)
    p.position = pos
    emitProvider(p)
    // find the service this provider is on
    if (p.currentServiceId) {
      const svc = services.get(p.currentServiceId)
      if (svc) {
        if (arrived) {
          // auto-advance states based on current status
          if (svc.status === 'accepted') {
            pushTimeline(svc, 'arriving', `${p.name} está próximo do local`)
            emitService(svc)
          }
        } else if (svc.status === 'accepted') {
          // keep feeding arriving status occasionally
          pushTimeline(svc, 'arriving', `${p.name} está a caminho do local`)
          emitService(svc)
        }
      }
    }
  }
}, 1000)

// Broadcast nearby providers periodically so clients see movement
setInterval(() => {
  io.emit('providers:nearby', Array.from(providers.values()).filter((x) => x.online).map((x) => ({
    id: x.id, name: x.name, vehicle: x.vehicle, rating: x.rating, position: x.position, online: x.online,
  })))
}, 2000)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`🚑 SocorroJá rescue-service running on port ${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
