// Help Bibi — Security Headers tests (FASE 26)
// Locks in the security header policy returned by next.config.ts -> headers().
import { describe, test, expect } from 'bun:test'
import nextConfig from '../../../next.config'

// Resolve the headers() promise/array. Next.js headers() can be sync (returns array)
// or async (returns Promise<array>). Normalize to an array of {key, value}.
async function resolveHeaders(): Promise<Array<{ key: string; value: string }>> {
  const result = await (nextConfig as any).headers()
  // Result is an array of { source, headers: [...] } entries.
  // We collect all headers across all entries.
  const all: Array<{ key: string; value: string }> = []
  for (const entry of result as any[]) {
    if (Array.isArray(entry.headers)) all.push(...entry.headers)
  }
  return all
}

describe('security-headers — required headers present', () => {
  test('1. X-Content-Type-Options is present and equals "nosniff"', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'X-Content-Type-Options')
    expect(h).toBeDefined()
    expect(h!.value).toBe('nosniff')
  })

  test('2. X-Frame-Options is present and equals "DENY"', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'X-Frame-Options')
    expect(h).toBeDefined()
    expect(h!.value).toBe('DENY')
  })

  test('3. Referrer-Policy is present', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'Referrer-Policy')
    expect(h).toBeDefined()
    expect(h!.value.length).toBeGreaterThan(0)
  })

  test('4. Permissions-Policy is present', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'Permissions-Policy')
    expect(h).toBeDefined()
    expect(h!.value.length).toBeGreaterThan(0)
  })

  test('5. Strict-Transport-Security is present (HSTS)', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'Strict-Transport-Security')
    expect(h).toBeDefined()
    expect(h!.value).toContain('max-age=')
    expect(h!.value).toContain('includeSubDomains')
  })

  test('6. Content-Security-Policy is present', async () => {
    const headers = await resolveHeaders()
    const h = headers.find((x) => x.key === 'Content-Security-Policy')
    expect(h).toBeDefined()
    expect(h!.value.length).toBeGreaterThan(0)
  })
})

describe('security-headers — CSP policy specifics', () => {
  test('7. CSP contains "frame-ancestors \'none\'"', async () => {
    const headers = await resolveHeaders()
    const csp = headers.find((x) => x.key === 'Content-Security-Policy')!.value
    expect(csp).toContain("frame-ancestors 'none'")
  })

  test('8. CSP contains "default-src \'self\'"', async () => {
    const headers = await resolveHeaders()
    const csp = headers.find((x) => x.key === 'Content-Security-Policy')!.value
    expect(csp).toContain("default-src 'self'")
  })
})
