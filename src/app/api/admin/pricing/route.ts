import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { getAllPricingConfigs } from '@/server/pricing/pricing-engine'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const configs = getAllPricingConfigs()
  return NextResponse.json(configs.map(c => ({
    serviceType: c.serviceType,
    baseFare: c.baseFare,
    pricePerKm: c.pricePerKm,
    minimumFare: c.minimumFare,
    destinationPricePerKm: c.destinationPricePerKm,
    nightSurchargePercent: c.nightSurchargePercent,
    weekendSurchargePercent: c.weekendSurchargePercent,
    platformFeePercent: c.platformFeePercent,
    providerPayoutPercent: c.providerPayoutPercent,
  })))
}
