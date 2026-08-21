import type { Metadata } from 'next'
import { InstitutionTrackingDashboard } from '@/components/institution-tracking/institution-tracking-dashboard'

export const metadata: Metadata = {
  title: 'Sınıf Çalışma Alanı | Bilge Arena',
  description: 'Kurum sınıfının öğrenci gelişimi, çalışma programı ve takip çalışma alanı.',
  robots: { index: false, follow: false },
}

export default async function InstitutionClassroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ classroomId: string }>
  searchParams: Promise<{ ogrenci?: string | string[] }>
}) {
  const { classroomId } = await params
  const query = await searchParams
  const initialMemberRef = typeof query.ogrenci === 'string' && /^[0-9a-f]{32}$/.test(query.ogrenci)
    ? query.ogrenci
    : undefined

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
      <InstitutionTrackingDashboard initialClassroomId={classroomId} initialMemberRef={initialMemberRef} />
    </div>
  )
}
