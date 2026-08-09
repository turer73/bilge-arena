import type { Metadata } from 'next'
import { TeacherInvitationClient } from '@/components/teacher-classroom/teacher-invitation-client'
import { TeacherClassroomClosed } from '@/components/teacher-classroom/teacher-classroom-closed'

export const metadata: Metadata = {
  title: 'Sınıf Daveti',
  robots: { index: false, follow: false },
}

export default function TeacherInvitationPage() {
  if (process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED !== 'true') {
    return <TeacherClassroomClosed />
  }
  return <TeacherInvitationClient />
}
