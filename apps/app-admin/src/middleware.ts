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

  // Skip network validation in middleware to avoid proxy/DNS issues in
  // self-hosted environments. Server routes/pages will revalidate as needed.

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|_next|favicon.ico|public).*)'],
}
