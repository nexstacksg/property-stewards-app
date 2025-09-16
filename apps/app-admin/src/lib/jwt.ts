// Lightweight JWT (HS256) using Web Crypto; edge-safe for middleware
// Avoids external deps; relies on getAuthSecret() providing a secret.

type JWTPayload = Record<string, unknown> & { exp?: number }

const textEncoder = new TextEncoder()

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const b64 = typeof btoa !== 'undefined'
    ? btoa(String.fromCharCode(...bytes))
    : Buffer.from(bytes).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
  const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function signJwt(payload: JWTPayload, secret: string, expiresInSeconds = 60 * 60 * 24): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, exp: (payload.exp as number | undefined) ?? now + expiresInSeconds }
  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(body))
  const data = `${headerB64}.${payloadB64}`
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data))
  const sigB64 = base64url(new Uint8Array(sig))
  return `${data}.${sigB64}`
}

export async function verifyJwt<T extends JWTPayload = JWTPayload>(token: string, secret: string): Promise<T | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const data = `${headerB64}.${payloadB64}`
  const key = await importKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64url(sigB64), textEncoder.encode(data))
  if (!valid) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(payloadB64))) as T
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export type { JWTPayload }
