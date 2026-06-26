'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ProviderState, ProviderPublic, ServiceData, PaymentMethod } from '@/lib/rescue-types'

type ClientState = {
  connected: boolean
  registered: boolean
  clientId: string | null
  nearby: ProviderPublic[]
  currentService: ServiceData | null
}

type ProviderSession = {
  connected: boolean
  registered: boolean
  providerId: string | null
  state: ProviderState | null
  offer: ServiceData | null
  currentService: ServiceData | null
}

const SOCKET_URL = '/?XTransformPort=3003'

export function useClientSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [state, setState] = useState<ClientState>({
    connected: false,
    registered: false,
    clientId: null,
    nearby: [],
    currentService: null,
  })

  useEffect(() => {
    const s = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = s

    s.on('connect', () => setState((p) => ({ ...p, connected: true })))
    s.on('disconnect', () => setState((p) => ({ ...p, connected: false })))

    s.on('client:registered', (data: { id: string }) => {
      setState((p) => ({ ...p, registered: true, clientId: data.id }))
    })

    s.on('providers:nearby', (providers: ProviderPublic[]) => {
      setState((p) => ({ ...p, nearby: providers }))
    })

    s.on('service:update', (svc: ServiceData) => {
      setState((p) => ({ ...p, currentService: svc }))
    })

    return () => {
      s.disconnect()
    }
  }, [])

  const register = useCallback((name: string) => {
    socketRef.current?.emit('client:register', { name })
  }, [])

  const requestService = useCallback(
    (payload: {
      clientName: string
      type: any
      description: string
      pickup: any
      pickupLabel: string
      destination: any
      destinationLabel: string
      paymentMethod: PaymentMethod
    }) => {
      socketRef.current?.emit('service:request', payload)
    },
    []
  )

  const cancelService = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:cancel', { serviceId })
  }, [])

  const rateService = useCallback(
    (serviceId: string, stars: number, comment: string) => {
      socketRef.current?.emit('service:rate', { serviceId, stars, comment })
    },
    []
  )

  // dismiss current service from view (after rating / for new request)
  const clearCurrent = useCallback(() => {
    setState((p) => ({ ...p, currentService: null }))
  }, [])

  return { ...state, register, requestService, cancelService, rateService, clearCurrent }
}

export function useProviderSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [state, setState] = useState<ProviderSession>({
    connected: false,
    registered: false,
    providerId: null,
    state: null,
    offer: null,
    currentService: null,
  })

  useEffect(() => {
    const s = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = s

    s.on('connect', () => setState((p) => ({ ...p, connected: true })))
    s.on('disconnect', () => setState((p) => ({ ...p, connected: false })))

    s.on('provider:registered', (data: { id: string }) => {
      setState((p) => ({ ...p, registered: true, providerId: data.id }))
    })

    s.on('provider:state', (st: ProviderState) => {
      setState((p) => ({ ...p, state: st }))
    })

    s.on('service:offer', (svc: ServiceData) => {
      setState((p) => ({ ...p, offer: svc }))
    })

    s.on('service:update', (svc: ServiceData) => {
      setState((p) => ({ ...p, currentService: svc, offer: svc.status === 'offered' ? svc : null }))
    })

    return () => {
      s.disconnect()
    }
  }, [])

  const register = useCallback(
    (data: { name: string; vehicle: string; plate: string }) => {
      socketRef.current?.emit('provider:register', data)
    },
    []
  )

  const toggleOnline = useCallback((online: boolean) => {
    socketRef.current?.emit('provider:toggle-online', { online })
  }, [])

  const accept = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:accept', { serviceId })
  }, [])

  const reject = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:reject', { serviceId })
  }, [])

  const arrived = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:arrived', { serviceId })
  }, [])

  const start = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:start', { serviceId })
  }, [])

  const complete = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:complete', { serviceId })
  }, [])

  const clearCurrent = useCallback(() => {
    setState((p) => ({ ...p, currentService: null, offer: null }))
  }, [])

  return { ...state, register, toggleOnline, accept, reject, arrived, start, complete, clearCurrent }
}
