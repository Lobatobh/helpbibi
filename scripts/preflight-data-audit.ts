import {
  CURRENT_CONSENT_VERSIONS,
  type ConsentTypeName,
} from '../src/server/consents/consent-versions'

export type DuplicateEmailGroup = { normalizedEmail: string; count: number }
export type DuplicatePaymentGroup = { count: number }
export type ProviderApprovalGroup = { status: string; count: number }
export type ConsentGapGroup = { role: string; type: ConsentTypeName; count: number }

export type PreflightDataSnapshot = {
  duplicateEmails: DuplicateEmailGroup[]
  usersWithoutPasswordHash: number
  duplicatePayments: DuplicatePaymentGroup[]
  providerApprovals: ProviderApprovalGroup[]
  missingCurrentConsents: ConsentGapGroup[]
  legacyTrackingWithoutExpiry: number
  legacyTrackingWithoutActiveKey: number
  duplicateActiveTrackingLinks: number
  schemaGaps: string[]
}

export interface PreflightDataAuditStore {
  inspect(): Promise<PreflightDataSnapshot>
}

export type PreflightFinding = {
  code: string
  severity: 'blocker' | 'warning'
  count: number
  samples?: string[]
  detail: string
}

export type PreflightDataAuditResult = {
  ok: boolean
  code: 'PREFLIGHT_DATA_AUDIT_COMPLETE'
  blockers: PreflightFinding[]
  warnings: PreflightFinding[]
  summary: {
    providerApprovals: ProviderApprovalGroup[]
    inspectedAt: string
  }
}

function maskEmail(email: string): string {
  const [local = '', domain = 'invalid'] = email.split('@')
  const prefix = local.slice(0, 1) || '*'
  return `${prefix}***@${domain}`
}

export async function runPreflightDataAudit(
  store: PreflightDataAuditStore,
  now: Date = new Date(),
): Promise<PreflightDataAuditResult> {
  const snapshot = await store.inspect()
  const blockers: PreflightFinding[] = []
  const warnings: PreflightFinding[] = []

  const duplicateEmailCount = snapshot.duplicateEmails.reduce((sum, group) => sum + group.count, 0)
  if (duplicateEmailCount > 0) {
    blockers.push({
      code: 'DUPLICATE_NORMALIZED_EMAILS',
      severity: 'blocker',
      count: duplicateEmailCount,
      samples: snapshot.duplicateEmails.slice(0, 5).map((group) => maskEmail(group.normalizedEmail)),
      detail: 'Resolve lower(trim(email)) collisions before applying unique constraints.',
    })
  }

  if (snapshot.usersWithoutPasswordHash > 0) {
    blockers.push({
      code: 'USERS_WITHOUT_PASSWORD_HASH',
      severity: 'blocker',
      count: snapshot.usersWithoutPasswordHash,
      detail: 'Authenticated users without a password hash require controlled remediation.',
    })
  }

  const duplicatePaymentCount = snapshot.duplicatePayments.reduce((sum, group) => sum + group.count, 0)
  if (duplicatePaymentCount > 0) {
    blockers.push({
      code: 'DUPLICATE_PAYMENT_RECORDS',
      severity: 'blocker',
      count: duplicatePaymentCount,
      detail: 'Resolve duplicate PaymentRecord rows before applying serviceRequestId uniqueness.',
    })
  }

  if (snapshot.duplicateActiveTrackingLinks > 0) {
    blockers.push({
      code: 'DUPLICATE_ACTIVE_TRACKING_LINKS',
      severity: 'blocker',
      count: snapshot.duplicateActiveTrackingLinks,
      detail: 'A service must not retain more than one active tracking link.',
    })
  }

  const providersPendingReview = snapshot.providerApprovals
    .filter((group) => group.status === 'PENDING' || group.status.startsWith('LEGACY_'))
    .reduce((sum, group) => sum + group.count, 0)
  if (providersPendingReview > 0) {
    warnings.push({
      code: 'PROVIDERS_REQUIRE_APPROVAL_REVIEW',
      severity: 'warning',
      count: providersPendingReview,
      detail: 'Review legacy or pending providers before allowing pilot operations.',
    })
  }

  const missingConsentCount = snapshot.missingCurrentConsents.reduce((sum, group) => sum + group.count, 0)
  if (missingConsentCount > 0) {
    warnings.push({
      code: 'USERS_MISSING_CURRENT_CONSENTS',
      severity: 'warning',
      count: missingConsentCount,
      detail: 'Users remain operationally blocked until they accept current required versions.',
    })
  }

  if (snapshot.legacyTrackingWithoutExpiry > 0 || snapshot.legacyTrackingWithoutActiveKey > 0) {
    warnings.push({
      code: 'LEGACY_TRACKING_LINKS_UNAVAILABLE',
      severity: 'warning',
      count: Math.max(snapshot.legacyTrackingWithoutExpiry, snapshot.legacyTrackingWithoutActiveKey),
      detail: 'Legacy links without expiry or active key stay unavailable until regeneration.',
    })
  }

  for (const gap of snapshot.schemaGaps) {
    warnings.push({
      code: 'LEGACY_SCHEMA_GAP',
      severity: 'warning',
      count: 1,
      samples: [gap],
      detail: 'The clone schema lacks a field required by the current application schema.',
    })
  }

  return {
    ok: blockers.length === 0,
    code: 'PREFLIGHT_DATA_AUDIT_COMPLETE',
    blockers,
    warnings,
    summary: {
      providerApprovals: snapshot.providerApprovals,
      inspectedAt: now.toISOString(),
    },
  }
}

