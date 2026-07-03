'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { ServiceData } from '@/lib/rescue-types'

/**
 * Fires toast notifications on key service status transitions.
 * Uses the last-seen status ref to only fire on change.
 */
export function useServiceToasts(svc: ServiceData | null, perspective: 'client' | 'provider') {
  const lastStatus = useRef<string | null>(null)
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (!svc) {
      lastStatus.current = null
      lastId.current = null
      return
    }
    // reset tracking when service id changes
    if (lastId.current !== svc.id) {
      lastId.current = svc.id
      lastStatus.current = null
    }
    const prev = lastStatus.current
    const curr = svc.status
    if (prev === curr) return
    lastStatus.current = curr

    // Don't toast the initial state on first load
    if (prev === null) return

    const providerName = svc.provider?.name ?? 'Prestador'
    const clientName = svc.clientName

    const msg = (() => {
      if (perspective === 'client') {
        switch (curr) {
          case 'offered': return `Chamada enviada para ${providerName}`
          case 'accepted': return `${providerName} aceitou e está a caminho!`
          case 'arriving': return `${providerName} está chegando ao local`
          case 'arrived': return { msg: `${providerName} chegou ao local!`, type: 'success' as const }
          case 'in_progress': return 'Serviço em andamento — rumo ao destino'
          case 'completed': return { msg: 'Serviço concluído! Avalie o atendimento.', type: 'success' as const }
          case 'cancelled': return { msg: 'Solicitação cancelada', type: 'error' as const }
          case 'expired': return { msg: 'Nenhum prestador respondeu a tempo. Tente novamente.', type: 'error' as const }
        }
      } else {
        switch (curr) {
          case 'accepted': return 'Você aceitou a chamada — vá até o local'
          case 'arrived': return 'Você marcou como no local'
          case 'in_progress': return 'Serviço iniciado — leve ao destino'
          case 'completed': return { msg: `Serviço concluído! +R$ ${svc.price}`, type: 'success' as const }
          case 'cancelled': return { msg: `${clientName} cancelou a solicitação`, type: 'error' as const }
        }
      }
      return null
    })()

    if (!msg) return

    if (typeof msg === 'object') {
      if (msg.type === 'success') toast.success(msg.msg)
      else if (msg.type === 'error') toast.error(msg.msg)
    } else {
      toast(msg)
    }
  }, [svc?.status, svc?.id, perspective])
}
