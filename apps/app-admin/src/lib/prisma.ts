import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection URL with Vercel-optimized settings
const databaseUrl = process.env.DATABASE_URL
const connectionUrl = databaseUrl ? 
  `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=1&pool_timeout=10&connect_timeout=10&statement_timeout=10000` : 
  undefined

// Track instance creation for debugging
let instanceCount = 0

// Single instance pattern - CRITICAL for connection management
export const prisma = globalForPrisma.prisma ?? (() => {
  instanceCount++
  console.log(`[Prisma] Creating new instance #${instanceCount} at ${new Date().toISOString()}`)
  
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
if (typeof window === 'undefined') {
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
}

export default prisma