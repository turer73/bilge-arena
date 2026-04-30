import Link from 'next/link'
import { CreateRoomForm } from '@/components/oda/CreateRoomForm'

/**
 * Bilge Arena Oda: /oda/yeni form sayfasi
 * Sprint 1 PR4a Task 5
 *
 * Auth guard parent layout'tan geliyor. Server Component shell, form
 * client component (useActionState).
 */
export default function Page() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/oda"
          className="text-sm text-[var(--text-sub)] hover:underline"
        >
          ← Odalarım
        </Link>
        <h1 className="mt-2 text-xl font-bold">Yeni Oda</h1>
      </header>
      <CreateRoomForm />
    </>
  )
}
