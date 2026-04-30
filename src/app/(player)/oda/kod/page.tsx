/**
 * Bilge Arena Oda: /oda/kod join page
 * Sprint 1 PR4b Task 7
 *
 * Server Component shell (parent (player) layout auth guard yapar).
 * <JoinRoomForm> client component'i useActionState ile joinRoomAction
 * Server Action'i cagirir.
 */

import Link from 'next/link'
import { JoinRoomForm } from '@/components/oda/JoinRoomForm'

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
        <h1 className="mt-2 text-xl font-bold">Kod ile Katıl</h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          Arkadaşının paylaştığı 6 karakterli oda kodunu yaz.
        </p>
      </header>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <JoinRoomForm />
      </div>
    </>
  )
}
