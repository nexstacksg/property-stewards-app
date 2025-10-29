import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaListenersAdded?: boolean
  prismaInstanceCount?: number
}

// Configure connection URL with environment-tunable pooling
const databaseUrl = process.env.DATABASE_URL
const connLimit = Number(process.env.PRISMA_CONNECTION_LIMIT || '30')
const poolTimeout = Number(process.env.PRISMA_POOL_TIMEOUT || '30') // seconds
const connectTimeout = Number(process.env.PRISMA_CONNECT_TIMEOUT || '10') // seconds
const statementTimeout = Number(process.env.PRISMA_STATEMENT_TIMEOUT || '60000') // ms

const connectionUrl = databaseUrl
  ? `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=${connLimit}&pool_timeout=${poolTimeout}&connect_timeout=${connectTimeout}&statement_timeout=${statementTimeout}`
  : undefined

// Track instance creation for debugging (per-process)
globalForPrisma.prismaInstanceCount = globalForPrisma.prismaInstanceCount ?? 0

// Single instance pattern - CRITICAL for connection management
export const prisma = globalForPrisma.prisma ?? (() => {
  globalForPrisma.prismaInstanceCount! += 1
  const instanceCount = globalForPrisma.prismaInstanceCount
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Prisma] Creating new instance #${instanceCount} (pid ${process.pid}) at ${new Date().toISOString()}`
    )
  }
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: connectionUrl || process.env.DATABASE_URL
      }
    }
  })
  
  // Log connection events in production
  if (process.env.NODE_ENV === 'production') {
    client.$on('query' as never, (e: any) => {
      if (e.duration > 1000) {
        console.warn(`[Prisma] Slow query (${e.duration}ms):`, e.query)
      }
    })
  }
  
  return client
})()

// Always reuse the same instance to prevent connection leaks
globalForPrisma.prisma = prisma

// Ensure proper cleanup
if (typeof window === 'undefined' && !globalForPrisma.prismaListenersAdded) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
  process.on('SIGTERM', async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  globalForPrisma.prismaListenersAdded = true
}

export default prisma
