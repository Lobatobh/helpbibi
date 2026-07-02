import { NextResponse } from 'next/server'
import { applyRateLimit, RATE_LIMITS } from '@/server/rate-limit'

const startedAt = Date.now()

export async function GET(req: Request) {
  const rateLimited = applyRateLimit(req, 'health', RATE_LIMITS.health)
  if (rateLimited) return rateLimited
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    version: '25.4.0',
  })
}
