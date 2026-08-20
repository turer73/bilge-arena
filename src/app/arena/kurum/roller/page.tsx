import type { Metadata } from 'next'
import { InstitutionRoleManager } from '@/components/institution-tracking/institution-role-manager'

export const metadata: Metadata = {
  title: 'Kurum Rolleri | Bilge Arena',
  description: 'Kuruma özel personel rolleri ve yetkilendirme.',
  robots: { index: false, follow: false },
}
export default function InstitutionRolesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
      <InstitutionRoleManager />
    </div>
  )
}
