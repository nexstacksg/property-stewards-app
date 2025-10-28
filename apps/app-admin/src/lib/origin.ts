import type { NextRequest } from 'next/server'

function normalizeOrigin(value: string): string {
  let v = value.trim()
  if (!v) return ''
  if (!/^https?:\/\//i.test(v)) {
    v = `https://${v}`
  }
  // Remove trailing slash
  v = v.replace(/\/$/, '')
  return v
}

/**
 * Resolve the external origin for building absolute URLs (emails, redirects).
 * Priority:
 * 1) APP_URL
 * 2) NEXT_PUBLIC_APP_URL
 * 3) VERCEL_URL (hostname) -> https://VERCEL_URL
 * 4) X-Forwarded-Proto + X-Forwarded-Host
 * 5) Host header + assume https
 * 6) req.nextUrl.origin
 */
export function getRequestOrigin(req: NextRequest): string {
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return normalizeOrigin(envUrl)

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return normalizeOrigin(vercelUrl)

  const xfProto = req.headers.get('x-forwarded-proto') || ''
  const xfHost = req.headers.get('x-forwarded-host') || ''
  if (xfHost) {
    const scheme = (xfProto || 'https').split(',')[0].trim() || 'https'
    return normalizeOrigin(`${scheme}://${xfHost.split(',')[0].trim()}`)
  }

  const host = req.headers.get('host')
  if (host) return normalizeOrigin(host)

  return normalizeOrigin(req.nextUrl.origin)
}

