import { NextResponse, type NextRequest } from 'next/server'


function isPublicPath(pathname: string) {
  // Public/auth routes and static assets
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/static')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname === '/login') return true
  if (pathname === '/signup' || pathname.startsWith('/signup')) return true
  if (pathname === '/forgot-password') return true
  if (pathname === '/reset-password') return true
  if (pathname === '/confirm' || pathname.startsWith('/confirm')) return true
  if (pathname.startsWith('/(auth)')) return true
  return false
}

export async function middleware(req: NextRequest) {
  const { nextUrl } = req
  const pathname = nextUrl.pathname

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const session = req.cookies.get('session')?.value
  if (!session) return NextResponse.next()

  // Always check for protected paths when a session cookie exists

  // Validate session against DB via existing API (avoids Prisma in middleware)
  try {
    const validateUrl = new URL('/api/auth/validate', nextUrl.origin)
    const res = await fetch(validateUrl, {
      method: 'GET',
      headers: {
        // forward incoming cookies so API can read the session
        cookie: req.headers.get('cookie') || ''
      },
    })

    if (!res.ok) {
      // Invalidate session and redirect to login
      const loginUrl = new URL('/login', nextUrl.origin)
      const redirect = NextResponse.redirect(loginUrl)
      redirect.cookies.set('session', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      })
      return redirect
    }

    return NextResponse.next()
  } catch {
    // In case of network or unexpected error, allow navigation (fail-open)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // Run for all app paths except static assets
    '/((?!_next|static|.*\\..*).*)',
  ],
}
