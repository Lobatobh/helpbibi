'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { RESCUE_SOCKET_PATH, resolveRescueSocketUrl, rescueSocketStatusMessage } from '@/lib/rescue-socket-url'
import type {
  ProviderState, ProviderPublic, ServiceData, PaymentMethod,
  ChatMessage, PromoResult, LoyaltyInfo, LoyaltyReward, RedeemResult,
} from '@/lib/rescue-types'

type ClientState = {
  connected: boolean
  connectionError: string | null
  registered: boolean
  registering: boolean
  registrationError: string | null
  clientId: string | null
  nearby: ProviderPublic[]
  currentService: ServiceData | null
  messages: ChatMessage[]
  newMessage: ChatMessage | null
  promoResult: PromoResult | null
  loyalty: LoyaltyInfo | null
  rewards: LoyaltyReward[]
  redeemResult: RedeemResult | null
  paymentResult: { ok: boolean; outcome?: string; status?: string; paymentId?: string; amount?: number; method?: string; message?: string } | null
}

export type ProviderSession = {
  connected: boolean
  connectionError: string | null
  registered: boolean
  registering: boolean
  registrationError: string | null
  providerId: string | null
  state: ProviderState | null
  offer: ServiceData | null
  currentService: ServiceData | null
  messages: ChatMessage[]
  newMessage: ChatMessage | null
  offerTaken: { serviceId: string; acceptedBy: string | null; cancelled: boolean } | null
  operationError: string | null
}

const REGISTER_TIMEOUT_MS = 8000
const REGISTRATION_TIMEOUT_MESSAGE =
  'Não recebemos confirmação do serviço em tempo real. Tente novamente em alguns segundos.'
