import { describe, expect, test } from 'bun:test'
import {
  runPreflightDataAudit,
  type PreflightDataAuditStore,
  type PreflightDataSnapshot,
} from '../preflight-data-audit'

function snapshot(overrides: Partial<PreflightDataSnapshot> = {}): PreflightDataSnapshot {
  return {
    duplicateEmails: [],
    usersWithoutPasswordHash: 0,
    duplicatePayments: [],
    providerApprovals: [],
    missingCurrentConsents: [],
    legacyTrackingWithoutExpiry: 0,
    legacyTrackingWithoutActiveKey: 0,
    duplicateActiveTrackingLinks: 0,
    schemaGaps: [],
    ...overrides,
  }
}

function fakeStore(data: PreflightDataSnapshot) {
  let reads = 0
  const store: PreflightDataAuditStore = {
    inspect: async () => {
      reads += 1
      return structuredClone(data)
    },
  }
  return { store, reads: () => reads }
}

describe('preflight data audit', () => {
  test('reports legacy blockers and warnings without exposing sensitive values', async () => {
    const fake = fakeStore(snapshot({
      duplicateEmails: [{ normalizedEmail: 'owner@example.invalid', count: 2 }],
      usersWithoutPasswordHash: 3,
      duplicatePayments: [{ count: 2 }],
      providerApprovals: [{ status: 'PENDING', count: 4 }],
      missingCurrentConsents: [{ role: 'CLIENT', type: 'TERMS', count: 5 }],
      legacyTrackingWithoutExpiry: 6,
      legacyTrackingWithoutActiveKey: 6,
      duplicateActiveTrackingLinks: 2,
      schemaGaps: ['TrackingShare.activeKey'],
    }))

    const result = await runPreflightDataAudit(fake.store, new Date('2026-07-22T12:00:00.000Z'))
    const output = JSON.stringify(result)

    expect(result.ok).toBe(false)
    expect(result.blockers.map((finding) => finding.code)).toEqual([
      'DUPLICATE_NORMALIZED_EMAILS',
      'USERS_WITHOUT_PASSWORD_HASH',
      'DUPLICATE_PAYMENT_RECORDS',
      'DUPLICATE_ACTIVE_TRACKING_LINKS',
    ])
    expect(result.warnings.map((finding) => finding.code)).toEqual([
      'PROVIDERS_REQUIRE_APPROVAL_REVIEW',
      'USERS_MISSING_CURRENT_CONSENTS',
      'LEGACY_TRACKING_LINKS_UNAVAILABLE',
      'LEGACY_SCHEMA_GAP',
    ])
    expect(result.blockers[0].samples).toEqual(['o***@example.invalid'])
    expect(output).not.toContain('owner@example.invalid')
    expect(output).not.toContain('passwordHash')
    expect(output).not.toContain('tracking-token')
    expect(output).not.toContain('secret-value')
    expect(fake.reads()).toBe(1)
  })

  test('returns a clean result when no blocker exists', async () => {
    const result = await runPreflightDataAudit(
      fakeStore(snapshot({ providerApprovals: [{ status: 'APPROVED', count: 2 }] })).store,
      new Date('2026-07-22T12:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings).toEqual([])
  })

  test('runtime module is import-safe and contains no data mutation calls', async () => {
    const source = await Bun.file('scripts/preflight-data-audit.ts').text()

    expect(source).toContain('if (import.meta.main)')
    expect(source).toContain('process.exitCode = 2')
    expect(source).not.toMatch(/\.(create|update|delete|upsert|executeRaw)(?:Unsafe)?\s*\(/)
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE TABLE|TRUNCATE)\b/)
  })
})
