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
  if (!token) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // If secret is present, verify locally; otherwise defer to server validation below
  if (secret) {
    const payload = await verifyJwt(token, secret)
    if (!payload) {
      const url = new URL('/login', req.url)
      url.searchParams.set('next', pathname)
      const res = NextResponse.redirect(url)
      res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
      return res
    }
  }

  // Validate that the user still exists in DB via server route.
  // In self-hosted/proxied environments, internal fetch to the public URL can fail.
  // Allow opting into strict failure via AUTH_VALIDATE_STRICT=true.
  const strictValidate = (process.env.AUTH_VALIDATE_STRICT || '').toLowerCase() === 'true'
  try {
    const validateUrl = new URL('/api/auth/validate', req.url)
    const validateRes = await fetch(validateUrl, { headers: { cookie: req.headers.get('cookie') || '' } })
    if (!validateRes.ok) {
      const url = new URL('/login', req.url)
      url.searchParams.set('next', pathname)
      url.searchParams.set('logout', 'missing-user')
      const res = NextResponse.redirect(url)
      res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
      return res
    }
  } catch (err) {
    // Network error reaching validate API. In non-strict mode, allow request.
    if (strictValidate) {
      const url = new URL('/login', req.url)
      url.searchParams.set('next', pathname)
      const res = NextResponse.redirect(url)
      res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
      return res
    }
    console.warn('Middleware: validate fetch failed; proceeding (set AUTH_VALIDATE_STRICT=true to fail)', err)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|_next|favicon.ico|public).*)'],
}
