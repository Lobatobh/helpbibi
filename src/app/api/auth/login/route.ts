import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, role, name } = body
    if (!userId || !role) return NextResponse.json({ message: 'userId and role required' }, { status: 400 })
    // Verify user exists in DB
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true } })
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 })
    const headers = new Headers()
    headers.append('Set-Cookie', setSessionCookie(user.id, user.role))
    return NextResponse.json({ ok: true, user: { id: user.id, role: user.role, name: user.name } }, { headers })
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }
}
