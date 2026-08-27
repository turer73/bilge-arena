import { headers } from 'next/headers'
import { TEACHER_INVITE_BOOTSTRAP_SCRIPT } from '@/lib/teacher-classroom/invite-bootstrap'

export default async function TeacherInviteLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <>
      {/* Capture and scrub the fragment before the invite client hydrates. */}
      <script
        id="teacher-invite-bootstrap"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: TEACHER_INVITE_BOOTSTRAP_SCRIPT }}
      />
      {children}
    </>
  )
}
