"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
import { useState } from "react"

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 w-64 h-full bg-card border-r">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">Property Stewards</h1>
          <p className="text-sm text-muted-foreground mt-1">Admin Portal</p>
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
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold text-primary">Property Stewards</h1>
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
          <nav className="p-4">
            <ul className="space-y-2">
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
          </nav>
        </div>
      )}
    </>
  )
}