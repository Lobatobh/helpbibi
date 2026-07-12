'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { RESCUE_SOCKET_PATH, resolveRescueSocketUrl, rescueSocketStatusMessage } from '@/lib/rescue-socket-url'
import type { ChatMessage, PaymentMethod, ServiceData, ServiceType } from '@/lib/rescue-types'

type RequestPayload = {
  type: ServiceType
  description: string
  pickup: { lat: number; lng: number }
  pickupLabel: string
  destination: { lat: number; lng: number }
  destinationLabel: string
  paymentMethod: PaymentMethod
}

type ProviderRuntimeState = {
  id: string
  name: string
  vehicle: string
  plate: string
  online: boolean
  canOperate: boolean
  currentServiceId?: string | null
  approvalStatus?: string
}

function createAuthenticatedSocket() {
  return io(resolveRescueSocketUrl(), {
    path: RESCUE_SOCKET_PATH,
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
    withCredentials: true,
  })
}

export function useAuthenticatedClientSocket(initialService: ServiceData | null) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [service, setService] = useState<ServiceData | null>(initialService)
  const serviceIdRef = useRef<string | null>(initialService?.id || null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [submitting, setSubmitting] = useState(false)

  const refreshChat = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/chat`, { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    setMessages(Array.isArray(data.messages) ? data.messages : [])
  }, [])

  useEffect(() => {
    const socket = createAuthenticatedSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setConnectionError(null)
      socket.emit('auth:snapshot')
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => {
      setConnected(false)
      setConnectionError(rescueSocketStatusMessage({ connected: false, error: 'connect_error' }))
    })
    socket.on('auth:error', (payload: { message?: string }) => {
      setOperationError(payload?.message || 'Sessao invalida. Entre novamente.')
    })
    socket.on('auth:snapshot', (payload: { service?: ServiceData | null }) => {
      const nextService = payload?.service || null
      serviceIdRef.current = nextService?.id || null
      setService(nextService)
      if (nextService?.id) socket.emit('auth:chat:history', { serviceId: nextService.id })
      else setMessages([])
    })
    socket.on('auth:service:update', (payload: ServiceData) => {
      serviceIdRef.current = payload.id
      setService(payload)
      setSubmitting(false)
      setOperationError(null)
      socket.emit('auth:chat:history', { serviceId: payload.id })
    })
    socket.on('auth:chat:messages', (payload: { serviceId: string; messages?: ChatMessage[] }) => {
      if (payload?.serviceId === serviceIdRef.current) setMessages(Array.isArray(payload.messages) ? payload.messages : [])
    })
    socket.on('auth:chat:new', (message: ChatMessage) => {
      if (message.serviceId !== serviceIdRef.current) return
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
    })
    socket.on('auth:operation-error', (payload: { message?: string }) => {
      setSubmitting(false)
      setOperationError(payload?.message || 'Operacao nao concluida.')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const requestService = useCallback((payload: RequestPayload) => {
    setSubmitting(true)
    setOperationError(null)
    socketRef.current?.emit('auth:client:request', payload)
  }, [])

  const cancelService = useCallback((serviceId: string) => {
    setOperationError(null)
    socketRef.current?.emit('auth:service:cancel', { serviceId, reason: 'client_cancelled' })
  }, [])

  const refreshSnapshot = useCallback(async () => {
    const response = await fetch('/api/client/services/active', { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    const nextService = data.service || null
    serviceIdRef.current = nextService?.id || null
    setService(nextService)
    if (nextService?.id) await refreshChat(nextService.id)
    else setMessages([])
  }, [refreshChat])

  useEffect(() => {
    if (!service?.id) return
    const controller = new AbortController()
    fetch(`/api/services/${service.id}/chat`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) setMessages(Array.isArray(data.messages) ? data.messages : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [service?.id])

  const sendChat = useCallback((serviceId: string, text: string) => {
    setOperationError(null)
    socketRef.current?.emit('auth:chat:send', { serviceId, text })
  }, [])

  return {
    connected,
    connectionError,
    operationError,
    service,
    messages,
    submitting,
    requestService,
    cancelService,
    sendChat,
    refreshSnapshot,
    refreshChat,
  }
}

export function useAuthenticatedProviderSocket(initialService: ServiceData | null) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [state, setState] = useState<ProviderRuntimeState | null>(null)
  const [offer, setOffer] = useState<ServiceData | null>(null)
  const [service, setService] = useState<ServiceData | null>(initialService)
  const serviceIdRef = useRef<string | null>(initialService?.id || null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const refreshChat = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/chat`, { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    setMessages(Array.isArray(data.messages) ? data.messages : [])
  }, [])

  useEffect(() => {
    const socket = createAuthenticatedSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setConnectionError(null)
      socket.emit('auth:snapshot')
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => {
      setConnected(false)
      setConnectionError(rescueSocketStatusMessage({ connected: false, error: 'connect_error' }))
    })
    socket.on('auth:error', (payload: { message?: string }) => {
      setOperationError(payload?.message || 'Sessao invalida. Entre novamente.')
    })
    socket.on('auth:provider:state', (payload: ProviderRuntimeState) => setState(payload))
    socket.on('auth:snapshot', (payload: { service?: ServiceData | null; provider?: ProviderRuntimeState | null }) => {
      const nextService = payload?.service || null
      serviceIdRef.current = nextService?.id || null
      setService(nextService)
      if (payload?.provider) setState(payload.provider)
      if (nextService?.id) socket.emit('auth:chat:history', { serviceId: nextService.id })
      else setMessages([])
    })
    socket.on('auth:service:offer', (payload: ServiceData) => {
      setOffer(payload)
      setOperationError(null)
    })
    socket.on('auth:service:update', (payload: ServiceData) => {
      serviceIdRef.current = payload.id
      setService(payload)
      if (payload.status !== 'offered') setOffer((current) => current?.id === payload.id ? null : current)
      setOperationError(null)
      socket.emit('auth:chat:history', { serviceId: payload.id })
    })
    socket.on('auth:chat:messages', (payload: { serviceId: string; messages?: ChatMessage[] }) => {
      if (payload?.serviceId === serviceIdRef.current) setMessages(Array.isArray(payload.messages) ? payload.messages : [])
    })
    socket.on('auth:chat:new', (message: ChatMessage) => {
      if (message.serviceId !== serviceIdRef.current) return
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
    })
    socket.on('auth:offer-taken', (payload: { serviceId: string }) => {
      setOffer((current) => current?.id === payload.serviceId ? null : current)
    })
    socket.on('auth:operation-error', (payload: { message?: string }) => {
      setOperationError(payload?.message || 'Operacao nao concluida.')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const toggleOnline = useCallback((online: boolean) => {
    setOperationError(null)
    socketRef.current?.emit('auth:provider:toggle-online', { online })
  }, [])

  const accept = useCallback((serviceId: string) => {
    setOperationError(null)
    socketRef.current?.emit('auth:service:accept', { serviceId })
  }, [])

  const reject = useCallback((serviceId: string) => {
    setOperationError(null)
    socketRef.current?.emit('auth:service:reject', { serviceId, reason: 'provider_declined' })
    setOffer((current) => current?.id === serviceId ? null : current)
  }, [])

  const updateStatus = useCallback((event: 'arrived' | 'start' | 'complete', serviceId: string) => {
    setOperationError(null)
    socketRef.current?.emit(`auth:service:${event}`, { serviceId })
  }, [])

  const refreshSnapshot = useCallback(async () => {
    const response = await fetch('/api/provider/services/active', { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    const nextService = data.service || null
    serviceIdRef.current = nextService?.id || null
    setService(nextService)
    if (nextService?.id) await refreshChat(nextService.id)
    else setMessages([])
  }, [refreshChat])

  useEffect(() => {
    if (!service?.id) return
    const controller = new AbortController()
    fetch(`/api/services/${service.id}/chat`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) setMessages(Array.isArray(data.messages) ? data.messages : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [service?.id])

  const sendChat = useCallback((serviceId: string, text: string) => {
    setOperationError(null)
    socketRef.current?.emit('auth:chat:send', { serviceId, text })
  }, [])

  return {
    connected,
    connectionError,
    operationError,
    state,
    offer,
    service,
    messages,
    toggleOnline,
    accept,
    reject,
    updateStatus,
    sendChat,
    refreshSnapshot,
    refreshChat,
  }
}
