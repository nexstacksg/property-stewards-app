import type { PrismaClient, Prisma } from '@prisma/client'

const PAD_LENGTH = 5

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient

type ModelKey = 'contract' | 'workOrder'

const PREFIX_MAP: Record<ModelKey, string> = {
  contract: 'C',
  workOrder: 'W',
}

async function getNextNumericSuffix(
  client: PrismaClientOrTransaction,
  model: ModelKey,
  prefix: string,
): Promise<number> {
  const delegate = model === 'contract' ? client.contract : client.workOrder
  const latest = await delegate.findFirst({
    where: {
      id: {
        startsWith: prefix,
      },
    },
    orderBy: {
      id: 'desc',
    },
    select: {
      id: true,
    },
  })

  if (!latest?.id) {
    return 1
  }

  const numericPortion = latest.id.slice(prefix.length)
  const parsed = parseInt(numericPortion, 10)

  if (Number.isNaN(parsed) || parsed < 0) {
    return 1
  }

  return parsed + 1
}

function buildPrefix(model: ModelKey, now: Date): string {
  const year = now.getFullYear()
  return `${PREFIX_MAP[model]}-${year}-`
}

function formatId(prefix: string, sequence: number): string {
  return `${prefix}${sequence.toString().padStart(PAD_LENGTH, '0')}`
}

async function generatePrefixedId(
  client: PrismaClientOrTransaction,
  model: ModelKey,
  now: Date = new Date(),
): Promise<string> {
  const prefix = buildPrefix(model, now)
  const sequence = await getNextNumericSuffix(client, model, prefix)
  return formatId(prefix, sequence)
}

export async function generateContractId(
  client: PrismaClientOrTransaction,
  now: Date = new Date(),
): Promise<string> {
  return generatePrefixedId(client, 'contract', now)
}

export async function generateWorkOrderId(
  client: PrismaClientOrTransaction,
  now: Date = new Date(),
): Promise<string> {
  return generatePrefixedId(client, 'workOrder', now)
}
