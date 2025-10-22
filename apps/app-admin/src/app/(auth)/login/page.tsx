"use client"
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'



function LoginPageContent() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/'
  const logoutFlag = search.get('logout')
  const confirmationState = search.get('confirmation')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmationMessage = confirmationState === 'success'
    ? 'Email confirmed. You can sign in now.'
    : confirmationState === 'invalid'
      ? 'Confirmation link was invalid or expired. Request a new signup.'
      : confirmationState === 'missing-user'
        ? 'Account could not be found. Contact support if this persists.'
        : confirmationState === 'server-error'
          ? 'We could not validate your confirmation due to a server configuration issue. Please contact support.'
          : null

  // If we were force-redirected due to invalid/missing user, clear client storage
  useEffect(() => {
    if (logoutFlag) {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage?.clear?.()
          window.sessionStorage?.clear?.()
        }
      } catch {/* ignore */}
    }
  }, [logoutFlag])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Login failed')
      }
      router.replace(next)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-xl">
          <div className="p-8 md:p-10">
            <div className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">propertySteward</div>
            <h1 className="text-xl md:text-2xl font-semibold mt-1">Welcome</h1>
            <p className="text-gray-500 mt-2">
              Please enter your email and password to access your admin dashboard.
            </p>

                <form onSubmit={onSubmit} className="space-y-5 mt-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <Input className="h-11" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <Input className="h-11" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 rounded" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                      Remember for 30 days
                    </label>
                    <a className="text-primary hover:underline" href="/forgot-password">Forgot password</a>
                  </div>
                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}
                  {confirmationMessage && (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                      {confirmationMessage}
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full h-11 text-white">
                    {loading ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>
            <p className="text-sm text-gray-600 mt-6 text-center">
              Don't have an account? <a href="/signup" className="text-primary hover:underline">Sign up</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageContent />
    </Suspense>
  )
}
