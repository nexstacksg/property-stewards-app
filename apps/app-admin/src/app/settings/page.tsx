import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Bell,
  Database,
  Globe,
  Lock,
  Palette,
  Shield,
  Siren,
  Users
} from "lucide-react"

const quickLinks = [
  {
    title: "Profile & Access",
    description: "Manage admin profile, password, and MFA preferences.",
    icon: Users,
    cta: "Open"
  },
  {
    title: "Notifications",
    description: "Configure system alerts and escalations for inspections.",
    icon: Bell,
    cta: "Configure"
  },
  {
    title: "Appearance",
    description: "Tweak theme colors and dashboard density preferences.",
    icon: Palette,
    cta: "Customize"
  }
]

const systemSettings = [

  {
    title: "Integrations",
    description: "Linked services such as calendar sync, WhatsApp, and email.",
    icon: Siren,
  },
  {
    title: "Regional",
    description: "Default currency, locale formats, and SMS templates.",
    icon: Globe,
  },
  {
    title: "Data Backup",
    description: "Download inspection archives or schedule automated backups.",
    icon: Database,
  },
  {
    title: "Privacy",
    description: "Review retention policies and redaction options.",
    icon: Lock,
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6 bg-slate-50/60 p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold leading-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure account preferences, notifications, and deployment policies.
            </p>
          </div>
        </div>
        <Badge variant="secondary">Admin access</Badge>
      </header>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Quick Preferences</CardTitle>
          <CardDescription>Common actions and personal settings for administrators.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {quickLinks.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                  <Button className="mt-4" size="sm" variant="secondary">
                    {item.cta}
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>System Management</CardTitle>
          <CardDescription>Workspace wide settings that affect all inspectors and customers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {systemSettings.map((item, index) => {
              const Icon = item.icon
              return (
                <div key={item.title}>
                  <div className="flex items-start justify-between gap-6 rounded-lg border bg-white/90 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-1 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-base font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Manage</Button>
                  </div>
                  {index < systemSettings.length - 1 && <div className="my-3 h-px bg-border" />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Support</CardTitle>
          <CardDescription>Need changes beyond the admin console? Our team can help.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Reach out to Property Stewards support for workspace migrations, onboarding, or billing updates.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Documentation</Button>
            <Button>Contact Support</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
