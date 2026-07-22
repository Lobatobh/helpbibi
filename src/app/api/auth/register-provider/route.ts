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
  const rateLimited = await applyRateLimit(req, 'auth/register-provider', RATE_LIMITS.login)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'auth/register-provider' })
    return rateLimited
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      name,
      email,
      phone,
      password,
      vehicle,
      plate,
      city,
      acceptTerms,
      acceptPrivacy,
      acceptProviderOperational,
    } = body
    const normalizedEmail = normalizeEmail(email)

    if (!name || !normalizedEmail || !password || !vehicle || !plate) {
      return NextResponse.json({ error: 'Nome, email, senha, veículo e placa são obrigatórios' }, { status: 400 })
    }
    if (acceptTerms !== true || acceptPrivacy !== true || acceptProviderOperational !== true) {
      return NextResponse.json({
        error: 'Aceite os documentos obrigatórios para criar a conta de prestador.',
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
        role: 'PROVIDER',
        status: 'ACTIVE',
        providerProfile: {
          create: {
            vehicle,
            plate,
            city: city || null,
            isAvailable: false, // Not available until approved
            isVerified: false, // Always starts pending — admin must approve
            isDemoProvider: false,
            approvalStatus: 'PENDING',
            documentStatus: 'PENDING',
            vehicleStatus: 'PENDING',
          },
        },
        loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
      },
      ['TERMS', 'PRIVACY_NOTICE', 'PROVIDER_OPERATIONAL'],
    )

    const headers = new Headers()
    headers.append('Set-Cookie', setSessionCookie(user.id, user.role))

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      providerProfile: user.providerProfile ? {
        id: user.providerProfile.id,
        vehicle: user.providerProfile.vehicle,
        plate: user.providerProfile.plate,
        city: user.providerProfile.city,
        approvalStatus: user.providerProfile.approvalStatus,
        documentStatus: user.providerProfile.documentStatus,
        vehicleStatus: user.providerProfile.vehicleStatus,
        isAvailable: user.providerProfile.isAvailable,
        isVerified: user.providerProfile.isVerified,
      } : null,
      loyaltyAccount: user.loyaltyAccount,
    }, { headers })
  } catch (error) {
    if (error instanceof RegistrationConflictError || (error as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'Não foi possível criar a conta com os dados informados.' }, { status: 409 })
    }
    console.error('[auth/register-provider] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
