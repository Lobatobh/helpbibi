// Help Bibi — Gateway Factory tests (FASE 25.4)
import { describe, test, expect, beforeEach } from 'bun:test'
import { getActiveProvider, getPaymentGateway, isRealGatewayActive, mapToGatewayMethod } from '@/server/payments/gateways'
import { SimulatedGateway } from '@/server/payments/gateways/simulated-gateway'

describe('gateway factory — getActiveProvider', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_GATEWAY_PROVIDER
  })

  test('1. missing provider is rejected instead of assuming simulated', () => {
    expect(() => getActiveProvider()).toThrow('PAYMENT_GATEWAY_PROVIDER_REQUIRED')
  })

  test('2. mercado_pago from env', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    expect(getActiveProvider()).toBe('mercado_pago')
  })

  test('3. unsupported provider is rejected', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'unsupported_provider'
    expect(() => getActiveProvider()).toThrow('PAYMENT_GATEWAY_PROVIDER_UNSUPPORTED')
  })
})

describe('gateway factory — getPaymentGateway', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_GATEWAY_PROVIDER
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET
  })

  test('4. explicit simulated returns SimulatedGateway instance', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    const gw = getPaymentGateway()
    expect(gw).toBeInstanceOf(SimulatedGateway)
    expect(gw.provider).toBe('simulated')
  })

  test('5. mercado_pago throws without credentials', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    expect(() => getPaymentGateway()).toThrow(/MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/)
  })

  test('6. stripe throws "not implemented"', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'stripe'
    expect(() => getPaymentGateway()).toThrow(/not implemented/)
  })
})

describe('gateway factory — isRealGatewayActive', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_GATEWAY_PROVIDER
  })

  test('7. isRealGatewayActive returns false for simulated', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    expect(isRealGatewayActive()).toBe(false)
  })

  test('8. isRealGatewayActive returns true for mercado_pago', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    expect(isRealGatewayActive()).toBe(true)
  })
})

describe('gateway factory — mapToGatewayMethod', () => {
  test('9. mapToGatewayMethod maps valid methods and defaults to PIX', () => {
    expect(mapToGatewayMethod('pix')).toBe('PIX')
    expect(mapToGatewayMethod('PIX')).toBe('PIX')
    expect(mapToGatewayMethod('card')).toBe('CARD')
    expect(mapToGatewayMethod('CARD')).toBe('CARD')
    expect(mapToGatewayMethod('cash')).toBe('CASH')
    expect(mapToGatewayMethod('CASH')).toBe('CASH')
    // invalid → PIX
    expect(mapToGatewayMethod('invalid')).toBe('PIX')
    expect(mapToGatewayMethod('')).toBe('PIX')
    expect(mapToGatewayMethod('crypto')).toBe('PIX')
  })
})