type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

type ColumnRow = { table_name: string; column_name: string }
type CountRow = { count: number | bigint }

function numberValue(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}

export function createPrismaPreflightStore(client: QueryClient): PreflightDataAuditStore {
  return {
    async inspect() {
      const columns = await client.$queryRawUnsafe<ColumnRow[]>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('User', 'ProviderProfile', 'ConsentRecord', 'PaymentRecord', 'TrackingShare')
      `)
      const available = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`))
      const has = (table: string, column: string) => available.has(`${table}.${column}`)
      const schemaGaps: string[] = []
      const requireColumn = (table: string, column: string) => {
        if (!has(table, column)) schemaGaps.push(`${table}.${column}`)
        return has(table, column)
      }

      const hasUserEmail = requireColumn('User', 'email')
      const hasPasswordHash = requireColumn('User', 'passwordHash')
      const hasUserRole = requireColumn('User', 'role')
      const hasProviderApproval = requireColumn('ProviderProfile', 'approvalStatus')
      const hasPaymentService = requireColumn('PaymentRecord', 'serviceRequestId')
      const hasConsentUser = requireColumn('ConsentRecord', 'userId')
      const hasConsentType = requireColumn('ConsentRecord', 'type')
      const hasConsentVersion = requireColumn('ConsentRecord', 'version')
      const hasConsentRevoked = requireColumn('ConsentRecord', 'revokedAt')
      const hasTrackingExpiry = requireColumn('TrackingShare', 'expiresAt')
      const hasTrackingActiveKey = requireColumn('TrackingShare', 'activeKey')
      const hasTrackingRevoked = requireColumn('TrackingShare', 'revokedAt')

      const duplicateEmails = hasUserEmail
        ? await client.$queryRawUnsafe<Array<{ normalized_email: string; count: number | bigint }>>(`
            SELECT lower(btrim(email)) AS normalized_email, count(*) AS count
            FROM "User"
            WHERE email IS NOT NULL AND btrim(email) <> ''
            GROUP BY lower(btrim(email))
            HAVING count(*) > 1
          `)
        : []

      const usersWithoutHashRows = hasPasswordHash
        ? await client.$queryRawUnsafe<CountRow[]>(`
            SELECT count(*) AS count
            FROM "User"
            WHERE "passwordHash" IS NULL OR btrim("passwordHash") = ''
          `)
        : hasUserRole
          ? await client.$queryRawUnsafe<CountRow[]>(`SELECT count(*) AS count FROM "User"`)
          : [{ count: 0 }]

      const duplicatePayments = hasPaymentService
        ? await client.$queryRawUnsafe<CountRow[]>(`
            SELECT count(*) AS count
            FROM "PaymentRecord"
            GROUP BY "serviceRequestId"
            HAVING count(*) > 1
          `)
        : []

      const providerApprovals = hasProviderApproval
        ? await client.$queryRawUnsafe<Array<{ status: string; count: number | bigint }>>(`
            SELECT "approvalStatus"::text AS status, count(*) AS count
            FROM "ProviderProfile"
            GROUP BY "approvalStatus"::text
          `)
        : has('ProviderProfile', 'id')
          ? (await client.$queryRawUnsafe<CountRow[]>(`SELECT count(*) AS count FROM "ProviderProfile"`))
            .map((row) => ({ status: 'LEGACY_APPROVAL_FIELD_MISSING', count: row.count }))
          : []

      let missingCurrentConsents: ConsentGapGroup[] = []
      if (hasUserRole && hasConsentUser && hasConsentType && hasConsentVersion && hasConsentRevoked) {
        const rows = await client.$queryRawUnsafe<Array<{ role: string; type: ConsentTypeName; count: number | bigint }>>(`
          SELECT required.role, required.type, count(*) AS count
          FROM (
            VALUES
              ('CLIENT', 'TERMS', $1),
              ('CLIENT', 'PRIVACY_NOTICE', $2),
              ('PROVIDER', 'TERMS', $1),
              ('PROVIDER', 'PRIVACY_NOTICE', $2),
              ('PROVIDER', 'PROVIDER_OPERATIONAL', $3)
          ) AS required(role, type, version)
          JOIN "User" user_record ON user_record.role::text = required.role
          LEFT JOIN "ConsentRecord" consent
            ON consent."userId" = user_record.id
            AND consent.type::text = required.type
            AND consent.version = required.version
            AND consent."revokedAt" IS NULL
          WHERE consent.id IS NULL
          GROUP BY required.role, required.type
        `,
        CURRENT_CONSENT_VERSIONS.TERMS,
        CURRENT_CONSENT_VERSIONS.PRIVACY_NOTICE,
        CURRENT_CONSENT_VERSIONS.PROVIDER_OPERATIONAL)
        missingCurrentConsents = rows.map((row) => ({ ...row, count: numberValue(row.count) }))
      } else if (hasUserRole) {
        const rows = await client.$queryRawUnsafe<Array<{ role: string; count: number | bigint }>>(`
          SELECT role::text AS role, count(*) AS count
          FROM "User"
          WHERE role::text IN ('CLIENT', 'PROVIDER')
          GROUP BY role::text
        `)
        missingCurrentConsents = rows.flatMap((row) => {
          const types: ConsentTypeName[] = row.role === 'PROVIDER'
            ? ['TERMS', 'PRIVACY_NOTICE', 'PROVIDER_OPERATIONAL']
            : ['TERMS', 'PRIVACY_NOTICE']
          return types.map((type) => ({ role: row.role, type, count: numberValue(row.count) }))
        })
      }

      const trackingCountRows = has('TrackingShare', 'id')
        ? await client.$queryRawUnsafe<CountRow[]>(`SELECT count(*) AS count FROM "TrackingShare"`)
        : [{ count: 0 }]
      const trackingTotal = numberValue(trackingCountRows[0]?.count ?? 0)
      const legacyExpiryRows = hasTrackingExpiry
        ? await client.$queryRawUnsafe<CountRow[]>(`
            SELECT count(*) AS count FROM "TrackingShare" WHERE "expiresAt" IS NULL
          `)
        : [{ count: trackingTotal }]
      const legacyActiveRows = hasTrackingActiveKey && hasTrackingRevoked
        ? await client.$queryRawUnsafe<CountRow[]>(`
            SELECT count(*) AS count
            FROM "TrackingShare"
            WHERE "activeKey" IS NULL AND "revokedAt" IS NULL
          `)
        : [{ count: trackingTotal }]
      const duplicateActiveRows = hasTrackingActiveKey
        ? await client.$queryRawUnsafe<CountRow[]>(`
            SELECT count(*) AS count
            FROM "TrackingShare"
            WHERE "activeKey" IS NOT NULL
            GROUP BY "activeKey"
            HAVING count(*) > 1
          `)
        : []

      return {
        duplicateEmails: duplicateEmails.map((row) => ({
          normalizedEmail: row.normalized_email,
          count: numberValue(row.count),
        })),
        usersWithoutPasswordHash: numberValue(usersWithoutHashRows[0]?.count ?? 0),
        duplicatePayments: duplicatePayments.map((row) => ({ count: numberValue(row.count) })),
        providerApprovals: providerApprovals.map((row) => ({
          status: row.status,
          count: numberValue(row.count),
        })),
        missingCurrentConsents,
        legacyTrackingWithoutExpiry: numberValue(legacyExpiryRows[0]?.count ?? 0),
        legacyTrackingWithoutActiveKey: numberValue(legacyActiveRows[0]?.count ?? 0),
        duplicateActiveTrackingLinks: duplicateActiveRows.reduce(
          (sum, row) => sum + numberValue(row.count),
          0,
        ),
        schemaGaps,
      }
    },
  }
}

function validateDatabaseUrl(env: Record<string, string | undefined>): string {
  const databaseUrl = env.POSTGRES_DATABASE_URL
  if (!databaseUrl) throw new Error('POSTGRES_DATABASE_URL_REQUIRED')
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('POSTGRES_DATABASE_URL_INVALID')
  return databaseUrl
}

async function runFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): Promise<PreflightDataAuditResult> {
  const databaseUrl = validateDatabaseUrl(env)
  const { PrismaClient } = await import('@prisma/client')
  const client = new PrismaClient({ datasourceUrl: databaseUrl })

  try {
    return await runPreflightDataAudit(createPrismaPreflightStore(client))
  } finally {
    await client.$disconnect()
  }
}

if (import.meta.main) {
  runFromEnvironment()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 2
    })
    .catch((error) => {
      const code = error instanceof Error && (
        error.message === 'POSTGRES_DATABASE_URL_REQUIRED' ||
        error.message === 'POSTGRES_DATABASE_URL_INVALID'
      ) ? error.message : 'PREFLIGHT_DATA_AUDIT_FAILED'
      console.error(JSON.stringify({ ok: false, code }))
      process.exitCode = 1
    })
}
