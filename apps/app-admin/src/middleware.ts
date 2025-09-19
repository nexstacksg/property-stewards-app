import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/jwt'
import { getAuthSecret } from '@/lib/auth-secret'

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/confirm',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths and Next internals
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isNextAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.startsWith('/public')
  const isAuthApi = pathname.startsWith('/api/auth')
  if (isPublic || isNextAsset || isAuthApi) {
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
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|_next|favicon.ico|public).*)'],
}
