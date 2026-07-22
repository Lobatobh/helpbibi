'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  isReal: boolean
}

const initialState: GeoState = {
  coords: null,
  status: 'idle',
  error: null,
  isReal: false,
}

function validBrowserCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function geolocationError(error: GeolocationPositionError, continuous: boolean): GeoState {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      ...initialState,
      status: 'denied',
      error: continuous
        ? 'Permissao de localizacao negada. Sua presenca operacional foi removida.'
        : 'Permissao de localizacao negada. Autorize o GPS para criar uma solicitacao operacional.',
    }
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return { ...initialState, status: 'unavailable', error: 'GPS indisponivel. Verifique se esta ativado.' }
  }
  return {
    ...initialState,
    status: 'error',
    error: error.code === error.TIMEOUT
      ? 'Tempo esgotado ao obter localizacao. Tente novamente.'
      : 'Erro ao obter localizacao.',
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>(initialState)

  const requestPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ ...initialState, status: 'unavailable', error: 'Geolocalizacao nao disponivel neste dispositivo.' })
      return
    }

    setState((current) => ({ ...current, coords: null, status: 'locating', error: null, isReal: false }))
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        if (!validBrowserCoords(lat, lng)) {
          setState({ ...initialState, status: 'error', error: 'O navegador retornou uma localizacao invalida.' })
          return
        }
        setState({
          coords: { lat, lng, accuracy: position.coords.accuracy },
          status: 'located',
          error: null,
          isReal: true,
        })
      },
      (error) => setState(geolocationError(error, false)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }, [])

  const reset = useCallback(() => setState(initialState), [])
  return { ...state, requestPosition, reset }
}

export function useGeolocationWatch(throttleMs: number = 4000) {
  const [state, setState] = useState<GeoState>(initialState)
  const watchIdRef = useRef<number | null>(null)
  const lastEmitRef = useRef(0)
  const onPositionRef = useRef<((coords: GeoCoords) => void) | null>(null)

  const onPosition = useCallback((callback: (coords: GeoCoords) => void) => {
    onPositionRef.current = callback
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
    lastEmitRef.current = 0
    setState(initialState)
  }, [])

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ ...initialState, status: 'unavailable', error: 'Geolocalizacao nao disponivel neste dispositivo.' })
      return
    }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)

    setState({ ...initialState, status: 'locating' })
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        if (!validBrowserCoords(lat, lng)) {
          setState({ ...initialState, status: 'error', error: 'O navegador retornou uma localizacao invalida.' })
          return
        }

        const now = Date.now()
        const coords = { lat, lng, accuracy: position.coords.accuracy }
        setState({ coords, status: 'located', error: null, isReal: true })
        if (now - lastEmitRef.current >= throttleMs) {
          lastEmitRef.current = now
          onPositionRef.current?.(coords)
        }
      },
      (error) => {
        setState(geolocationError(error, true))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  }, [throttleMs])

  useEffect(() => () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
  }, [])

  return { ...state, startWatch, stopWatch, onPosition }
}
