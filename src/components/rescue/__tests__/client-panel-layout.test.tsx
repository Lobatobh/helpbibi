import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as clientPanel from '@/components/rescue/client-panel'
import type { ServiceData } from '@/lib/rescue-types'

const completedService: ServiceData = {
  id: 'svc_completed_layout',
  clientId: 'cli_ana',
  clientName: 'Ana Cliente',
  type: 'reboque',
  typeLabel: 'Reboque / Guincho',
  icon: 'tow-truck',
  description: 'Veiculo parado apos atendimento',
  pickup: { lat: -23.5614, lng: -46.6559 },
  pickupLabel: 'Av. Paulista, 1578',
  destination: { lat: -23.6075, lng: -46.666 },
  destinationLabel: 'Moema, Av. Ibirapuera 3100',
  price: 180,
  originalPrice: 200,
  discount: 20,
  promoCode: 'HELP10',
  distanceKm: 5.2,
  etaMin: 10,
  status: 'completed',
  paymentMethod: 'pix',
  providerId: 'prv_pedro',
  notifiedProviderIds: ['prv_pedro'],
  notifiedCount: 1,
  provider: {
    id: 'prv_pedro',
    name: 'Pedro Prestador',
    vehicle: 'Guincho Plataforma',
    plate: 'ABC1D23',
    rating: 4.8,
    position: { lat: -23.6075, lng: -46.666 },
    online: true,
    currentServiceId: null,
    completedCount: 42,
  },
  createdAt: Date.now() - 30 * 60 * 1000,
  acceptedAt: Date.now() - 25 * 60 * 1000,
  completedAt: Date.now(),
  timeline: [
    { status: 'completed', label: 'Atendimento concluido', at: Date.now() },
    { status: 'in_progress', label: 'Servico iniciado', at: Date.now() - 8 * 60 * 1000 },
    { status: 'arrived', label: 'Prestador chegou ao local', at: Date.now() - 12 * 60 * 1000 },
    { status: 'arriving', label: 'Prestador a caminho', at: Date.now() - 18 * 60 * 1000 },
    { status: 'accepted', label: 'Pedro aceitou a chamada', at: Date.now() - 24 * 60 * 1000 },
    { status: 'searching', label: 'Solicitacao criada', at: Date.now() - 30 * 60 * 1000 },
  ],
  rating: {
    stars: 5,
    comment: 'Atendimento rapido e organizado',
    at: Date.now(),
    from: 'client',
  },
  clientRating: {
    stars: 5,
    comment: 'Cliente acompanhou tudo pelo app',
    at: Date.now(),
    from: 'provider',
  },
  loyaltyPoints: 18,
}

describe('client panel layout after service completion', () => {
  test('renders completed service content and final CTA as non-overlapping vertical stacks', () => {
    const ClientServiceTracker = (
      clientPanel as unknown as {
        ClientServiceTracker?: (props: {
          svc: ServiceData
          onCancel: () => void
          onRate: (stars: number, comment: string) => void
          rated: boolean
          onNewRequest: () => void
          messages: unknown[]
          onSendChat: (text: string) => void
          chatOpen: boolean
          setChatOpen: (value: boolean) => void
          unreadChat: number
        }) => ReactElement
      }
    ).ClientServiceTracker

    expect(typeof ClientServiceTracker).toBe('function')

    const markup = renderToStaticMarkup(createElement(ClientServiceTracker!, {
      svc: completedService,
      onCancel: () => {},
      onRate: () => {},
      rated: true,
      onNewRequest: () => {},
      messages: [],
      onSendChat: () => {},
      chatOpen: false,
      setChatOpen: () => {},
      unreadChat: 0,
    }))

    expect(markup).toContain('data-layout="client-service-tracker"')
    expect(markup).toContain('data-layout="client-service-content"')
    expect(markup).toContain('data-layout="client-service-actions"')
    expect(markup).toContain('data-layout="client-timeline-scroll"')
    expect(markup).toContain('flex min-h-0 flex-col gap-3')
    expect(markup).toContain('shrink-0 space-y-2')
    expect(markup).toContain('h-32')
    expect(markup).not.toContain('sticky')
    expect(markup).not.toContain('fixed')
  })

  test('client panel body keeps the mockup scroll inside the phone viewport', () => {
    const source = readFileSync('src/components/rescue/client-panel.tsx', 'utf8')

    expect(source).toContain('className="min-h-0 flex-1 overflow-y-auto p-4 pb-6"')
    expect(source).toContain('<ClientServiceTracker')
  })
})
