let cachedSecret: string | null | undefined
let warned = false

const DEV_FALLBACK_SECRET = 'dev-mode-auth-secret'

export function getAuthSecret(): string | null {
  if (cachedSecret !== undefined) return cachedSecret

  const envSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null
  if (envSecret) {
    cachedSecret = envSecret
    return cachedSecret
  }

  if (process.env.NODE_ENV !== 'production') {
    cachedSecret = DEV_FALLBACK_SECRET
    if (!warned) {
      console.warn('AUTH_SECRET missing; using insecure dev fallback. Set AUTH_SECRET to persist sessions and secure tokens.')
      warned = true
    }
    return cachedSecret
  }

  cachedSecret = null
  return cachedSecret
}
