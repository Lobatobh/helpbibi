// Help Bibi — Secure Logger tests (FASE 26)
import { describe, test, expect } from 'bun:test'
import {
  logger, sanitizeValue, maskEmail, maskPhone, maskCard, SENSITIVE_KEYS,
} from '@/server/logger'

describe('logger — SENSITIVE_KEYS list', () => {
  test('1. SENSITIVE_KEYS contains all expected entries', () => {
    const required = ['password', 'secret', 'token', 'cookie', 'authorization', 'cvv', 'cardNumber']
    for (const k of required) {
      expect(SENSITIVE_KEYS).toContain(k)
    }
  })
})

describe('logger — maskEmail()', () => {
  test('2. masks the local part of an email, keeps the domain', () => {
    const masked = maskEmail('joao@example.com')
    expect(masked).toContain('@example.com')
    expect(masked).not.toBe('joao@example.com')
    // Should not contain the full original local part
    expect(masked.startsWith('joao@')).toBe(false)
  })

  test('3. maskEmail leaves strings without emails untouched', () => {
    expect(maskEmail('no email here')).toBe('no email here')
  })
})

describe('logger — maskPhone()', () => {
  test('4. masks phone digits but keeps first 2 and last 4', () => {
    const masked = maskPhone('1198765-4321')
    // Should keep area code prefix and last 4
    expect(masked).toContain('4321')
    // Should not contain the full original phone
    expect(masked).not.toBe('1198765-4321')
  })

  test('5. maskPhone does not mask short numeric strings (<8 digits)', () => {
    expect(maskPhone('123-456')).toBe('123-456')
  })
})

describe('logger — maskCard()', () => {
  test('6. masks card number (16 digits): keeps first 6 + last 4', () => {
    const card = '4111111111111111'
    const masked = maskCard(card)
    expect(masked).not.toBe(card)
    expect(masked.startsWith('411111')).toBe(true)
    expect(masked.endsWith('1111')).toBe(true)
    // The middle should be redacted (asterisks)
    expect(masked).toContain('*')
  })

  test('7. maskCard does not mask short numeric strings (<13 digits)', () => {
    expect(maskCard('123456789012')).toBe('123456789012')
  })
})

describe('logger — sanitizeValue() redaction', () => {
  test('8. redacts keys containing "password", "secret", "token", "cookie", "authorization", "cvv", "cardNumber"', () => {
    const input = {
      password: 'hunter2',
      apiSecret: 'shh',
      accessToken: 'abc',
      userCookie: 'nom',
      authorization: 'Bearer xyz',
      cvv: '123',
      cardNumber: '4111111111111111',
    }
    const out = sanitizeValue(input) as Record<string, unknown>
    expect(out.password).toBe('[redacted]')
    expect(out.apiSecret).toBe('[redacted]')
    expect(out.accessToken).toBe('[redacted]')
    expect(out.userCookie).toBe('[redacted]')
    expect(out.authorization).toBe('[redacted]')
    expect(out.cvv).toBe('[redacted]')
    expect(out.cardNumber).toBe('[redacted]')
  })

  test('9. redacts sensitive keys at any nesting depth', () => {
    const input = {
      user: {
        profile: {
          password: 'deep',
          name: 'João',
        },
      },
    }
    const out = sanitizeValue(input) as any
    expect(out.user.profile.password).toBe('[redacted]')
    expect(out.user.profile.name).toBe('João')
  })

  test('10. handles arrays — redacts sensitive keys inside array elements', () => {
    const input = [
      { name: 'A', token: 't1' },
      { name: 'B', token: 't2' },
    ]
    const out = sanitizeValue(input) as any[]
    expect(Array.isArray(out)).toBe(true)
    expect(out[0].name).toBe('A')
    expect(out[0].token).toBe('[redacted]')
    expect(out[1].token).toBe('[redacted]')
  })

  test('11. truncates very long strings (>500 chars) with a redaction marker', () => {
    const long = 'x'.repeat(600)
    const out = sanitizeValue(long) as string
    expect(out.length).toBeLessThan(long.length)
    expect(out).toContain('redacted')
  })

  test('12. masks emails/phones/cards inside string values', () => {
    const out = sanitizeValue('contact: joao@example.com, card: 4111111111111111') as string
    expect(out).not.toContain('joao@example.com')
    expect(out).not.toContain('4111111111111111')
  })
})

describe('logger — public API', () => {
  test('13. logger.info, warn, error, debug are all functions', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })
})
