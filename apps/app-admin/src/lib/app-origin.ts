import type { NextRequest } from 'next/server'

// Determine the external origin for building absolute links in emails.
// Priority:
// 1) APP_ORIGIN (recommended)
// 2) NEXT_PUBLIC_SITE_URL / SITE_URL
// 3) VERCEL_URL (needs https:// prefix)
// 4) Request headers (x-forwarded-proto/host) or req.nextUrl.origin

export function getAppOrigin(req?: NextRequest): string {
  const envOrigin =
    process.env.APP_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    undefined

  if (envOrigin) return stripTrailingSlash(envOrigin)

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${stripTrailingSlash(vercelUrl)}`

  // Derive from request headers when available
  const proto = req?.headers.get('x-forwarded-proto') || 'https'
  const host = req?.headers.get('x-forwarded-host') || req?.headers.get('host')

  if (host) return `${proto}://${stripTrailingSlash(host)}`

  // Fallback to req.nextUrl.origin if present
  const origin = req?.nextUrl?.origin
  if (origin) return stripTrailingSlash(origin)

  // Last resort
  return 'http://localhost:3000'
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

export default getAppOrigin

