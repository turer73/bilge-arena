import type { Metadata } from 'next'
import { StudentClassroomDashboard } from '@/components/teacher-classroom/student-classroom-dashboard'
import { TeacherClassroomClosed } from '@/components/teacher-classroom/teacher-classroom-closed'

export const metadata: Metadata = {
  title: 'Sınıflarım ve Ödevlerim',
  description: 'Katıldığın öğretmen sınıflarını ve sana atanmış ödevleri güvenli biçimde görüntüle.',
  robots: { index: false, follow: false },
}

export default function StudentClassroomPage() {
  if (process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED !== 'true') {
    return <TeacherClassroomClosed />
  }
  return <StudentClassroomDashboard />
}
