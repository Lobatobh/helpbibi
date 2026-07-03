import { NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'
import { applyRateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { logger } from '@/server/logger'

const startedAt = Date.now()

export async function GET(req: Request) {
  const rateLimited = await applyRateLimit(req, 'health/db', RATE_LIMITS.health)
  if (rateLimited) return rateLimited
  try {
    // Simple DB connectivity check — count users (lightweight)
    await db.user.count()
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    })
  } catch (error: any) {
    logger.error('health', 'DB health check failed', { message: error.message })
    return NextResponse.json({
      status: 'degraded',
      database: 'error',
      timestamp: new Date().toISOString(),
      message: 'Database connection failed',
    }, { status: 503 })
  }
}
