import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { acceptCurrentConsents, hasCurrentConsentType } from '../consent-service'
import { CURRENT_CONSENT_VERSIONS, requiredConsentTypesForRole } from '../consent-versions'

function fakeConsentDb() {
  const records: any[] = []
  return {
    records,
    db: {
      consentRecord: {
        findUnique: async ({ where }: any) => records.find((record) =>
          record.userId === where.userId_type_version.userId &&
          record.type === where.userId_type_version.type &&
          record.version === where.userId_type_version.version,
        ) || null,
        create: async ({ data }: any) => {
          const record = {
            id: `consent-${records.length + 1}`,
            acceptedAt: new Date('2026-07-22T12:00:00.000Z'),
            revokedAt: null,
            ...data,
          }
          records.push(record)
          return record
        },
        update: async ({ where, data }: any) => {
          const record = records.find((item) => item.id === where.id)
          Object.assign(record, data)
          return record
        },
      },
    } as any,
  }
}

describe('F35-09B LOCATION consent', () => {
  test('LOCATION is not accepted during CLIENT or PROVIDER registration', () => {
    expect(requiredConsentTypesForRole('CLIENT')).not.toContain('LOCATION')
    expect(requiredConsentTypesForRole('PROVIDER')).not.toContain('LOCATION')
  })

  test('server chooses the LOCATION version and repeated acceptance is idempotent', async () => {
    const { db, records } = fakeConsentDb()
    await acceptCurrentConsents('user-1', 'CLIENT', ['LOCATION'], db)
    await acceptCurrentConsents('user-1', 'CLIENT', ['LOCATION'], db)
    expect(records).toHaveLength(1)
    expect(records[0].version).toBe(CURRENT_CONSENT_VERSIONS.LOCATION)
    expect(await hasCurrentConsentType('user-1', 'LOCATION', db)).toBe(true)
  })

  test('frontend cannot send a LOCATION version or acceptance timestamp', () => {
    const route = readFileSync('src/app/api/consents/accept/route.ts', 'utf8')
    expect(route).toContain("'version'")
    expect(route).toContain("'acceptedAt'")
    expect(route).toContain('acceptCurrentConsents(user.id, user.role, body?.types')
  })
})
