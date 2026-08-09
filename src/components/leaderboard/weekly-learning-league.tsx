'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Clock3, LockKeyhole, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { useSocialLeague } from '@/lib/hooks/use-social-league'
import type { SocialLeagueResult } from '@/lib/social-league/server-contract'

const TIER_LABELS: Record<NonNullable<SocialLeagueResult['week']>['tier'], string> = {
  bronz: 'Bronz',
  gumus: 'Gümüş',
  altin: 'Altın',
  elmas: 'Elmas',
}

function LeagueAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? (
    <Image
      src={avatarUrl}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-black text-[var(--text-sub)]"
    >
      {name.slice(0, 1).toLocaleUpperCase('tr-TR')}
    </span>
  )
}

function PrivacyNote() {
  return (
    <div className="flex gap-2 rounded-xl bg-[var(--bg-secondary)] p-3 text-xs leading-relaxed text-[var(--text-sub)]">
      <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--focus)]" />
      <p>
        Başka oyuncuların düşme bölgesi gizlidir. Puan yalnız doğrulanmış öğrenmeden gelir;
        oturum başına 15, gün başına 30 puanla sınırlıdır.
      </p>
    </div>
  )
}

interface WeeklyLearningLeagueViewProps {
  result: SocialLeagueResult | null
  loading: boolean
  updating: boolean
  error: string | null
  refresh: () => Promise<void>
  updatePreference: (optedIn: boolean) => Promise<boolean>
}

export function WeeklyLearningLeague() {
  const league = useSocialLeague()
  return <WeeklyLearningLeagueView {...league} />
}

