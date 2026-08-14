import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { InstitutionSyntheticDemo } from '@/components/institution-tracking/institution-synthetic-demo'
import { isInstitutionDemoEnabled } from '@/lib/institution-tracking/demo'

export const metadata: Metadata = {
  title: 'Kurum Sentetik Demo | Bilge Arena',
  robots: { index: false, follow: false },
}

export default function InstitutionDemoPage() {
  if (!isInstitutionDemoEnabled()) notFound()

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
      <InstitutionSyntheticDemo />
    </div>
  )
}
