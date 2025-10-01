"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UserSummary } from "./types"

interface UserAccountFormProps {
  user: UserSummary | null
}

export function UserAccountForm({ user }: UserAccountFormProps) {
  const [username, setUsername] = useState(user?.username ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [newPassword, setNewPassword] = useState("")

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        No administrator profile detected. Add an admin user first.
      </p>
    )
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
          <Button size="sm">Save Account Changes</Button>
          <Button size="sm" variant="outline">
            Send Password Reset Email
          </Button>
        </div>
      </div>
    </div>
  )
}
