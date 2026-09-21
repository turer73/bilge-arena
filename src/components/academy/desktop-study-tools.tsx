'use client'

import Link from 'next/link'
import { BrainCircuit, CalendarDays, ChevronRight, Sparkles, Target } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { MasteryActionCard } from '@/components/study/mastery-action-card'
import { InstitutionWeeklyProgramCard } from '@/components/study/institution-weekly-program-card'
import { StudyAssistantLauncher } from '@/components/study/study-assistant-launcher'
import { DiagnosticExplainerDialog } from '@/components/study/diagnostic-explainer-dialog'
import styles from './academy.module.css'

export function DesktopStudyTools({
  game,
  examRef,
  diagnosticExamRef,
}: {
  game: GameSlug
  examRef: string | null
  diagnosticExamRef?: string | null
}) {
  const { user, loading } = useAuthStore()
  const [guestDiagnosticOpen, setGuestDiagnosticOpen] = useState(false)
  const gameDef = GAMES[game]
  const diagnosticScope = diagnosticExamRef === undefined ? examRef : diagnosticExamRef

  return <section
    id="calisma-araclari"
    className={styles.studyTools}
    aria-label="Çalışma araçların"
    style={{ '--study-tool-color': gameDef.colorHex } as CSSProperties}
  >
    <header className={styles.studyToolsHeader}>
      <div>
        <p className={styles.eyebrow}>ANLA · PEKİŞTİR · İLERLE</p>
        <h2>Çalışma araçların</h2>
        <p className={styles.secondary}>Seçtiğin ders bağlamında neyi çalışacağını bul, destek al ve ilerlemeni tek yerde sürdür.</p>
      </div>
      <span className={styles.studyToolsContext}>{examRef ?? 'Serbest'} · {gameDef.name}</span>
    </header>
    {loading ? <p role="status">Çalışma araçların yükleniyor…</p> : !user
      ? <div className={styles.studyToolsGuest}>
          <div className={styles.studyToolPreviewGrid}>
            <article className={styles.studyToolPreview}>
              <span className={styles.studyToolPreviewIcon}><Target size={22} aria-hidden="true" /></span>
              <div><h3>Kazanımı çalış</h3><p>Eksik olduğun kazanımı bul; konu anlatımı, ipucu ve soruyla pekiştir.</p></div>
            </article>
            <article className={styles.studyToolPreview}>
              <span className={styles.studyToolPreviewIcon}><Sparkles size={22} aria-hidden="true" /></span>
              <div><h3>Bilge Asistan</h3><p>Cevabı vermeden düşünme yolunu, kavramı ve sonraki adımı açıklar.</p></div>
            </article>
            <article className={styles.studyToolPreview}>
              <span className={styles.studyToolPreviewIcon}><CalendarDays size={22} aria-hidden="true" /></span>
              <div><h3>Çalışma programı</h3><p>Günlük planın ve varsa kurum programın aynı çalışma akışında birleşir.</p></div>
            </article>
            {diagnosticScope ? <button type="button" className={styles.studyToolPreview} onClick={() => setGuestDiagnosticOpen(true)}>
              <span className={styles.studyToolPreviewIcon}><BrainCircuit size={22} aria-hidden="true" /></span>
              <div><h3>Seviyeni ölç</h3><p>Kısa uyarlanabilir taramayla ilk çalışma yönünü ve sonraki adımını bul.</p></div>
            </button> : null}
          </div>
          <div className={styles.studyToolsGuestAction}>
            <div><strong>Planın hesabına bağlı çalışır</strong><p>İlerlemeni ölçebilmemiz ve kaldığın yerden devam edebilmen için giriş yap.</p></div>
            <Link className={styles.studyToolsCta} href="/giris?next=%2Farena%2Fcalisma">Giriş yap ve planını aç <ChevronRight size={18} aria-hidden="true" /></Link>
          </div>
          {guestDiagnosticOpen && diagnosticScope
            ? <DiagnosticExplainerDialog game={game} examRef={diagnosticScope} onClose={() => setGuestDiagnosticOpen(false)} />
            : null}
        </div>
      : <div className={styles.studyToolsGrid}>
        <div className={styles.mainColumn}>
          <MasteryActionCard game={game} userId={user.id} examRef={diagnosticScope} diagnosticPresentation="explained" />
          <InstitutionWeeklyProgramCard />
        </div>
        <StudyAssistantLauncher key={`${game}:${examRef}`} game={game} examRef={examRef} />
      </div>}
  </section>
}
