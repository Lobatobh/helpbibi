'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// useServiceHistory — fetches service history from DB API (FASE 21)
// Replaces localStorage-based history
// ============================================================

export type ServiceHistoryItem = {
  id: string
  type: string
  typeLabel: string
  icon: string
  status: string
  statusLabel: string
  pickupLabel: string
  destinationLabel: string
  distanceKm: number
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  paymentMethod: string
  paymentStatus: string
  pickupSource: string
  createdAt: number
  completedAt: number | null
  acceptedAt: number | null
  counterpartName: string | null
  counterpartRating: number | null
  ratingStars: number | null
  ratingComment: string | null
  clientRatingStars: number | null
  clientRatingComment: string | null
  trackingUrl: string | null
  providerPayout?: number
  platformFee?: number
}

export type ServiceHistoryDetail = ServiceHistoryItem & {
  description: string
  timeline: Array<{ status: string; label: string; at: number }>
  chat: Array<{ from: string; fromName: string; text: string; at: number }>
  priceBreakdown: string | null
  paymentDisplayStatus: string
  paidAt: number | null
  failedAt: number | null
  failureReason: string | null
  providerVehicle?: string | null
  providerPlate?: string | null
}

export function useClientHistory(dbUserId: string | null) {
  const [history, setHistory] = useState<ServiceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ServiceHistoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!dbUserId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/services?dbUserId=${dbUserId}`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch (e) {
      console.error('[history] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [dbUserId])

  const fetchDetail = useCallback(async (serviceId: string) => {
    if (!dbUserId) return null
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/client/services/${serviceId}?dbUserId=${dbUserId}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data)
        return data
      }
    } catch (e) {
      console.error('[history] detail error:', e)
    } finally {
      setDetailLoading(false)
    }
    return null
  }, [dbUserId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return { history, loading, detail, detailLoading, fetchHistory, fetchDetail, setDetail }
}

export function useProviderHistory(dbUserId: string | null) {
  const [history, setHistory] = useState<ServiceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ServiceHistoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!dbUserId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/provider/services?dbUserId=${dbUserId}`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch (e) {
      console.error('[history] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [dbUserId])

  const fetchDetail = useCallback(async (serviceId: string) => {
    if (!dbUserId) return null
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/provider/services/${serviceId}?dbUserId=${dbUserId}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data)
        return data
      }
    } catch (e) {
      console.error('[history] detail error:', e)
    } finally {
      setDetailLoading(false)
    }
    return null
  }, [dbUserId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return { history, loading, detail, detailLoading, fetchHistory, fetchDetail, setDetail }
}
