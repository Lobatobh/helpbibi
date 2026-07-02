import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/server/auth/session'

export async function POST() {
  const headers = new Headers()
  headers.append('Set-Cookie', clearSessionCookie())
  return NextResponse.json({ ok: true }, { headers })
}
