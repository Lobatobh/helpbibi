'use client'

import { useEffect, useState, useCallback } from 'react'

type AuthUser = {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN'
  clientProfile: { id: string } | null
  providerProfile: { id: string; vehicle: string; plate: string; isVerified: boolean; isAvailable: boolean } | null
  loyaltyAccount: { points: number; tier: string } | null
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Erro ao fazer login')
    }
    const data = await res.json()
    setUser(data)
    return data
  }, [])

  const registerClient = useCallback(async (data: { name: string; email: string; phone?: string; password: string }) => {
    const res = await fetch('/api/auth/register-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Erro ao cadastrar')
    }
    const user = await res.json()
    setUser(user)
    return user
  }, [])

  const registerProvider = useCallback(async (data: { name: string; email: string; phone?: string; password: string; vehicle: string; plate: string; city?: string }) => {
    const res = await fetch('/api/auth/register-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Erro ao cadastrar')
    }
    const user = await res.json()
    setUser(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    // Force a page reload to clear any cached state
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [])

  return { user, loading, login, registerClient, registerProvider, logout, refresh: fetchMe }
}
