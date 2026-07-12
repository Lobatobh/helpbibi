import { hashPassword } from '../src/server/auth'

const POSTGRES_BOOTSTRAP_LOCK_ID = 3502
const DEFAULT_ADMIN_NAME = 'Administrador Help Bibi'

export type BootstrapUser = {
  id: string
  email: string | null
  role: string
}

type CreateAdminData = {
  email: string
  name: string
  passwordHash: string
  role: 'ADMIN'
  status: 'ACTIVE'
}

type PromoteAdminData = {
  passwordHash: string
  role: 'ADMIN'
  status: 'ACTIVE'
}

export interface BootstrapAdminStore {
  findFirstAdmin(): Promise<BootstrapUser | null>
  findUserByEmail(email: string): Promise<BootstrapUser | null>
  createAdmin(data: CreateAdminData): Promise<void>
  promoteUser(id: string, data: PromoteAdminData): Promise<void>
}

export type BootstrapAdminInput = {
  email: string
  password: string
  name: string
  allowPromotion: boolean
  confirmedEmail: string | null
}

export type BootstrapAdminResult =
  | { ok: true; code: 'ADMIN_CREATED' | 'ADMIN_ALREADY_BOOTSTRAPPED' | 'USER_PROMOTED_TO_ADMIN'; changed: boolean }
  | { ok: false; code: 'EXISTING_USER_CONFIRMATION_REQUIRED'; changed: false }

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function hasStrongPassword(password: string): boolean {
  return password.length >= 16
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password)
}

export function parseBootstrapAdminInput(
  env: Record<string, string | undefined>,
): BootstrapAdminInput {
  const email = normalizeEmail(env.ADMIN_BOOTSTRAP_EMAIL ?? '')
  if (!email) throw new Error('ADMIN_BOOTSTRAP_EMAIL_REQUIRED')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL_INVALID')
  }

  const password = env.ADMIN_BOOTSTRAP_PASSWORD ?? ''
  if (!password) throw new Error('ADMIN_BOOTSTRAP_PASSWORD_REQUIRED')
  if (!hasStrongPassword(password)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD_POLICY')
  }

  const name = env.ADMIN_BOOTSTRAP_NAME?.trim() || DEFAULT_ADMIN_NAME
  if (name.length > 100) throw new Error('ADMIN_BOOTSTRAP_NAME_INVALID')

  const confirmedEmail = env.ADMIN_BOOTSTRAP_CONFIRM_EMAIL
    ? normalizeEmail(env.ADMIN_BOOTSTRAP_CONFIRM_EMAIL)
    : null

  return {
    email,
    password,
    name,
    allowPromotion: env.ADMIN_BOOTSTRAP_ALLOW_PROMOTION === 'true',
    confirmedEmail,
  }
}

export async function bootstrapFirstAdmin(
  store: BootstrapAdminStore,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const existingAdmin = await store.findFirstAdmin()
  if (existingAdmin) {
    return { ok: true, code: 'ADMIN_ALREADY_BOOTSTRAPPED', changed: false }
  }

  const existingUser = await store.findUserByEmail(input.email)
  if (existingUser && (!input.allowPromotion || input.confirmedEmail !== input.email)) {
    return { ok: false, code: 'EXISTING_USER_CONFIRMATION_REQUIRED', changed: false }
  }

  const passwordHash = hashPassword(input.password)
  if (existingUser) {
    await store.promoteUser(existingUser.id, {
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    return { ok: true, code: 'USER_PROMOTED_TO_ADMIN', changed: true }
  }

  await store.createAdmin({
    email: input.email,
    name: input.name,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  })
  return { ok: true, code: 'ADMIN_CREATED', changed: true }
}

function createPrismaStore(client: any): BootstrapAdminStore {
  return {
    findFirstAdmin: () => client.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, email: true, role: true },
    }),
    findUserByEmail: (email) => client.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    }),
    createAdmin: async (data) => {
      await client.user.create({ data, select: { id: true } })
    },
    promoteUser: async (id, data) => {
      await client.user.update({ where: { id }, data, select: { id: true } })
    },
  }
}

async function runBootstrapAdmin(
  env: Record<string, string | undefined> = process.env,
): Promise<BootstrapAdminResult> {
  const input = parseBootstrapAdminInput(env)
  const databaseUrl = env.POSTGRES_DATABASE_URL
  if (!databaseUrl) throw new Error('POSTGRES_DATABASE_URL_REQUIRED')
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error('POSTGRES_DATABASE_URL_INVALID')
  }

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })

  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${POSTGRES_BOOTSTRAP_LOCK_ID})`
      return bootstrapFirstAdmin(createPrismaStore(transaction), input)
    }, { isolationLevel: 'Serializable' })
  } finally {
    await prisma.$disconnect()
  }
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'BOOTSTRAP_FAILED'
  const allowedCodes = new Set([
    'ADMIN_BOOTSTRAP_EMAIL_REQUIRED',
    'ADMIN_BOOTSTRAP_EMAIL_INVALID',
    'ADMIN_BOOTSTRAP_PASSWORD_REQUIRED',
    'ADMIN_BOOTSTRAP_PASSWORD_POLICY',
    'ADMIN_BOOTSTRAP_NAME_INVALID',
    'POSTGRES_DATABASE_URL_REQUIRED',
    'POSTGRES_DATABASE_URL_INVALID',
  ])
  return allowedCodes.has(error.message) ? error.message : 'BOOTSTRAP_FAILED'
}

if (import.meta.main) {
  runBootstrapAdmin()
    .then((result) => {
      console.log(JSON.stringify(result))
      if (!result.ok) process.exitCode = 2
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, code: safeErrorCode(error), changed: false }))
      process.exitCode = 1
    })
}
