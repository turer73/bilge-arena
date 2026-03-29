import type { Metadata } from 'next'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Admin Panel — Bilge Arena',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="ml-[220px] flex-1 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
