import crypto from 'crypto'

const SALT_BYTES = 16
const KEYLEN = 64
const N = 16384
const R = 8
const P = 1

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES)
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const Np = parseInt(parts[1], 10)
    const r = parseInt(parts[2], 10)
    const p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'base64')
    const expected = Buffer.from(parts[5], 'base64')
    const hash = crypto.scryptSync(password, salt, expected.length, { N: Np, r, p })
    return crypto.timingSafeEqual(hash, expected)
  } catch {
    return false
  }
}

