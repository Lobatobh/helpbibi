import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  })

function serializeTestPrismaQueries(client: PrismaClient): PrismaClient {
  let queue = Promise.resolve()

  const runQueued = <T>(operation: () => Promise<T>): Promise<T> => {
    const current = queue.then(operation, operation)
    queue = current.then(
      () => undefined,
      () => undefined
    )
    return current
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          return runQueued(() => query(args))
        },
      },
    },
  }) as unknown as PrismaClient
}

const shouldSerializeTestQueries =
  process.env.NODE_ENV === 'test' &&
  (process.env.DATABASE_URL || '').startsWith('file:')

export const db = shouldSerializeTestQueries
  ? serializeTestPrismaQueries(prisma)
  : prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
