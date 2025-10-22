"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UserSummary } from "./types"
import { showToast } from "@/lib/toast"

interface UserAccountFormProps {
  user: UserSummary | null
}

export function UserAccountForm({ user }: UserAccountFormProps) {
  const [username, setUsername] = useState(user?.username ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [newPassword, setNewPassword] = useState("")
  const [saving, setSaving] = useState(false)

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        No administrator profile detected. Add an admin user first.
      </p>
    )
  }

  const handleSave = async () => {
    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()
    const trimmedPassword = newPassword.trim()

    if (!trimmedUsername) {
      showToast({ title: 'Username is required', variant: 'error' })
      return
    }
    if (!/.+@.+\..+/.test(trimmedEmail)) {
      showToast({ title: 'Enter a valid email', variant: 'error' })
      return
    }
    if (trimmedPassword && trimmedPassword.length < 8) {
      showToast({ title: 'Password must be at least 8 characters', variant: 'error' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, email: trimmedEmail, password: trimmedPassword })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update account')
      }

      const data = await response.json()
      const updated: UserSummary | undefined = data?.user
      if (updated) {
        setUsername(updated.username)
        setEmail(updated.email)
        setNewPassword('')
        // Notify other client components (e.g., sidebar) to refresh
        try {
          const event = new CustomEvent('ps:session-refresh', { detail: { username: updated.username, email: updated.email } })
          window.dispatchEvent(event)
        } catch {}
      }
      showToast({ title: 'Account updated', variant: 'success' })
    } catch (error) {
      showToast({ title: 'Failed to update', description: error instanceof Error ? error.message : undefined, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white/80 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-username">Username</Label>
            <Input
              id="account-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              This name appears in audit logs and PDF exports.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used for login credentials and notification delivery.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="account-password">New Password</Label>
            <Input
              id="account-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Generate a new password or leave blank"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Account Changes'}
          </Button>
         
        </div>
      </div>
    </div>
  )
}
