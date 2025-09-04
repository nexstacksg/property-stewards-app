import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection URL with reduced pool settings for serverless
const databaseUrl = process.env.DATABASE_URL
const connectionUrl = databaseUrl ? 
  `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=2&pool_timeout=20` : 
  undefined

// Single instance pattern - CRITICAL for connection management
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: connectionUrl || process.env.DATABASE_URL
    }
  }
})

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