import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { verifyPassword } from '../../src/server/auth'
import {
  bootstrapFirstAdmin,
  parseBootstrapAdminInput,
  type BootstrapAdminStore,
  type BootstrapUser,
} from '../bootstrap-admin'

function strongPassword() {
  return ['A', 'b'.repeat(14), '1', '!'].join('')
}

function createStore(users: BootstrapUser[] = []) {
  const state = users.map((user) => ({ ...user }))
  const writes: Array<{ operation: 'create' | 'promote'; data: Record<string, unknown> }> = []

  const store: BootstrapAdminStore = {
    findFirstAdmin: async () => state.find((user) => user.role === 'ADMIN') ?? null,
    findUserByEmail: async (email) => state.find((user) => user.email === email) ?? null,
    createAdmin: async (data) => {
      writes.push({ operation: 'create', data })
      state.push({ id: `user-${state.length + 1}`, email: data.email, role: data.role })
    },
    promoteUser: async (id, data) => {
      writes.push({ operation: 'promote', data: { id, ...data } })
      const user = state.find((candidate) => candidate.id === id)
      if (user) user.role = data.role
    },
  }

  return { store, state, writes }
}

describe('F35-02 secure first ADMIN bootstrap', () => {
  test('requires environment input and a strong password', () => {
    expect(() => parseBootstrapAdminInput({})).toThrow('ADMIN_BOOTSTRAP_EMAIL_REQUIRED')
    expect(() => parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: 'user@example.invalid',
      ADMIN_BOOTSTRAP_PASSWORD: 'short',
    })).toThrow('ADMIN_BOOTSTRAP_PASSWORD_POLICY')
  })

  test('creates the first active ADMIN with a normalized email and a password hash', async () => {
    const { store, writes } = createStore()
    const password = strongPassword()
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: ' First.User@Example.Invalid ',
      ADMIN_BOOTSTRAP_PASSWORD: password,
      ADMIN_BOOTSTRAP_NAME: 'Operacao Help Bibi',
    })

    const result = await bootstrapFirstAdmin(store, input)

    expect(result).toEqual({ ok: true, code: 'ADMIN_CREATED', changed: true })
    expect(writes).toHaveLength(1)
    expect(writes[0].operation).toBe('create')
    expect(writes[0].data.email).toBe('first.user@example.invalid')
    expect(writes[0].data.role).toBe('ADMIN')
    expect(writes[0].data.status).toBe('ACTIVE')
    expect(writes[0].data.passwordHash).not.toBe(password)
    expect(verifyPassword(password, String(writes[0].data.passwordHash))).toBe(true)
  })

  test('is idempotent and never overwrites an existing ADMIN', async () => {
    const existingAdmin = { id: 'admin-1', email: 'existing-user@example.invalid', role: 'ADMIN' }
    const { store, writes } = createStore([existingAdmin])
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: 'new-user@example.invalid',
      ADMIN_BOOTSTRAP_PASSWORD: strongPassword(),
    })

    const first = await bootstrapFirstAdmin(store, input)
    const second = await bootstrapFirstAdmin(store, input)

    expect(first).toEqual({ ok: true, code: 'ADMIN_ALREADY_BOOTSTRAPPED', changed: false })
    expect(second).toEqual(first)
    expect(writes).toHaveLength(0)
  })

  test('does not promote or overwrite an existing non-admin without explicit promotion flag', async () => {
    const existingClient = { id: 'client-1', email: 'owner@example.invalid', role: 'CLIENT' }
    const { store, writes } = createStore([existingClient])
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: existingClient.email,
      ADMIN_BOOTSTRAP_PASSWORD: strongPassword(),
      ADMIN_BOOTSTRAP_CONFIRM_EMAIL: existingClient.email,
    })

    const result = await bootstrapFirstAdmin(store, input)

    expect(result).toEqual({ ok: false, code: 'EXISTING_USER_CONFIRMATION_REQUIRED', changed: false })
    expect(writes).toHaveLength(0)
  })

  test('does not promote an existing non-admin when promotion flag is set but email confirmation is missing', async () => {
    const existingClient = { id: 'client-1', email: 'owner@example.invalid', role: 'CLIENT' }
    const { store, writes } = createStore([existingClient])
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: existingClient.email,
      ADMIN_BOOTSTRAP_PASSWORD: strongPassword(),
      ADMIN_BOOTSTRAP_ALLOW_PROMOTION: 'true',
    })

    const result = await bootstrapFirstAdmin(store, input)

    expect(result).toEqual({ ok: false, code: 'EXISTING_USER_CONFIRMATION_REQUIRED', changed: false })
    expect(writes).toHaveLength(0)
  })

  test('promotes the selected user only when flag is explicit and confirmation matches the normalized email', async () => {
    const existingProvider = { id: 'provider-1', email: 'owner@example.invalid', role: 'PROVIDER' }
    const { store, writes } = createStore([existingProvider])
    const password = strongPassword()
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: 'OWNER@EXAMPLE.INVALID',
      ADMIN_BOOTSTRAP_PASSWORD: password,
      ADMIN_BOOTSTRAP_ALLOW_PROMOTION: 'true',
      ADMIN_BOOTSTRAP_CONFIRM_EMAIL: ' owner@example.invalid ',
    })

    const result = await bootstrapFirstAdmin(store, input)

    expect(result).toEqual({ ok: true, code: 'USER_PROMOTED_TO_ADMIN', changed: true })
    expect(writes).toHaveLength(1)
    expect(writes[0].operation).toBe('promote')
    expect(writes[0].data.role).toBe('ADMIN')
    expect(writes[0].data.status).toBe('ACTIVE')
    expect(verifyPassword(password, String(writes[0].data.passwordHash))).toBe(true)
  })

  test('returns only a safe status without email, password, hash, or user id', async () => {
    const { store } = createStore()
    const password = strongPassword()
    const input = parseBootstrapAdminInput({
      ADMIN_BOOTSTRAP_EMAIL: 'private-user@example.invalid',
      ADMIN_BOOTSTRAP_PASSWORD: password,
    })

    const serialized = JSON.stringify(await bootstrapFirstAdmin(store, input))

    expect(serialized).not.toContain('private-user@example.invalid')
    expect(serialized).not.toContain(password)
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('user-1')
  })

  test('keeps credentials in environment input and uses a transaction lock', () => {
    const source = readFileSync('scripts/bootstrap-admin.ts', 'utf8')

    expect(source).toContain('ADMIN_BOOTSTRAP_EMAIL')
    expect(source).toContain('ADMIN_BOOTSTRAP_PASSWORD')
    expect(source).toContain('ADMIN_BOOTSTRAP_ALLOW_PROMOTION')
    expect(source).toContain('pg_advisory_xact_lock')
    expect(source).toContain("isolationLevel: 'Serializable'")
    expect(source).not.toContain('$executeRawUnsafe')
    expect(source).not.toContain(['Admin', '123!'].join(''))
  })
})
