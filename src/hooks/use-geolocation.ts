'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ============================================================
// Geolocation types
// ============================================================

export type GeoCoords = {
  lat: number
  lng: number
  accuracy?: number
}

export type GeoStatus = 'idle' | 'locating' | 'located' | 'denied' | 'unavailable' | 'error'

export type GeoState = {
  coords: GeoCoords | null
  status: GeoStatus
  error: string | null
  isReal: boolean // true if from device GPS, false if fallback/demo
}

// ============================================================
// useGeolocation — one-shot position capture
// ============================================================

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    coords: null,
    status: 'idle',
    error: null,
    isReal: false,
  })

  const requestPosition = useCallback(() => {
    // FASE 20.3: Dev-only GPS mock — QA tool, NOT for production
    // Only active when NODE_ENV !== 'production' AND window.__MOCK_GPS__ is set
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && (window as any).__MOCK_GPS__) {
      const mock = (window as any).__MOCK_GPS__
      setState({
        coords: { lat: mock.lat, lng: mock.lng, accuracy: mock.accuracy || 15 },
        status: 'located',
        error: null,
        isReal: true,
      })
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        coords: null,
        status: 'unavailable',
        error: 'Geolocalização não disponível neste dispositivo.',
        isReal: false,
      })
      return
    }

    setState((prev) => ({ ...prev, status: 'locating', error: null }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
          status: 'located',
          error: null,
          isReal: true,
        })
      },
      (err) => {
        let status: GeoStatus = 'error'
        let message = 'Erro ao obter localização.'
        if (err.code === err.PERMISSION_DENIED) {
          status = 'denied'
          message = 'Permissão de localização negada. Você pode usar locais da demo.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          status = 'unavailable'
          message = 'GPS indisponível. Verifique se está ativado.'
        } else if (err.code === err.TIMEOUT) {
          status = 'error'
          message = 'Tempo esgotado ao obter localização. Tente novamente.'
        }
        setState({
          coords: null,
          status,
          error: message,
          isReal: false,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    )
  }, [])

  const reset = useCallback(() => {
    setState({
      coords: null,
      status: 'idle',
      error: null,
      isReal: false,
    })
  }, [])

  return { ...state, requestPosition, reset }
}

// ============================================================
// useGeolocationWatch — continuous position tracking
// Used by the provider panel to send real-time position updates.
// Updates at most every `throttleMs` milliseconds to avoid spamming.
// ============================================================

export function useGeolocationWatch(throttleMs: number = 4000) {
  const [state, setState] = useState<GeoState>({
    coords: null,
    status: 'idle',
    error: null,
    isReal: false,
  })
  const watchIdRef = useRef<number | null>(null)
  const lastEmitRef = useRef<number>(0)
  const onPositionRef = useRef<((coords: GeoCoords) => void) | null>(null)

  // Set callback for position updates
  const onPosition = useCallback((cb: (coords: GeoCoords) => void) => {
    onPositionRef.current = cb
  }, [])

  const startWatch = useCallback(() => {
    // FASE 20.3: Dev-only GPS mock — QA tool, NOT for production
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && (window as any).__MOCK_GPS__) {
      const mock = (window as any).__MOCK_GPS__
      const coords: GeoCoords = { lat: mock.lat, lng: mock.lng, accuracy: mock.accuracy || 15 }
      setState({
        coords,
        status: 'located',
        error: null,
        isReal: true,
      })
      // Simulate periodic updates
      const intervalId = setInterval(() => {
        const now = Date.now()
        if (now - lastEmitRef.current >= throttleMs) {
          lastEmitRef.current = now
          if (onPositionRef.current) {
            onPositionRef.current(coords)
          }
        }
      }, throttleMs)
      watchIdRef.current = intervalId as any
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        coords: null,
        status: 'unavailable',
        error: 'Geolocalização não disponível neste dispositivo.',
        isReal: false,
      })
      return
    }

    // Stop existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    setState((prev) => ({ ...prev, status: 'locating', error: null }))

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        const coords: GeoCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }

        // Throttle: only emit if enough time has passed
        if (now - lastEmitRef.current >= throttleMs) {
          lastEmitRef.current = now
          setState({
            coords,
            status: 'located',
            error: null,
            isReal: true,
          })
          // Call the registered callback
          if (onPositionRef.current) {
            onPositionRef.current(coords)
          }
        }
      },
      (err) => {
        let status: GeoStatus = 'error'
        let message = 'Erro ao rastrear localização.'
        if (err.code === err.PERMISSION_DENIED) {
          status = 'denied'
          message = 'Permissão de localização negada. Usando localização demo.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          status = 'unavailable'
          message = 'GPS indisponível.'
        }
        setState({
          coords: null,
          status,
          error: message,
          isReal: false,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    )
  }, [throttleMs])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      // Clear either interval (mock) or watchPosition (real)
      clearInterval(watchIdRef.current as any)
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      watchIdRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  return { ...state, startWatch, stopWatch, onPosition }
}
