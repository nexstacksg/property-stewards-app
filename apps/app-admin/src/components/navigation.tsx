"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { 
  Home, 
  Users, 
  UserCheck, 
  FileText, 
  ClipboardCheck,
  Calendar,
  Settings,
  Menu,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import BrandLogo from "@/components/brand-logo"

type SessionUser = {
  id: string
  email: string
  role: string
  username?: string
}

const navigationItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: Home
  },
  {
    href: "/customers",
    label: "Customers",
    icon: Users
  },
  {
    href: "/inspectors",
    label: "Inspectors",
    icon: UserCheck
  },
  {
    href: "/contracts",
    label: "Contracts",
    icon: FileText
  },
  {
    href: "/work-orders",
    label: "Work Orders",
    icon: Calendar
  },
  {
    href: "/checklists",
    label: "Checklists",
    icon: ClipboardCheck
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings
  }
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined)
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`Failed to load session: ${res.status}`)
        }
        const data = await res.json()
        if (active) setSessionUser(data.user)
      } catch (err) {
        if (active) setSessionUser(null)
        console.warn('Failed to load session user', err)
      }
    }

    loadSession()

    const onRefresh = (event: any) => {
      const detail = event?.detail
      if (detail && typeof detail === 'object') {
        setSessionUser((prev) => prev ? { ...prev, username: detail.username ?? prev.username, email: detail.email ?? prev.email } : prev)
      }
      loadSession()
    }

    window.addEventListener('ps:session-refresh', onRefresh)

    return () => {
      active = false
      window.removeEventListener('ps:session-refresh', onRefresh)
    }
  }, [])

  const triggerLogout = () => {
    setLogoutError(null)
    setIsLoggingOut(false)
    setIsLogoutDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setIsLogoutDialogOpen(open)
    if (!open) {
      setIsLoggingOut(false)
      setLogoutError(null)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error(`Logout failed: ${res.status}`)
      }
      setIsLogoutDialogOpen(false)
    } catch (err) {
      console.error('Logout failed', err)
      setLogoutError('Unable to log out. Please try again.')
      setIsLoggingOut(false)
      return
    }

    setIsLoggingOut(false)
    setIsMobileMenuOpen(false)
    router.replace('/login')
    router.refresh()
  }

  const displayName = sessionUser?.username && sessionUser.username.length > 0 ? sessionUser.username : 'Signed in'
  const displayEmail = sessionUser?.email && sessionUser.email.length > 0 ? sessionUser.email : '—'

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 w-64 h-full bg-card border-r">
        <div className="p-6">
          <BrandLogo className="w-40" />
          <p className="text-sm text-muted-foreground mt-2">Admin Portal</p>
        </div>
        
        <nav className="flex-1 px-4 pb-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || 
                              (item.href !== "/" && pathname.startsWith(item.href))
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                      isActive 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
          
        <div className="border-t px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
            </div>
            <Button variant="outline" size="sm" onClick={triggerLogout}>
              Log out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center">
            <BrandLogo className="w-40" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background pt-16">
          <nav className="flex h-full flex-col">
            <ul className="flex-1 space-y-2 overflow-y-auto p-4">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || 
                                (item.href !== "/" && pathname.startsWith(item.href))
                
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                        isActive 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="border-t p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { triggerLogout(); setIsMobileMenuOpen(false) }}>
                  Log out
                </Button>
              </div>
            </div>
          </nav>
        </div>
      )}

      <Dialog open={isLogoutDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              You will need to enter your credentials again to access the admin dashboard.
            </DialogDescription>
          </DialogHeader>
          {logoutError && (
            <p className="text-sm text-destructive">{logoutError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogoutDialogOpen(false)} disabled={isLoggingOut}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? 'Signing out…' : 'Yes, sign out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
