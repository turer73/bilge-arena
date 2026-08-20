import type { Metadata } from 'next'
import { InstitutionTrackingDashboard } from '@/components/institution-tracking/institution-tracking-dashboard'

export const metadata: Metadata = {
  title: 'Sınıf Çalışma Alanı | Bilge Arena',
  description: 'Kurum sınıfının öğrenci gelişimi, çalışma programı ve takip çalışma alanı.',
  robots: { index: false, follow: false },
}

export default async function InstitutionClassroomPage({
  params,
}: {
  params: Promise<{ classroomId: string }>
}) {
  const { classroomId } = await params

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
      <InstitutionTrackingDashboard initialClassroomId={classroomId} />
    </div>
  )
}
