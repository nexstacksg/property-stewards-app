import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'

type ConfirmationToken = {
  sub?: string
  purpose?: string
}

export type ConfirmationResult =
  | 'missing-token'
  | 'config-error'
  | 'invalid'
  | 'missing-user'
  | 'success'

export async function confirmUserByToken(token?: string | null): Promise<ConfirmationResult> {
  if (!token) {
    return 'missing-token'
  }

  const secret = getAuthSecret()
  if (!secret) {
    return 'config-error'
  }

  const payload = await verifyJwt<ConfirmationToken>(token, secret)
  if (!payload || !payload.sub || payload.purpose !== 'email-confirm') {
    return 'invalid'
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) {
    return 'missing-user'
  }

  if (!user.confirmed) {
    await prisma.user.update({ where: { id: user.id }, data: { confirmed: true } })
  }

  return 'success'
}

