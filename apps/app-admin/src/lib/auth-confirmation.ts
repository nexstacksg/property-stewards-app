import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { signJwt, verifyJwt } from '@/lib/jwt'
import { sendEmail } from '@/lib/email'

const DEBUG_PREFIX = '[auth-confirmation]'

const CONFIRMATION_PURPOSE = 'email-confirm'
export const CONFIRMATION_TTL_SECONDS = 60 * 60 * 24 // 24 hours

type ConfirmationTokenPayload = {
  sub: string
  purpose: string
  email?: string
}

export type ConfirmationResult =
  | 'missing-token'
  | 'config-error'
  | 'invalid'
  | 'missing-user'
  | 'success'
  | 'email-error'

type MinimalUser = {
  id: string
  email: string
  username: string
}

type SendConfirmationEmailOptions = {
  user: MinimalUser
  origin: string
  token?: string
}

function debug(message: string, context?: Record<string, unknown>) {
  if (context) {
    console.info(`${DEBUG_PREFIX} ${message}`, context)
    return
  }
  console.info(`${DEBUG_PREFIX} ${message}`)
}

export async function createConfirmationToken(userId: string, expiresInSeconds = CONFIRMATION_TTL_SECONDS): Promise<string | null> {
  const secret = getAuthSecret()
  if (!secret) {
    debug('Missing AUTH_SECRET when generating token', { userId })
    return null
  }

  const token = await signJwt({ sub: userId, purpose: CONFIRMATION_PURPOSE }, secret, expiresInSeconds)
  debug('Generated confirmation token', { userId, expiresInSeconds })
  return token
}

export function buildConfirmationUrl(origin: string, token: string): string {
  const url = new URL('/confirm', origin)
  url.searchParams.set('token', token)
  debug('Built confirmation URL', { url: url.toString() })
  return url.toString()
}

export async function sendConfirmationEmail({ user, origin, token }: SendConfirmationEmailOptions): Promise<{ token: string; url: string } | null> {
  let usableToken = token
  if (!usableToken) {
    usableToken = await createConfirmationToken(user.id)
  }

  if (!usableToken) {
    debug('Cannot send confirmation email because token generation failed', { userId: user.id })
    return null
  }

  const url = buildConfirmationUrl(origin, usableToken)
  const subject = 'Confirm your Property Stewards admin account'
  const text = `Hello ${user.username},\n\nPlease confirm your Property Stewards admin account by visiting ${url}.\nThis link expires in 24 hours.`
  const html = `<p>Hello ${user.username},</p><p>Please confirm your Property Stewards admin account by clicking <a href="${url}">this link</a>.</p><p>This link expires in 24 hours.</p>`

  try {
    debug('Sending confirmation email', { userId: user.id, email: user.email })
    await sendEmail({ to: user.email, subject, text, html })
    debug('Confirmation email dispatched (or logged if SMTP disabled)', { userId: user.id })
    return { token: usableToken, url }
  } catch (err) {
    console.error(`${DEBUG_PREFIX} Failed to send confirmation email`, err)
    return null
  }
}

export async function confirmUserByToken(token?: string | null): Promise<ConfirmationResult> {
  debug('Attempting confirmation with token', { hasToken: Boolean(token) })
  if (!token) {
    return 'missing-token'
  }

  const secret = getAuthSecret()
  if (!secret) {
    debug('Missing AUTH_SECRET when verifying token')
    return 'config-error'
  }

  let payload: ConfirmationTokenPayload | null = null
  try {
    payload = await verifyJwt<ConfirmationTokenPayload>(token, secret)
  } catch (err) {
    console.error(`${DEBUG_PREFIX} JWT verification threw`, err)
    return 'invalid'
  }

  if (!payload) {
    debug('JWT verification returned null')
    return 'invalid'
  }

  if (!payload.sub || payload.purpose !== CONFIRMATION_PURPOSE) {
    debug('JWT payload invalid', { payload })
    return 'invalid'
  }

  debug('Token verified', { userId: payload.sub })

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      debug('User not found for token', { userId: payload.sub })
      return 'missing-user'
    }

    if (user.confirmed) {
      debug('User already confirmed', { userId: user.id })
      return 'success'
    }

    await prisma.user.update({ where: { id: user.id }, data: { confirmed: true } })
    debug('User marked as confirmed', { userId: user.id })
    return 'success'
  } catch (err) {
    console.error(`${DEBUG_PREFIX} Failed to update user`, err)
    return 'invalid'
  }
}

export async function resendConfirmationEmail(user: MinimalUser, origin: string): Promise<ConfirmationResult> {
  debug('Resending confirmation email', { userId: user.id })
  const response = await sendConfirmationEmail({ user, origin })
  if (!response) {
    return 'email-error'
  }
  return 'success'
}

