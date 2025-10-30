"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import BrandLogo from '@/components/brand-logo'

export default function SignupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setSuccess(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j.error || 'Signup failed')
      }
      setSuccess(j.message || 'Account created. Check your email to confirm your address.')
      setUsername('')
      setEmail('')
      setPassword('')
    } catch (err: any) {
      setError(err.message || 'Signup failed')
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
            <h1 className="text-xl md:text-2xl font-semibold mt-1">Welcome</h1>
            <p className="text-gray-500 mt-2">
              Please enter your details to create your admin account.
            </p>

                <form onSubmit={onSubmit} className="space-y-5 mt-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <Input className="h-11" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <Input className="h-11" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <Input className="h-11" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                      {success}{' '}
                      <button type="button" className="font-semibold text-primary underline" onClick={() => router.replace('/login')}>
                        Go to sign in
                      </button>
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full h-11 text-white">
                    {loading ? 'Creating…' : 'Sign up'}
                  </Button>
                </form>

            <p className="text-sm text-gray-600 mt-6 text-center">
              Already have an account? <a href="/login" className="text-primary hover:underline">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
