// One-off migration script to convert Contract.inspectorRatings
// from string values (GOOD/FAIR/BAD) to 1–5 star numbers.
// Usage: pnpm tsx scripts/migrate-inspector-ratings.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function toStars(value: unknown): number | null {
  if (typeof value === 'number' && value >= 1 && value <= 5) return Math.round(value)
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase()
    if (v === 'GOOD') return 5
    if (v === 'FAIR') return 3
    if (v === 'BAD') return 1
    const n = Number(v)
    if (!Number.isNaN(n) && n >= 1 && n <= 5) return Math.round(n)
  }
  return null
}

async function main() {
  const contracts = await prisma.contract.findMany({ select: { id: true, inspectorRatings: true } })
  let updated = 0
  for (const c of contracts) {
    const map = (c as any).inspectorRatings as Record<string, any> | null | undefined
    if (!map || typeof map !== 'object') continue
    let changed = false
    const next: Record<string, number> = {}
    for (const [key, val] of Object.entries(map)) {
      const stars = toStars(val)
      if (stars !== null) {
        next[key] = stars
        if (val !== stars) changed = true
      }
    }
    if (changed) {
      await prisma.contract.update({ where: { id: c.id }, data: { inspectorRatings: next as any } })
      updated += 1
      console.log(`Updated contract ${c.id}`)
    }
  }
  console.log(`Done. Updated ${updated} contract(s).`)
}

main().finally(async () => {
  await prisma.$disconnect()
})

