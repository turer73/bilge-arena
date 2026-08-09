import type { Metadata } from 'next'
import { TeacherClassroomPanel } from '@/components/teacher-classroom/teacher-classroom-panel'
import { TeacherClassroomClosed } from '@/components/teacher-classroom/teacher-classroom-closed'

export const metadata: Metadata = {
  title: 'Öğretmen Sınıf Paneli',
  robots: { index: false, follow: false },
}

export default function TeacherClassroomPanelPage() {
  if (process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED !== 'true') {
    return <TeacherClassroomClosed />
  }
  return <TeacherClassroomPanel />
}
