'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const messages: Record<string, string> = {
  success: 'Your email is confirmed. Redirecting you to sign in…',
  invalid: 'Confirmation link was invalid or expired. Redirecting you to request a new one…',
  'missing-user': 'We could not find your account. Redirecting you to contact support…',
  'server-error': 'We hit a server issue validating your confirmation. Redirecting you to sign in…',
}

const destinations: Record<string, string> = {
  success: '/login?confirmation=success',
  invalid: '/login?confirmation=invalid',
  'missing-user': '/login?confirmation=missing-user',
  'server-error': '/login?confirmation=server-error',
}

type ConfirmRedirectProps = {
  status: string
  debug?: {
    rawResult: string
    token?: string
  }
}

export function ConfirmRedirect({ status, debug }: ConfirmRedirectProps) {
  const router = useRouter()

  useEffect(() => {
    const target = destinations[status] ?? '/login?confirmation=invalid'
    console.info('[confirm-page] redirecting', { target, status, debug })
    const timer = setTimeout(() => {
      router.replace(target)
    }, 300)

    return () => clearTimeout(timer)
  }, [router, status, debug])

  const message = messages[status] ?? messages.invalid

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md mx-auto bg-white shadow-lg rounded-xl p-6 text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Email Confirmation</h1>
        <p className="text-gray-600">{message}</p>
        {debug && (
          <div className="text-left text-xs text-gray-400 bg-gray-100 rounded-md p-3 space-y-1">
            <div><span className="font-medium">Result:</span> {debug.rawResult}</div>
            {debug.token && (
              <div><span className="font-medium">Token preview:</span> {debug.token}</div>
            )}
          </div>
        )}
        <p className="text-sm text-gray-400">
          If nothing happens automatically, <a className="text-primary hover:underline" href="/login">click here to continue.</a>
        </p>
      </div>
    </div>
  )
}

