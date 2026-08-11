/**
 * Bilge Arena Oda: /oda/kod join page
 * Sprint 1 PR4b Task 7 + 2026-05-03 auth path-preserve fix (Codex P1 PR #89)
 *
 * Auth guard kendi sayfasinda — layout artik global redirect yapmiyor cunku
 * pathname'i bilemez. Marketing sayfasindan "Odaya Katil" CTA buraya gelir;
 * anonim kullanici /giris'e yonlendirilince login sonrasi /oda/kod'a doner
 * (eskisi gibi /oda'ya degil — niyet korunur).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { JoinRoomForm } from '@/components/oda/JoinRoomForm'
import { createClient } from '@/lib/supabase/server'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/giris?redirect=/oda/kod')

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
        <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--wisdom-text)]">
          KODLA KATIL
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          Arkadaşının odasına gir
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          Paylaşılan 6 karakterli kodu yaz. Büyük-küçük harf fark etmez.
        </p>
      </header>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
        <JoinRoomForm />
      </div>
    </>
  )
}
