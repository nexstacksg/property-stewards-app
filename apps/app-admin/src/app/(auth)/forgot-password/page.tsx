"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import BrandLogo from '@/components/brand-logo'
import { showToast } from '@/lib/toast'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Unable to send reset link')
      }
      setSent(true)
      showToast({ title: 'Reset link sent', description: 'Check your inbox for the password reset link.', variant: 'success' })
    } catch (err: any) {
      setError(err.message || 'Unable to send reset link')
      showToast({ title: 'Request failed', description: err.message || 'Please try again.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-xl">
          <div className="p-8 md:p-10">
            <div className="flex justify-center">
              <BrandLogo className="w-48 md:w-56" priority />
            </div>
            <h1 className="text-xl md:text-2xl font-semibold mt-1">Forgot password</h1>
            <p className="text-gray-500 mt-2">
              Enter your account email and we’ll send you a password reset link.
            </p>

            <form onSubmit={onSubmit} className="space-y-5 mt-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <Input className="h-11" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-white">
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>

            <p className="text-sm text-gray-600 mt-6 text-center">
              Back to <a href="/login" className="text-primary hover:underline">Sign in</a>
            </p>

            {sent && (
              <p className="text-xs text-gray-500 mt-4 text-center">If the email is associated with an account, a reset link has been sent.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
