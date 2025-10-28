import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/jwt'
import { getAuthSecret } from '@/lib/auth-secret'

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/confirm',
  '/forgot-password',
  '/reset-password',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths and Next internals
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isNextAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.startsWith('/public')
  const isAuthApi = pathname.startsWith('/api/auth')
  const isApiRoute = pathname.startsWith('/api')
  if (isPublic || isNextAsset || isAuthApi || isApiRoute) {
    return NextResponse.next()
  }

  const token = req.cookies.get('session')?.value
  const secret = getAuthSecret()
  if (!token || !secret) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  const payload = await verifyJwt(token, secret)
  if (!payload) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    const res = NextResponse.redirect(url)
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  // Validate that the user still exists in DB via server route.
  // In self-hosted/proxy setups, outbound requests from middleware to the public
  // origin can be blocked or DNS can fail. We only force-logout on explicit 401
  // responses; other failures are treated as soft failures (allowing the request),
  // since server pages revalidate sessions again.
  try {
    const validateUrl = new URL('/api/auth/validate', req.url)
    const validateRes = await fetch(validateUrl, {
      headers: { cookie: req.headers.get('cookie') || '' },
      cache: 'no-store',
    })
    if (validateRes.status === 401) {
      const url = new URL('/login', req.url)
      url.searchParams.set('next', pathname)
      url.searchParams.set('logout', 'missing-user')
      const res = NextResponse.redirect(url)
      res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
      return res
    }
    // For non-401 errors (e.g., 500) or network issues, let the request proceed.
  } catch (err) {
    // Soft-fail: proceed without blocking, but emit a console for observability
    console.warn('[middleware] validate check failed; proceeding without hard logout', { error: String(err) })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|_next|favicon.ico|public).*)'],
}
