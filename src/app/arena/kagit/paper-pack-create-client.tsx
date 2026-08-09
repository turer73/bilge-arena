'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileDown, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import type { GameSlug } from '@/lib/constants/games'
import { issuePaperPack } from '@/lib/paper-mode/client'
import { useAuthStore } from '@/stores/auth-store'

export function PaperPackCreateClient({
  game,
  examRef,
}: {
  game: GameSlug
  examRef: 'TYT' | 'LGS' | 'AYT-SAY' | 'AYT-EA' | 'AYT-SOZ' | null
}) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuthStore()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(false)
  const requestRef = useRef<{ planKey: string; requestId: string } | null>(null)

  const create = async () => {
    if (creating) return
    setCreating(true)
    setError(false)
    const planKey = `${game}:${examRef ?? 'general'}`
    const requestId = requestRef.current?.planKey === planKey
      ? requestRef.current.requestId
      : crypto.randomUUID()
    requestRef.current = { planKey, requestId }
    try {
      const result = await issuePaperPack({ game, examRef, requestId })
      router.push(`/arena/kagit/${result.packId}`)
    } catch {
      setError(true)
    } finally {
      setCreating(false)
    }
  }

  if (authLoading) {
    return <div role="status" className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Hesabın yükleniyor...</div>
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-[var(--focus)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Giriş yapman gerekiyor</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Kağıt paketi yalnız sana ait günlük plandan hazırlanır.</p>
        <Link href="/giris" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-xl px-7 text-sm font-bold">Giriş yap</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-10">
      <Link href="/arena/calisma" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10">← Çalışmaya dön</Link>
      <section className="mt-3 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-4 md:px-7">
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">BUGÜNÜN 15&apos;İ · KAĞIT/PDF</p>
          <h1 className="mt-1 text-2xl font-black">Ekrandan uzak çalış</h1>
        </div>
        <div className="space-y-5 p-5 md:p-7">
          <p className="text-sm leading-7 text-[var(--text-sub)]">
            Bugünkü <strong className="text-[var(--text)]">{game}</strong>{examRef ? ` · ${examRef}` : ''} planın,
            yazdırılabilir soru paketi ve optik forma dönüştürülür. Tarayıcının “PDF olarak kaydet” seçeneğini de kullanabilirsin.
          </p>

          <ul className="grid gap-3 text-sm leading-6 sm:grid-cols-2">
            <li className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <FileDown className="mb-2 h-5 w-5 text-[var(--focus)]" aria-hidden="true" />
              Soru, seçenek, optik form ve yalnız cevap sayfasını açan QR.
            </li>
            <li className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <ShieldCheck className="mb-2 h-5 w-5 text-[var(--growth)]" aria-hidden="true" />
              Paket sadece hesabına açıktır; uygulama önbelleğine özel sayfa kaydedilmez.
            </li>
          </ul>

          <div className="rounded-2xl border border-[var(--reward)]/30 bg-[var(--reward)]/5 p-4 text-sm leading-6">
            <strong>Ödülsüz öğrenme kanıtı:</strong> Kağıttan aktarılan cevaplar temel hâkimiyet tahminine 0,5 ağırlıkla katkı verir; XP, coin, görev, seri, rozet ve sıralama puanı vermez.
          </div>

          <button type="button" onClick={() => void create()} disabled={creating} className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60">
            <FileDown className="h-5 w-5" aria-hidden="true" />
            {creating ? 'Paket hazırlanıyor...' : 'Bugünkü paketi hazırla'}
          </button>
          {error && (
            <div role="alert" className="rounded-xl border border-[var(--urgency)]/30 bg-[var(--urgency)]/5 p-4 text-sm">
              <p>Paket hazırlanamadı. Bugünkü planın henüz oluşmamış veya geçici bir bağlantı sorunu olabilir.</p>
              <button type="button" onClick={() => void create()} disabled={creating} className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-[var(--focus)]">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Aynı isteği yeniden dene
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