export function WeeklyLearningLeagueView({
  result,
  loading,
  updating,
  error,
  refresh,
  updatePreference,
}: WeeklyLearningLeagueViewProps) {
  const [consentChecked, setConsentChecked] = useState(false)

  if (loading) {
    return (
      <section
        aria-labelledby="relative-league-heading"
        aria-busy="true"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="relative-league-heading" className="font-display text-lg font-black">
          Yakın Rakip Ligi
        </h2>
        <p className="mt-3 animate-pulse text-sm text-[var(--text-muted)]">Lig bilgisi yükleniyor…</p>
      </section>
    )
  }

  if (!result) {
    return (
      <section
        aria-labelledby="relative-league-heading"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="relative-league-heading" className="font-display text-lg font-black">
          Yakın Rakip Ligi
        </h2>
        <p role="alert" className="mt-2 text-sm text-[var(--urgency-text)]">
          {error ?? 'Lig bilgisi şu anda alınamıyor.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 min-h-11 rounded-xl bg-[var(--focus)] px-4 text-sm font-bold text-white"
        >
          Tekrar dene
        </button>
      </section>
    )
  }

  const week = result.week

  return (
    <section
      aria-labelledby="relative-league-heading"
      className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]"
    >
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--focus-bg)] text-[var(--focus)]">
            <Users aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h2 id="relative-league-heading" className="font-display text-lg font-black">
              Yakın Rakip Ligi
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)] sm:text-sm">
              Seviyene yakın 20–30 kişiyle, yalnız doğrulanmış öğrenme puanlarıyla yarış.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5" aria-live="polite">
        {result.status === 'opted_out' && !week ? (
          <>
            <div className="flex gap-3 rounded-xl border border-[var(--border)] p-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--growth-text)]" />
              <p className="text-sm leading-relaxed text-[var(--text-sub)]">
                Katılım isteğe bağlıdır. Katılırsan profil adın ve avatarın yalnız haftalık yakın
                rakiplerine ve olumlu öğrenme spotlarına görünür; ham XP bu ligi etkilemez.
              </p>
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-[var(--bg-secondary)] p-3 text-sm">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(event) => setConsentChecked(event.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--focus)]"
              />
              <span>Haftalık lig ve olumlu öğrenme spotlarında adımın ve avatarımın yakın rakiplere gösterilmesini kabul ediyorum.</span>
            </label>
            <button
              type="button"
              disabled={!consentChecked || updating}
              onClick={() => void updatePreference(true)}
              className="min-h-11 w-full rounded-xl bg-[var(--focus)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating ? 'Kaydediliyor…' : 'Gelecek haftanın ligine katıl'}
            </button>
          </>
        ) : result.status === 'waiting' && !week ? (
          <>
            <div className="flex gap-3 rounded-xl bg-[var(--focus-bg)] p-4">
              <Clock3 aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--focus)]" />
              <div>
                <h3 className="text-sm font-bold">Yakın rakiplerin hazırlanıyor</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-sub)]">
                  Son 28 günlük doğrulanmış çalışmalarına göre ilk uygun Pazartesi kohortuna alınacaksın.
                </p>
              </div>
            </div>
            <PrivacyNote />
            <button
              type="button"
              disabled={updating}
              onClick={() => void updatePreference(false)}
              className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-sub)] disabled:opacity-50"
            >
              {updating ? 'Kaydediliyor…' : 'Katılım isteğini geri çek'}
            </button>
          </>
        ) : week ? (
          <>
            <div className="grid grid-cols-3 gap-2" aria-label="Kişisel lig özeti">
              <div className="rounded-xl bg-[var(--bg-secondary)] p-3 text-center">
                <span className="block text-[10px] font-bold tracking-wide text-[var(--text-muted)]">KADEME</span>
                <strong className="mt-1 block text-sm">{TIER_LABELS[week.tier]}</strong>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] p-3 text-center">
                <span className="block text-[10px] font-bold tracking-wide text-[var(--text-muted)]">SIRAN</span>
                <strong className="mt-1 block text-sm">{week.rank ? `#${week.rank}` : '—'}</strong>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] p-3 text-center">
                <span className="block text-[10px] font-bold tracking-wide text-[var(--text-muted)]">PUAN</span>
                <strong className="mt-1 block text-sm text-[var(--focus-text)]">{week.points}</strong>
              </div>
            </div>

            {week.zone === 'promotion' && (
              <p className="flex items-center gap-2 rounded-xl bg-[var(--growth-bg)] p-3 text-sm font-semibold text-[var(--growth-text)]">
                <TrendingUp aria-hidden="true" className="h-4 w-4" /> Yükselme bölgesindesin.
              </p>
            )}
            {week.zone === 'demotion' && (
              <p className="rounded-xl bg-[var(--urgency-bg)] p-3 text-sm font-semibold text-[var(--urgency-text)]">
                Düşme bölgesindesin. Bu bilgi yalnız sana gösterilir.
              </p>
            )}

            {result.entries.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Yükselme bölgesi ve sana yakın görünür rakipler</caption>
                  <thead className="bg-[var(--bg-secondary)] text-[10px] tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-2">#</th>
                      <th scope="col" className="px-2 py-2">OYUNCU</th>
                      <th scope="col" className="w-16 px-3 py-2 text-right">PUAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries.map((entry) => (
                      <tr
                        key={entry.rank}
                        className={entry.isMe ? 'bg-[var(--focus-bg)]' : 'border-t border-[var(--border)]'}
                      >
                        <td className="px-3 py-2.5 font-display font-black">{entry.rank}</td>
                        <td className="min-w-0 px-2 py-2.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <LeagueAvatar name={entry.name} avatarUrl={entry.avatarUrl} />
                            <span className="min-w-0 truncate">
                              {entry.name}{entry.isMe ? ' (Sen)' : ''}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-[var(--focus-text)]">{entry.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PrivacyNote />
            {!result.optedIn && (
              <p className="text-xs text-[var(--text-sub)]">
                Ayrılma tercihin kaydedildi; mevcut haftanın audit kaydı korunur ve yeni haftaya atanmazsın.
              </p>
            )}
            {result.optedIn && (
              <button
                type="button"
                disabled={updating}
                onClick={() => void updatePreference(false)}
                className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-sub)] disabled:opacity-50"
              >
                {updating ? 'Kaydediliyor…' : 'Gelecek haftadan itibaren ayrıl'}
              </button>
            )}
          </>
        ) : null}

        {error && <p role="alert" className="text-xs text-[var(--urgency-text)]">{error}</p>}
      </div>
    </section>
  )
}
