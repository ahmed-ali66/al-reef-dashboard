import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isDev = process.env.NODE_ENV === 'development'

// Connection pool settings are configured via DATABASE_URL params:
// For Neon PostgreSQL: ?connection_limit=20&pool_timeout=20
// The Prisma client handles connection pooling internally with these defaults:
// - connection_limit: num_cpus * 2 + 1 (typically 5-10 for serverless)
// - pool_timeout: 10s

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: isDev ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// FIX: In development, cache the Prisma client to avoid creating new connections on HMR
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Graceful shutdown for connection cleanup
// Guard: process.on is not available in Edge Runtime (middleware)
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  const shutdown = async () => {
    try {
      await prisma.$disconnect()
    } catch (e) {
      // Silent fail on shutdown
    }
    if (typeof process.exit === 'function') {
      process.exit(0)
    }
  }
  process.on('beforeExit', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export default prisma
