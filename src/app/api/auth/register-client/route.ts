import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { hashPassword } from '@/server/auth'
import { db } from '../../../../server/db/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, password } = body

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        passwordHash,
        role: 'CLIENT',
        status: 'ACTIVE',
        clientProfile: { create: {} },
        loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
      },
      include: { clientProfile: true, loyaltyAccount: true },
    })

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
    console.error('[auth/register-client] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
