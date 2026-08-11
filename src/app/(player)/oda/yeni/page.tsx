import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreateRoomForm } from '@/components/oda/CreateRoomForm'
import { createClient } from '@/lib/supabase/server'

/**
 * Bilge Arena Oda: /oda/yeni form sayfasi
 * Sprint 1 PR4a Task 5 + 2026-05-03 auth path-preserve fix (Codex P1 PR #89)
 *
 * Auth guard kendi sayfasinda — layout artik global redirect yapmiyor cunku
 * pathname'i bilemez. Login sonrasi /oda/yeni'ye geri donmek icin spesifik
 * redirect query parametresi gerek.
 */
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/giris?redirect=/oda/yeni')

  return (
    <>
      <header className="mb-6">
        <Link
          href="/oda"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
          aria-label="Odalarım sayfasına dön"
        >
          <span aria-hidden="true">←</span>
          <span>Odalarıma Dön</span>
        </Link>
        <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--growth-text)]">
          ODA KUR
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          Bir ayar seç, arkadaşlarını davet et
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-sub)]">
          Hazır seçeneklerden biriyle saniyeler içinde başla. Tüm ayrıntıları
          daha sonra değiştirebilirsin.
        </p>
      </header>
      <CreateRoomForm />
    </>
  )
}
