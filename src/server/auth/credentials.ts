export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; code: 'PASSWORD_REQUIRED' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG'; message: string }

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validateNewPassword(value: unknown): PasswordPolicyResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, code: 'PASSWORD_REQUIRED', message: 'Senha obrigatoria.' }
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_SHORT',
      message: `Senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.`,
    }
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_LONG',
      message: `Senha deve ter no maximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    }
  }
  return { ok: true }
}