const PROVIDER_ACTIVE_SERVICE_STATUSES = new Set(['accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'cancelled'])
const PROVIDER_OPERATION_DENIED_MESSAGES: Record<string, string> = {
  provider_pending: 'Seu cadastro ainda esta em analise pelo ADM.',
  provider_rejected: 'Seu cadastro foi rejeitado pelo ADM.',
  provider_suspended: 'Seu cadastro esta suspenso pelo ADM.',
  provider_not_verified: 'Seu cadastro ainda nao foi aprovado para operar.',
  documents_not_approved: 'A documentacao do prestador ainda nao foi aprovada.',
  vehicle_not_approved: 'O veiculo ainda nao foi aprovado.',
  user_not_active: 'Sua conta esta inativa ou suspensa.',
}

function getProviderOperationDeniedMessage(reason?: string): string {
  return PROVIDER_OPERATION_DENIED_MESSAGES[reason || ''] || 'Prestador ainda nao autorizado para operar.'
}

function isPendingProviderService(service: ServiceData | null): boolean {
  return !!service && !PROVIDER_ACTIVE_SERVICE_STATUSES.has(service.status)
}

export function reduceProviderServiceUpdate(previous: ProviderSession, svc: ServiceData): ProviderSession {
  if (svc.status === 'offered') {
    return {
      ...previous,
      offer: svc,
      currentService: previous.currentService?.id === svc.id && !isPendingProviderService(previous.currentService)
        ? previous.currentService
        : null,
    }
  }

  if (isPendingProviderService(svc)) {
    return {
      ...previous,
      offer: previous.offer?.id === svc.id ? null : previous.offer,
      currentService: previous.currentService?.id === svc.id && isPendingProviderService(previous.currentService)
        ? null
        : previous.currentService,
    }
  }

  return {
    ...previous,
    currentService: svc,
    offer: previous.offer?.id === svc.id ? null : previous.offer,
  }
}

export function reduceProviderReject(previous: ProviderSession, serviceId: string): ProviderSession {
  return {
    ...previous,
    offer: previous.offer?.id === serviceId ? null : previous.offer,
    currentService: previous.currentService?.id === serviceId && isPendingProviderService(previous.currentService)
      ? null
      : previous.currentService,
    offerTaken: previous.offerTaken?.serviceId === serviceId ? null : previous.offerTaken,
  }
}

export function useClientSocket() {
  const socketRef = useRef<Socket | null>(null)
  const registerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<ClientState>({
    connected: false,
    connectionError: null,
    registered: false,
    registering: false,
    registrationError: null,
    clientId: null,
    nearby: [],
    currentService: null,
    messages: [],
    newMessage: null,
    promoResult: null,
    loyalty: null,
    rewards: [],
    redeemResult: null,
    paymentResult: null,
  })

  useEffect(() => {
    const s = io(resolveRescueSocketUrl(), {
      path: RESCUE_SOCKET_PATH,
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = s

    s.on('connect', () => setState((p) => ({ ...p, connected: true, connectionError: null })))
    s.on('disconnect', () => setState((p) => ({ ...p, connected: false })))
    s.on('connect_error', () => {
      setState((p) => ({
        ...p,
        connected: false,
        registering: false,
        connectionError: rescueSocketStatusMessage({ connected: false, error: 'connect_error' }),
      }))
    })

    s.on('client:registered', (data: { id: string }) => {
      if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
      setState((p) => ({
        ...p,
        registered: true,
        registering: false,
        registrationError: null,
        connectionError: null,
        clientId: data.id,
      }))
    })

    s.on('providers:nearby', (providers: ProviderPublic[]) => {
      setState((p) => ({ ...p, nearby: providers }))
    })

    s.on('service:update', (svc: ServiceData) => {
      setState((p) => ({ ...p, currentService: svc }))
    })

    s.on('chat:messages', (data: { serviceId: string; messages: ChatMessage[] }) => {
      setState((p) => ({ ...p, messages: data.messages }))
    })

    s.on('chat:new', (msg: ChatMessage) => {
      setState((p) => ({ ...p, newMessage: msg, messages: [...p.messages, msg] }))
    })

    s.on('promo:result', (result: PromoResult) => {
      setState((p) => ({ ...p, promoResult: result }))
    })

    s.on('client:loyalty', (loyalty: LoyaltyInfo) => {
      setState((p) => ({ ...p, loyalty }))
    })

    s.on('loyalty:rewards', (rewards: LoyaltyReward[]) => {
      setState((p) => ({ ...p, rewards }))
    })

    s.on('loyalty:redeem-result', (result: RedeemResult) => {
      setState((p) => ({ ...p, redeemResult: result }))
    })

    s.on('payment:result', (result: { ok: boolean; outcome?: string; status?: string; paymentId?: string; amount?: number; method?: string; message?: string }) => {
      setState((p) => ({ ...p, paymentResult: result }))
    })

    return () => {
      if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
      s.disconnect()
    }
  }, [])

  const register = useCallback((name: string) => {
    const socket = socketRef.current
    if (!socket?.connected) {
      setState((p) => ({
        ...p,
        registering: false,
        connectionError: rescueSocketStatusMessage({ connected: false, error: 'disconnected' }),
      }))
      return
    }

    if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
    setState((p) => ({ ...p, registering: true, registrationError: null }))
    socket.emit('client:register', { name })
    registerTimerRef.current = setTimeout(() => {
      setState((p) => (
        p.registered
          ? p
          : { ...p, registering: false, registrationError: REGISTRATION_TIMEOUT_MESSAGE }
      ))
    }, REGISTER_TIMEOUT_MS)
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
      promoCode?: string | null
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

  const validatePromo = useCallback((code: string, type: any, distanceKm: number) => {
    socketRef.current?.emit('promo:validate', { code, type, distanceKm })
  }, [])

  const clearPromo = useCallback(() => {
    setState((p) => ({ ...p, promoResult: null }))
  }, [])

  const sendChat = useCallback((serviceId: string, text: string) => {
    socketRef.current?.emit('chat:send', { serviceId, text })
  }, [])

  const clearNewMessage = useCallback(() => {
    setState((p) => ({ ...p, newMessage: null }))
  }, [])

  const redeemReward = useCallback((rewardId: string) => {
    socketRef.current?.emit('loyalty:redeem', { rewardId })
  }, [])

  const clearRedeemResult = useCallback(() => {
    setState((p) => ({ ...p, redeemResult: null }))
  }, [])

  const simulatePayment = useCallback((serviceId: string, outcome: 'success' | 'failure') => {
    socketRef.current?.emit('payment:simulate', { serviceId, outcome })
  }, [])

  const clearPaymentResult = useCallback(() => {
    setState((p) => ({ ...p, paymentResult: null }))
  }, [])

  const clearCurrent = useCallback(() => {
    setState((p) => ({ ...p, currentService: null, messages: [], newMessage: null, promoResult: null, redeemResult: null }))
  }, [])

  return {
    ...state,
    register, requestService, cancelService, rateService,
    validatePromo, clearPromo, sendChat, clearNewMessage,
    redeemReward, clearRedeemResult, clearCurrent,
    simulatePayment, clearPaymentResult,
  }
}

export function useProviderSocket() {
  const socketRef = useRef<Socket | null>(null)
  const registerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<ProviderSession>({
    connected: false,
    connectionError: null,
    registered: false,
    registering: false,
    registrationError: null,
    providerId: null,
    state: null,
    offer: null,
    currentService: null,
    messages: [],
    newMessage: null,
    offerTaken: null,
    operationError: null,
  })

  useEffect(() => {
    const s = io(resolveRescueSocketUrl(), {
      path: RESCUE_SOCKET_PATH,
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = s

    s.on('connect', () => setState((p) => ({ ...p, connected: true, connectionError: null })))
    s.on('disconnect', () => setState((p) => ({ ...p, connected: false })))
    s.on('connect_error', () => {
      setState((p) => ({
        ...p,
        connected: false,
        registering: false,
        connectionError: rescueSocketStatusMessage({ connected: false, error: 'connect_error' }),
      }))
    })

    s.on('provider:registered', (data: { id: string }) => {
      if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
      setState((p) => ({
        ...p,
        registered: true,
        registering: false,
        registrationError: null,
        connectionError: null,
        providerId: data.id,
      }))
    })

    s.on('provider:state', (st: ProviderState) => {
      setState((p) => ({ ...p, state: st }))
    })

    s.on('provider:online-denied', (data: { reason?: string }) => {
      setState((p) => ({
        ...p,
        operationError: getProviderOperationDeniedMessage(data?.reason),
        state: p.state ? { ...p.state, online: false, canOperate: false } : p.state,
      }))
    })

    s.on('service:offer', (svc: ServiceData) => {
      setState((p) => reduceProviderServiceUpdate(p, svc))
      s.emit('service:offer-received', { serviceId: svc.id })
    })

    s.on('service:update', (svc: ServiceData) => {
      setState((p) => reduceProviderServiceUpdate(p, svc))
    })

    s.on('chat:messages', (data: { serviceId: string; messages: ChatMessage[] }) => {
      setState((p) => ({ ...p, messages: data.messages }))
    })

    s.on('chat:new', (msg: ChatMessage) => {
      setState((p) => ({ ...p, newMessage: msg, messages: [...p.messages, msg] }))
    })

    s.on('service:offer-taken', (data: { serviceId: string; acceptedBy: string | null; cancelled: boolean }) => {
      setState((p) => ({ ...reduceProviderReject(p, data.serviceId), offerTaken: data }))
    })

    return () => {
      if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
      s.disconnect()
    }
  }, [])

  const register = useCallback(
    (data: { name: string; vehicle: string; plate: string }) => {
      const socket = socketRef.current
      if (!socket?.connected) {
        setState((p) => ({
          ...p,
          registering: false,
          connectionError: rescueSocketStatusMessage({ connected: false, error: 'disconnected' }),
        }))
        return
      }

      if (registerTimerRef.current) clearTimeout(registerTimerRef.current)
      setState((p) => ({ ...p, registering: true, registrationError: null }))
      socket.emit('provider:register', data)
      registerTimerRef.current = setTimeout(() => {
        setState((p) => (
          p.registered
            ? p
            : { ...p, registering: false, registrationError: REGISTRATION_TIMEOUT_MESSAGE }
        ))
      }, REGISTER_TIMEOUT_MS)
    },
    []
  )

  const toggleOnline = useCallback((online: boolean) => {
    setState((p) => ({ ...p, operationError: null }))
    socketRef.current?.emit('provider:toggle-online', { online })
  }, [])

  const accept = useCallback((serviceId: string) => {
    socketRef.current?.emit('service:accept', { serviceId })
  }, [])

  const reject = useCallback((serviceId: string) => {
    setState((p) => reduceProviderReject(p, serviceId))
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

  const rateClient = useCallback(
    (serviceId: string, stars: number, comment: string) => {
      socketRef.current?.emit('service:rate-client', { serviceId, stars, comment })
    },
    []
  )

  const sendChat = useCallback((serviceId: string, text: string) => {
    socketRef.current?.emit('chat:send', { serviceId, text })
  }, [])

  const clearNewMessage = useCallback(() => {
    setState((p) => ({ ...p, newMessage: null }))
  }, [])

  const clearOfferTaken = useCallback(() => {
    setState((p) => ({ ...p, offerTaken: null }))
  }, [])

  const clearCurrent = useCallback(() => {
    setState((p) => ({ ...p, currentService: null, offer: null, messages: [], newMessage: null, offerTaken: null }))
  }, [])

  return {
    ...state,
    register, toggleOnline, accept, reject, arrived, start, complete, rateClient,
    sendChat, clearNewMessage, clearOfferTaken, clearCurrent,
  }
}
