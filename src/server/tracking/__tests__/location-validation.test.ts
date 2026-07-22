import { describe, expect, test } from 'bun:test'
import { isValidOperationalLocation } from '../location-validation'

describe('F35-09B operational coordinate validation', () => {
  test('accepts finite coordinates inside geographic bounds', () => {
    expect(isValidOperationalLocation({ lat: -23.55, lng: -46.63 })).toBe(true)
    expect(isValidOperationalLocation({ lat: -90, lng: 180 })).toBe(true)
  })

  test('rejects missing, non-finite and out-of-range coordinates', () => {
    for (const value of [
      null,
      {},
      { lat: NaN, lng: -46 },
      { lat: Infinity, lng: -46 },
      { lat: 91, lng: 0 },
      { lat: 0, lng: -181 },
      { lat: '-23.55', lng: -46.63 },
    ]) {
      expect(isValidOperationalLocation(value)).toBe(false)
    }
  })
})
