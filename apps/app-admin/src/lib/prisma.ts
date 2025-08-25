import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection URL with pool settings
const databaseUrl = process.env.DATABASE_URL
const connectionUrl = databaseUrl ? 
  `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=10` : 
  undefined

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: connectionUrl || process.env.DATABASE_URL
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Ensure we disconnect on app termination
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}

export default prisma