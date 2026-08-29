import type { Metadata } from 'next'
import { InstitutionTrackingDashboard } from '@/components/institution-tracking/institution-tracking-dashboard'
import { parseInstitutionInitialScope } from './scope-query'

export const metadata: Metadata = {
  title: 'Kurum Paneli | Bilge Arena',
  description: 'Açıklanabilir sınıf ve öğrenci kazanım takibi.',
  robots: { index: false, follow: false },
}

export default async function InstitutionTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[]; exam_ref?: string | string[] }>
}) {
  const initialScope = parseInstitutionInitialScope(await searchParams)

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
      <InstitutionTrackingDashboard initialScope={initialScope} />
    </div>
  )
}
