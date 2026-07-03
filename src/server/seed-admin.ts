// Seed script to create the admin user for Help Bibi.
// Run with: bun run src/server/seed-admin.ts
import { db } from './db/prisma'
import { hashPassword } from './auth'

async function main() {
  const email = 'admin@helpbibi.local'
  const password = 'Admin123!'
  const name = 'Administrador Help Bibi'

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    // Update password in case it changed
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash: hashPassword(password), role: 'ADMIN', name },
    })
    console.log(`[seed-admin] Updated existing admin: ${email} (id=${existing.id})`)
    return
  }

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: 'ADMIN',
    },
  })
  console.log(`[seed-admin] Created admin: ${email} (id=${user.id})`)
}

main()
  .catch((e) => { console.error('[seed-admin] error:', e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
