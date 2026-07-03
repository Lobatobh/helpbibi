import { db } from './db/prisma'

async function normalizeDemoProviders() {
  // Mark providers with demo_ email pattern as isDemoProvider = true
  const demoUsers = await db.user.findMany({
    where: { email: { startsWith: 'demo_' } },
    include: { providerProfile: true },
  })

  let count = 0
  for (const user of demoUsers) {
    if (user.providerProfile && !user.providerProfile.isDemoProvider) {
      await db.providerProfile.update({
        where: { id: user.providerProfile.id },
        data: {
          isDemoProvider: true,
          isVerified: true,
          documentStatus: 'APPROVED',
          vehicleStatus: 'APPROVED',
        },
      })
      count++
    }
  }

  console.log(`Normalized ${count} demo providers`)
}

normalizeDemoProviders()
  .catch(console.error)
  .finally(() => db.$disconnect())
