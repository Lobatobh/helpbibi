import { db } from '@/server/db/prisma'
import type { User, UserRole } from '@prisma/client'

export async function findOrCreateUser(name: string, role: UserRole): Promise<User> {
  // Try to find by name (demo mode — no real auth yet)
  const existing = await db.user.findFirst({
    where: { name, role },
    include: { clientProfile: true, providerProfile: true, loyaltyAccount: true },
  })
  if (existing) return existing

  const user = await db.user.create({
    data: {
      name,
      role,
      ...(role === 'CLIENT'
        ? { clientProfile: { create: {} } }
        : {}),
      loyaltyAccount: { create: { points: 0, tier: 'Bronze' } },
    },
    include: { clientProfile: true, providerProfile: true, loyaltyAccount: true },
  })
  return user
}

export async function findUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    include: { clientProfile: true, providerProfile: true, loyaltyAccount: true },
  })
}

export async function updateLoyaltyPoints(userId: string, points: number) {
  return db.loyaltyAccount.upsert({
    where: { userId },
    update: { points: { increment: points } },
    create: { userId, points },
  })
}

export async function getLoyaltyInfo(userId: string) {
  const account = await db.loyaltyAccount.findUnique({ where: { userId } })
  if (!account) return null
  const TIERS = [
    { name: 'Bronze', min: 0, color: '#a16207', perk: '5% OFF no próximo' },
    { name: 'Prata', min: 200, color: '#94a3b8', perk: '8% OFF + prioridade' },
    { name: 'Ouro', min: 500, color: '#00BFFF', perk: '12% OFF + suporte VIP' },
    { name: 'Diamante', min: 1000, color: '#38bdf8', perk: '15% OFF + benefícios exclusivos' },
  ]
  let tier = TIERS[0]
  for (const t of TIERS) if (account.points >= t.min) tier = t
  let nextTierMin: number | null = null
  for (const t of TIERS) if (account.points < t.min) { nextTierMin = t.min; break }
  return {
    points: account.points,
    tier: { name: tier.name, color: tier.color, perk: tier.perk },
    nextTierMin,
  }
}
