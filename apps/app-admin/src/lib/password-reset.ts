import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { signJwt, verifyJwt } from '@/lib/jwt'
import { sendEmail } from '@/lib/email'

const DEBUG_PREFIX = '[password-reset]'

const RESET_PURPOSE = 'password-reset'
export const RESET_TTL_SECONDS = 60 * 60 // 1 hour

type ResetTokenPayload = {
  sub: string
  purpose: string
}

type MinimalUser = {
  id: string
  email: string
  username: string
}

export async function createPasswordResetToken(userId: string, expiresInSeconds = RESET_TTL_SECONDS): Promise<string | null> {
  const secret = getAuthSecret()
  if (!secret) {
    console.warn(`${DEBUG_PREFIX} Missing AUTH_SECRET when generating token`, { userId })
    return null
  }
  const token = await signJwt({ sub: userId, purpose: RESET_PURPOSE }, secret, expiresInSeconds)
  return token
}

export function buildPasswordResetUrl(origin: string, token: string): string {
  const url = new URL('/reset-password', origin)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function sendPasswordResetEmail(user: MinimalUser, origin: string, token?: string): Promise<{ token: string; url: string } | null> {
  const usable = token ?? (await createPasswordResetToken(user.id))
  if (!usable) return null
  const url = buildPasswordResetUrl(origin, usable)

  const subject = 'Reset your Property Stewards admin password'
  const text = `Hello ${user.username},\n\nWe received a request to reset your password. To proceed, visit ${url}.\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`
  const html = `<p>Hello ${user.username},</p><p>We received a request to reset your password. Click <a href="${url}">this link</a> to continue.</p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`

  try {
    await sendEmail({ to: user.email, subject, text, html })
    return { token: usable, url }
  } catch (err) {
    console.error(`${DEBUG_PREFIX} Failed to send reset email`, err)
    return null
  }
}

export async function verifyPasswordResetToken(token?: string | null): Promise<ResetTokenPayload | null> {
  if (!token) return null
  const secret = getAuthSecret()
  if (!secret) return null
  const payload = await verifyJwt<ResetTokenPayload>(token, secret)
  if (!payload || payload.purpose !== RESET_PURPOSE || !payload.sub) return null
  return payload
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

