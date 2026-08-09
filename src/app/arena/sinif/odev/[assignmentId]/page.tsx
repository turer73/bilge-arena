import type { Metadata } from 'next'
import { z } from 'zod'
import { StudentAssignmentClient } from '@/components/teacher-classroom/student-assignment-client'
import { TeacherClassroomClosed } from '@/components/teacher-classroom/teacher-classroom-closed'

export const metadata: Metadata = {
  title: 'Sınıf Ödevi',
  robots: { index: false, follow: false },
}

export default async function StudentAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  if (process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED !== 'true') {
    return <TeacherClassroomClosed />
  }
  const assignmentId = z.string().uuid().safeParse((await params).assignmentId)
  if (!assignmentId.success) return <TeacherClassroomClosed />
  return <StudentAssignmentClient assignmentId={assignmentId.data} />
}
