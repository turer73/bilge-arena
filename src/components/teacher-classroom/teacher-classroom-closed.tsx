import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import { LockKeyhole } from 'lucide-react'

export function TeacherClassroomClosed() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <LockKeyhole className="mx-auto h-10 w-10 text-[var(--focus)]" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-black">Sınıf pilotu henüz kapalı</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
        Öğretmen sınıfları, hukuki ve teknik pilot kapıları tamamlandıktan sonra açılacak.
      </p>
      <Link
        href="/arena"
        className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        Arena&apos;ya dön
      </Link>
    </div>
  )
}
