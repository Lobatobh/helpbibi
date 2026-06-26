'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  ProviderState, ProviderPublic, ServiceData, PaymentMethod,
  ChatMessage, PromoResult, LoyaltyInfo, LoyaltyReward, RedeemResult,
} from '@/lib/rescue-types'

type ClientState = {
  connected: boolean
  registered: boolean
  clientId: string | null
  nearby: ProviderPublic[]
  currentService: ServiceData | null
  messages: ChatMessage[]
  newMessage: ChatMessage | null
  promoResult: PromoResult | null
  loyalty: LoyaltyInfo | null
  rewards: LoyaltyReward[]
  redeemResult: RedeemResult | null
}

type ProviderSession = {
  connected: boolean
  registered: boolean
  providerId: string | null
  state: ProviderState | null
  offer: ServiceData | null
  currentService: ServiceData | null
  messages: ChatMessage[]
  newMessage: ChatMessage | null
  offerTaken: { serviceId: string; acceptedBy: string | null; cancelled: boolean } | null
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
    messages: [],
    newMessage: null,
    promoResult: null,
    loyalty: null,
    rewards: [],
    redeemResult: null,
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

  const clearCurrent = useCallback(() => {
    setState((p) => ({ ...p, currentService: null, messages: [], newMessage: null, promoResult: null, redeemResult: null }))
  }, [])

  return {
    ...state,
    register, requestService, cancelService, rateService,
    validatePromo, clearPromo, sendChat, clearNewMessage,
    redeemReward, clearRedeemResult, clearCurrent,
  }
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
    messages: [],
    newMessage: null,
    offerTaken: null,
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

    s.on('chat:messages', (data: { serviceId: string; messages: ChatMessage[] }) => {
      setState((p) => ({ ...p, messages: data.messages }))
    })

    s.on('chat:new', (msg: ChatMessage) => {
      setState((p) => ({ ...p, newMessage: msg, messages: [...p.messages, msg] }))
    })

    s.on('service:offer-taken', (data: { serviceId: string; acceptedBy: string | null; cancelled: boolean }) => {
      setState((p) => ({ ...p, offerTaken: data, offer: null }))
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
    register, toggleOnline, accept, reject, arrived, start, complete,
    sendChat, clearNewMessage, clearOfferTaken, clearCurrent,
  }
}
