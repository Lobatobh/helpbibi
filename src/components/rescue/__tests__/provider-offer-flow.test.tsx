import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProviderOfferCard } from '@/components/rescue/provider-panel'
import type { ServiceData } from '@/lib/rescue-types'
import * as rescueSocket from '@/hooks/use-rescue-socket'

const offer: ServiceData = {
  id: 'svc_demo_offer',
  clientId: 'cli_lucas',
  clientName: 'lucas',
  type: 'reboque',
  typeLabel: 'Reboque / Guincho',
  icon: 'tow-truck',
  description: 'Sem detalhes adicionais',
  pickup: { lat: -23.5614, lng: -46.6559 },
  pickupLabel: 'Av. Paulista, 1578',
  destination: { lat: -23.6075, lng: -46.666 },
  destinationLabel: 'Moema, Av. Ibirapuera 3100',
  price: 180,
  originalPrice: 180,
  discount: 0,
  promoCode: null,
  distanceKm: 5.2,
  etaMin: 10,
  status: 'offered',
  paymentMethod: 'pix',
  providerId: 'prv_pedro',
  notifiedProviderIds: ['prv_pedro'],
  notifiedCount: 1,
  provider: null,
  createdAt: Date.now(),
  acceptedAt: null,
  completedAt: null,
  timeline: [],
  rating: null,
  clientRating: null,
  loyaltyPoints: 0,
}

describe('provider offer flow', () => {
  test('provider socket acknowledges received offers for rescue-service logs', () => {
    const hook = readFileSync('src/hooks/use-rescue-socket.ts', 'utf8')

    expect(hook).toContain("s.on('service:offer'")
    expect(hook).toContain("s.emit('service:offer-received'")
  })

  test('provider offer card renders an incoming Reboque / Guincho call', () => {
    expect(typeof ProviderOfferCard).toBe('function')

    const markup = renderToStaticMarkup(createElement(ProviderOfferCard as (props: {
      offer: ServiceData
      onAccept: () => void
      onReject: () => void
      notifiedCount?: number
    }) => ReactElement, {
      offer,
      onAccept: () => {},
      onReject: () => {},
      notifiedCount: offer.notifiedCount,
    }))

    expect(markup).toContain('Nova chamada')
    expect(markup).toContain('Reboque / Guincho')
    expect(markup).toContain('lucas')
    expect(markup).toContain('Aceitar')
  })

  test('provider service update keeps pending offers out of current active service', () => {
    const reduceProviderServiceUpdate = (
      rescueSocket as unknown as {
        reduceProviderServiceUpdate?: (state: any, service: ServiceData) => any
      }
    ).reduceProviderServiceUpdate
    expect(typeof reduceProviderServiceUpdate).toBe('function')

    const next = reduceProviderServiceUpdate!({
      offer: null,
      currentService: null,
      offerTaken: null,
    }, offer)

    expect(next.offer?.id).toBe(offer.id)
    expect(next.currentService).toBeNull()
  })

  test('provider reject clears the pending offer and old current service', () => {
    const reduceProviderReject = (
      rescueSocket as unknown as {
        reduceProviderReject?: (state: any, serviceId: string) => any
      }
    ).reduceProviderReject
    expect(typeof reduceProviderReject).toBe('function')

    const next = reduceProviderReject!({
      offer,
      currentService: offer,
      offerTaken: null,
    }, offer.id)

    expect(next.offer).toBeNull()
    expect(next.currentService).toBeNull()
  })
})
