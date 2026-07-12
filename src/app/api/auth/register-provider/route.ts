import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { hashPassword } from '@/server/auth'
import { db } from '../../../../server/db/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, password, vehicle, plate, city } = body
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (!name || !normalizedEmail || !password || !vehicle || !plate) {
      return NextResponse.json({ error: 'Nome, email, senha, veículo e placa são obrigatórios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: {
        name,
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
      include: { providerProfile: true, loyaltyAccount: true },
    })

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
    console.error('[auth/register-provider] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
