import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { hashPassword } from '@/server/auth'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import {
  createUserWithCurrentConsents,
  RegistrationConflictError,
} from '@/server/consents/consent-registration'
import { normalizeEmail, validateNewPassword } from '@/server/auth/credentials'

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'auth/register-client', RATE_LIMITS.login)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'auth/register-client' })
    return rateLimited
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { name, email, phone, password, acceptTerms, acceptPrivacy } = body
    const normalizedEmail = normalizeEmail(email)

    if (!name || !normalizedEmail || !password) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 })
    }
    if (acceptTerms !== true || acceptPrivacy !== true) {
      return NextResponse.json({
        error: 'Aceite os Termos de Uso e a Política de Privacidade para criar a conta.',
        code: 'consent_required',
      }, { status: 422 })
    }
    const passwordPolicy = validateNewPassword(password)
    if (!passwordPolicy.ok) {
      return NextResponse.json({ error: passwordPolicy.message, code: passwordPolicy.code }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const user = await createUserWithCurrentConsents(
      {
        name: String(name).trim(),
        email: normalizedEmail,
        phone: phone || null,
        passwordHash,
        role: 'CLIENT',
        status: 'ACTIVE',
        clientProfile: { create: {} },
        loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
      },
      ['TERMS', 'PRIVACY_NOTICE'],
    )

    const headers = new Headers()
    headers.append('Set-Cookie', setSessionCookie(user.id, user.role))

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      clientProfile: user.clientProfile,
      loyaltyAccount: user.loyaltyAccount,
    }, { headers })
  } catch (error) {
    if (error instanceof RegistrationConflictError || (error as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'Não foi possível criar a conta com os dados informados.' }, { status: 409 })
    }
    console.error('[auth/register-client] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
