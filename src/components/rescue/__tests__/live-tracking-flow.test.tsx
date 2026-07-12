import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import type { ProviderState } from '@/lib/rescue-types'
import * as providerPanel from '@/components/rescue/provider-panel'
import * as tripProgress from '@/components/rescue/trip-progress-bar'

const activeProvider: ProviderState = {
  id: 'prv_pedro',
  name: 'Pedro',
  vehicle: 'Guincho Plataforma',
  plate: 'ABC1D23',
  rating: 4.8,
  position: { lat: -23.555, lng: -46.64 },
  online: false,
  currentServiceId: 'svc_live',
  completedCount: 0,
}

describe('live provider tracking flow', () => {
  test('provider in an active service is shown as in service, not offline', () => {
    const getProviderAvailability = (
      providerPanel as unknown as {
        getProviderAvailability?: (provider: ProviderState | null) => { label: string; switchChecked: boolean }
      }
    ).getProviderAvailability

    expect(typeof getProviderAvailability).toBe('function')

    const status = getProviderAvailability!(activeProvider)

    expect(status.label).toBe('Em atendimento')
    expect(status.switchChecked).toBe(true)
  })

  test('trip progress is derived from current position, never 100 percent while distance remains', () => {
    const calculateTripProgress = (
      tripProgress as unknown as {
        calculateTripProgress?: (provider: ProviderState, nowMs: number) => { progress: number; remainingKm: number; etaSec: number }
      }
    ).calculateTripProgress

    expect(typeof calculateTripProgress).toBe('function')

    const nowMs = Date.now()
    const provider: ProviderState = {
      ...activeProvider,
      online: true,
      position: { lat: -23.555, lng: -46.64 },
      tripStartPos: { lat: -23.55, lng: -46.633 },
      tripTarget: { lat: -23.5614, lng: -46.6559 },
      tripStartedAt: nowMs - 10 * 60 * 1000,
      tripTotalKm: 2.65,
    }

    const progress = calculateTripProgress!(provider, nowMs)

    expect(progress.remainingKm).toBeGreaterThan(0.1)
    expect(progress.progress).toBeGreaterThanOrEqual(0)
    expect(progress.progress).toBeLessThan(100)
    expect(progress.etaSec).toBeGreaterThan(0)
  })

  test('rescue-service keeps provider operational and forwards movement to the service client', () => {
    const service = readFileSync('mini-services/rescue-service/index.ts', 'utf8')

    expect(service).toContain('function emitLiveTrackingUpdate')
    expect(service).toContain('const blockReason = getProviderOperationBlockReason(winner)')
    expect(service).toContain("io.to(winner.socketId).emit('provider:online-denied'")
    expect(service).toContain('winner.online = true')
    expect(service).toContain('emitLiveTrackingUpdate(svc, p)')
    expect(service).toContain('[tracking] update emitted')
  })
})
