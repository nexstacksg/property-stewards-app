"use client"

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

function ResetPasswordContent() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Reset link is missing or invalid.')
    }
  }, [token])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Unable to reset password')
      }
      showToast({ title: 'Password reset', description: 'You can now sign in with your new password.', variant: 'success' })
      setTimeout(() => router.replace('/login'), 800)
    } catch (err: any) {
      setError(err.message || 'Unable to reset password')
      showToast({ title: 'Reset failed', description: err.message || 'Please try again.', variant: 'error' })
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
            <h1 className="text-xl md:text-2xl font-semibold mt-1">Reset password</h1>
            <p className="text-gray-500 mt-2">
              Enter a new password for your account.
            </p>

            <form onSubmit={onSubmit} className="space-y-5 mt-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <Input className="h-11" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <Input className="h-11" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading || !token} className="w-full h-11 text-white">
                {loading ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>

            <p className="text-sm text-gray-600 mt-6 text-center">
              Back to <a href="/login" className="text-primary hover:underline">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}

