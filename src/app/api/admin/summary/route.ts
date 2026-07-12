import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { db } from '@/server/db/prisma'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const [totalProviders, pendingProviders, approvedProviders, rejectedProviders, activeServices, completedServices, providers] = await Promise.all([
    db.providerProfile.count(),
    db.providerProfile.count({ where: { approvalStatus: 'PENDING' } }),
    db.providerProfile.count({ where: { approvalStatus: 'APPROVED' } }),
    db.providerProfile.count({ where: { approvalStatus: 'REJECTED' } }),
    db.serviceRequest.count({ where: { status: { in: ['REQUESTED', 'OFFERED', 'ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] } } }),
    db.serviceRequest.count({ where: { status: 'COMPLETED' } }),
    db.providerProfile.findMany({ where: { approvalStatus: 'APPROVED' }, select: { rating: true } }),
  ])

  const avgRating = providers.length > 0 ? providers.reduce((s, p) => s + p.rating, 0) / providers.length : 0
  // Platform revenue = sum of platformFee (20% of each completed service's total)
  const revenueAgg = await db.serviceRequest.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { platformFee: true, providerPayout: true, price: true },
  })

  // Payment status counts (FASE 17)
  const [pendingPayments, paidPayments, failedPayments, authorizedPayments] = await Promise.all([
    db.paymentRecord.count({ where: { status: 'PENDING' } }),
    db.paymentRecord.count({ where: { status: 'PAID' } }),
    db.paymentRecord.count({ where: { status: 'FAILED' } }),
    db.paymentRecord.count({ where: { status: 'AUTHORIZED' } }),
  ])

  return NextResponse.json({
    totalProviders, pendingProviders, approvedProviders, rejectedProviders,
    activeServices, completedServices,
    avgRating: Number(avgRating.toFixed(2)),
    totalRevenue: revenueAgg._sum.platformFee || 0,        // platform fee revenue
    totalPayout: revenueAgg._sum.providerPayout || 0,      // provider payouts
    totalGross: revenueAgg._sum.price || 0,                // gross total
    pendingPayments, paidPayments, failedPayments, authorizedPayments,
  })
}
