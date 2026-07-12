'use client'

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'

export type ServiceHistoryItem = {
  id: string
  type: string
  typeLabel: string
  status: string
  statusLabel: string
  description: string
  pickupLabel: string
  destinationLabel: string
  distanceKm: number
  etaMin: number
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  paymentMethod: string
  paymentStatus: string
  createdAt: string
  acceptedAt: string | null
  completedAt: string | null
  providerName: string | null
  providerVehicle: string | null
  providerRating: number | null
  clientName: string | null
  clientRatingStars: number | null
  clientRatingComment: string | null
  providerRatingStars: number | null
  providerRatingComment: string | null
  loyaltyPoints: number
  latestPayment: {
    id: string
    status: string
    method: string
    amount: number
    paidAt: string | null
    failedAt: string | null
    failureReason: string | null
    createdAt: string
    providerPayout?: number
  } | null
  providerPayout?: number | null
}

export type ServiceHistoryDetail = ServiceHistoryItem & {
  timeline: Array<{ status: string; label: string; at: string }>
  breakdownText?: string[]
}

type HistoryState = {
  history: ServiceHistoryItem[]
  loading: boolean
  detail: ServiceHistoryDetail | null
  detailLoading: boolean
  fetchHistory: () => Promise<void>
  fetchDetail: (serviceId: string) => Promise<ServiceHistoryDetail | null>
  setDetail: Dispatch<SetStateAction<ServiceHistoryDetail | null>>
}

function useHistory(basePath: string, enabled = true): HistoryState {
  const [history, setHistory] = useState<ServiceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ServiceHistoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await fetch(basePath, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setHistory(Array.isArray(data?.services) ? data.services : [])
      }
    } catch (error) {
      console.error('[history] fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [basePath, enabled])

  const fetchDetail = useCallback(async (serviceId: string) => {
    if (!enabled) return null
    setDetailLoading(true)
    try {
      const res = await fetch(`${basePath}/${serviceId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setDetail(data)
        return data
      }
    } catch (error) {
      console.error('[history] detail error:', error)
    } finally {
      setDetailLoading(false)
    }
    return null
  }, [basePath, enabled])

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  return { history, loading, detail, detailLoading, fetchHistory, fetchDetail, setDetail }
}

export function useClientHistory(enabled = true) {
  return useHistory('/api/client/services', enabled)
}

export function useProviderHistory(enabled = true) {
  return useHistory('/api/provider/services', enabled)
}
