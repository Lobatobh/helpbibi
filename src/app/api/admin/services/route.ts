import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { listServicesForAdmin } from '@/server/repositories/service-requests.repository'
import type { ServiceStatus } from '@prisma/client'

const SERVICE_STATUSES = new Set<ServiceStatus>([
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'PROVIDER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
  'FAILED',
])

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const url = new URL(req.url)
  const rawStatus = url.searchParams.get('status')
  const status =
    rawStatus && SERVICE_STATUSES.has(rawStatus as ServiceStatus)
      ? (rawStatus as ServiceStatus)
      : rawStatus === 'ALL'
        ? 'ALL'
        : null
  const query = url.searchParams.get('q')
  const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10)

  const services = await listServicesForAdmin({ status, query, limit })
  return NextResponse.json({ services, count: services.length })
}
