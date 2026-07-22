import { describe, expect, test } from 'bun:test'
import { POST } from '@/app/api/payments/webhook/route'

describe('generic payment webhook retirement', () => {
  test('returns a controlled 410 without processing a payload', async () => {
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(410)
    expect(body).toEqual({
      ok: false,
      code: 'GENERIC_PAYMENT_WEBHOOK_RETIRED',
      message: 'Generic payment webhook retired. Use the explicitly configured provider endpoint.',
    })
  })

  test('does not delegate to repository or gateway webhook processing', async () => {
    const routeSource = await Bun.file('src/app/api/payments/webhook/route.ts').text()
    const repositorySource = await Bun.file('src/server/repositories/payment.repository.ts').text()

    expect(routeSource).not.toContain('processWebhook')
    expect(routeSource).not.toContain('req.text')
    expect(routeSource).not.toContain('paymentEvent')
    expect(repositorySource).not.toContain('export async function processWebhook')
  })
})
