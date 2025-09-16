"use client"

import { usePathname } from 'next/navigation'
import { Navigation } from '@/components/navigation'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/signup')

  if (isAuth) return <div className="min-h-screen">{children}</div>

  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="lg:pl-64">
        <div className="min-h-screen pt-16 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  )
}
