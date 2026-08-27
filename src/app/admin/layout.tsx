import type { Metadata } from 'next'
import { connection } from 'next/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Admin Panel — Bilge Arena',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The private CSP nonce is generated per request in Proxy. Dynamic rendering
  // is therefore required so Next can attach that nonce to framework scripts.
  await connection()

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      {/* Mobilde sidebar drawer (off-canvas) -> tam genislik + hamburger icin ust bosluk.
          lg+'de sabit sidebar icin sol margin. */}
      <main className="flex-1 p-4 pt-16 lg:ml-[220px] lg:p-8 lg:pt-8">
        {children}
      </main>
    </div>
  )
}
