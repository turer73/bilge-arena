'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { BookOpenText, Check, ChevronRight, Flame, GraduationCap, MessageCircle, Palette, Play, ShieldCheck, ShoppingBag, Sparkles, type LucideIcon } from 'lucide-react'
import { DocumentBoundaryLink } from '@/components/privacy/document-boundary-link'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import type { MobileSubjectId } from '@/app/mobil-demo/mobile-home-demo'
import type { GameSlug } from '@/lib/constants/games'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { AcademyLogo } from './academy-logo'
import { AcademyDialog } from './academy-dialog'
import { AcademyTabletNav } from './academy-tablet-nav'
import { DesktopDailyPlan } from './desktop-daily-plan'
import { useTytSocialExamPolicy } from '@/lib/hooks/use-tyt-social-exam-policy'
import { TytSocialExamPolicyCardView } from '@/components/study/tyt-social-exam-policy-card'
import styles from './academy.module.css'

type ProgressStatus = 'ready' | 'loading' | 'unavailable' | 'preparing' | 'guest'
interface Subject { id: MobileSubjectId; label: string; icon: LucideIcon; description: string }
interface Step { key: string; label: string; href: string; index: number; done: boolean; current: boolean; locked: boolean }
export interface DesktopStudyHomeProps {
  studyTools?: ReactNode
  mode: 'demo' | 'live'
  subjects: Subject[]
  subject: Subject
  onSubjectChange: (id: MobileSubjectId) => void
  examOptions: { value: string; label: string }[]
  examRef: string | null
  selectedExamRef: string | null
  onExamChange: (value: string) => void
  game: GameSlug
  steps: Step[]
  primaryHref: string
  currentLabel: string
  pathComplete: boolean
  progressStatus: ProgressStatus
  dailyGoal: { current: number; target: number } | null
  displayName: string
  avatarUrl: string | null
  userId: string | null
  currentStreak: number
  classroomEnabled: boolean
  institutionEnabled: boolean
  communityQualityEnabled: boolean
}

const STATUS_COPY: Record<Exclude<ProgressStatus, 'ready'>, string> = {
  loading: 'İlerlemen yükleniyor…',
  unavailable: 'İlerlemene şu an ulaşılamıyor. Konularından çalışmaya devam edebilirsin.',
  preparing: 'Bu sınav kapsamının öğrenme yolu hazırlanıyor.',
  guest: 'İlerlemeni kaydetmek için hesabına giriş yapabilirsin.',
}

export function DesktopStudyHome(props: DesktopStudyHomeProps) {
  const { subject, subjects, steps, progressStatus, mode } = props
  const { character } = useBilgeCharacter()
  const [dialog, setDialog] = useState<'support' | null>(null)
  const guest = mode === 'live' && !props.userId
  const policy = useTytSocialExamPolicy({ game: props.game, examRef: props.examRef, enabled: mode === 'live' && Boolean(props.userId) })
  const showProfile = mode === 'demo' || Boolean(props.userId)
  const ready = progressStatus === 'ready'
  const completed = ready ? steps.filter(step => step.done).length : 0
  const total = steps.length
  const current = ready ? props.currentLabel : subject.label
  const scopeLabel = props.examOptions.find(option => option.value === props.selectedExamRef)?.label ?? props.examRef
  const dailyPercentage = props.dailyGoal ? Math.max(0, Math.min(100, props.dailyGoal.current / Math.max(1, props.dailyGoal.target) * 100)) : 0

  return (
    <div data-academy-desktop data-arena-home-surface className={styles.root + (mode === 'live' ? ' ' + styles.liveRoot : '')}>
      <ThemeToggle variant="sync-only" />
      {mode === 'demo' && <div className={styles.demoNotice}>Tasarım önizlemesi · Örnek veriler · Hesabındaki ilerlemeyi değiştirmez</div>}
      {mode === 'demo' && <header className={styles.demoHeader}><AcademyLogo /><nav aria-label="Önizleme gezinmesi"><Link href="/">Ana Sayfa</Link><Link href="/arena">Oyunlar</Link><span aria-current="page">Ders Çalış</span></nav></header>}
      {mode === 'live' && <AcademyTabletNav active="study" />}
      <div className={styles.scopeBar}>
        <label className={styles.exam}><ShieldCheck size={20} aria-hidden="true" /><span className={styles.srOnly}>Sınav kapsamı</span><select aria-label="Sınav kapsamı" value={props.selectedExamRef ?? props.examOptions[0]?.value ?? ''} onChange={event => props.onExamChange(event.target.value)}>{props.examOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {!guest && <span className={styles.streak}><Flame size={20} aria-hidden="true" />{props.currentStreak} günlük seri</span>}
        {guest && <Link href="/giris?next=%2Farena%2Fcalisma" className={styles.textLink}>İlerlemeni kaydet · Giriş yap</Link>}
        {showProfile && <Link className={styles.profile} href="/arena/profil" aria-label={props.displayName + ' profilini aç'}>
          {props.avatarUrl ? (
            // Existing user-uploaded/SVG avatars remain independent of the guide.
            <img src={props.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : props.displayName.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'B'}
        </Link>}
      </div>
      <section className={styles.subjects} aria-label="Ders seçimi">
        <div className={styles.subjectButtons}>{subjects.map(item => <button type="button" key={item.id} aria-pressed={item.id === subject.id} onClick={() => props.onSubjectChange(item.id)}><item.icon size={20} aria-hidden="true" />{item.label}</button>)}</div>
        <span className={styles.subjectMotto}>Küçük adımlar, güçlü bir temel.</span>
      </section>
      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          {mode === 'live' && <TytSocialExamPolicyCardView policy={policy} />}
          {!guest && <DesktopDailyPlan key={`${mode}:${props.userId}:${props.game}:${props.examRef}`} mode={mode} game={props.game} examRef={props.examRef} userId={props.userId} tytSocialPolicy={policy} />}
          <section className={styles.hero} aria-labelledby="academy-path-title">
            <Image className={styles.heroArt} src="/academy/academy-landscape.png" alt="" fill sizes="(min-width: 1400px) 890px, 67vw" />
            <div className={styles.heroShade} />
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{scopeLabel} {subject.label}{ready ? ' · ' + total + ' konu' : ''}</p>
              <h1 id="academy-path-title">{subject.label} Yolu</h1>
              <p>{subject.description}.<br />Her adımda biraz daha ileri.</p>
              <div className={styles.heroActions}>
                <Link href={props.primaryHref} className={guest ? styles.primary : styles.secondaryAction}><Play size={17} fill="currentColor" aria-hidden="true" />{ready ? props.pathComplete ? 'Karışık tekrar' : 'Derse devam et' : 'Konulara git'}</Link>
                <div className={styles.nextLesson}><strong>{ready ? props.pathComplete ? 'Yol tamamlandı' : 'Sıradaki: ' + current : subject.label}</strong><span>{guest ? 'Bir konu seçerek başlayabilirsin' : ready ? 'Kendi hızında ilerle' : 'Konularından çalışmaya devam edebilirsin'}</span></div>
              </div>
            </div>
            {ready && <div className={styles.pathCount}><strong>{completed} / {total}</strong><small>konu tamamlandı</small></div>}
          </section>
          {guest && <DesktopDailyPlan mode={mode} game={props.game} examRef={props.examRef} userId={null} />}
          <section className={styles.panel} aria-label={subject.label + ' öğrenme yolu'}>
            <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>ADIM ADIM İLERLE</p><h2>Öğrenme yolun</h2></div><Link href={'/arena/' + props.game} className={styles.textLink}>Tüm konular <ChevronRight size={16} aria-hidden="true" /></Link></header>
            {!ready && <p role="status" className={styles.status}>{STATUS_COPY[progressStatus]}</p>}
            <div className={styles.lessonGrid}>
              {steps.map(step => <Link key={step.key} href={step.href} className={styles.lesson} data-current={ready && step.current} aria-disabled={step.locked || undefined} tabIndex={step.locked ? -1 : undefined} onClick={event => { if (step.locked) event.preventDefault() }}>
                <span className={styles.lessonIcon}>{ready && step.done ? <Check size={23} /> : <subject.icon size={23} />}</span>
                <span><small>{String(step.index + 1).padStart(2, '0')} · {ready && step.current ? 'SIRADAKİ DERS' : ready && step.done ? 'TAMAMLANDI' : 'KONU'}</small><strong>{step.label}</strong></span>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>)}
            </div>
            {steps.length === 0 && <Link href={'/arena/' + props.game} className={styles.textLink}>Bağımsız çalışmaya geç <ChevronRight size={16} /></Link>}
            <p className={styles.footnote}>Bir konuyu yeniden çalışmak da ilerlemenin bir parçası.</p>
          </section>
        </div>
        <aside className={styles.sidebar} aria-label="Bilge ve çalışma araçları">
          <section className={styles.panel + ' ' + styles.coach}>
            <Image src={bilgeImage(character)} alt={(character === 'male' ? 'Erkek' : 'Kadın') + ' Bilge, akademi rehberin'} width={260} height={260} sizes="170px" className={styles.coachPortrait} />
            <p className={styles.eyebrow}>BİLGE YANINDA</p><h2>Birlikte ilerleyelim.</h2>
            <p className={styles.coachMessage}>Takıldığın yerde bir ipucu,<br />her yeni adımda biraz cesaret.</p>
            <button type="button" className={styles.coachAction} onClick={() => setDialog('support')}><MessageCircle size={18} />Bilge’den bir not<ChevronRight size={16} /></button>
          </section>
          <Link className={styles.personalizeLink} href="/arena/kisisellestir"><Palette size={22} aria-hidden="true" /><span><strong>Kişiselleştir</strong><small>Renk teması, arka plan ve Bilge</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
          {props.dailyGoal && <section className={styles.panel}><h2 className={styles.goalTitle}><Flame size={22} />Günlük hedef</h2><div className={styles.goalCount}><span>Bugünkü ilerlemen</span><strong>{props.dailyGoal.current} / {props.dailyGoal.target}</strong></div><progress aria-label="Günlük doğru cevap hedefi" max={Math.max(1, props.dailyGoal.target)} value={Math.max(0, props.dailyGoal.current)} style={{ width: '100%' }}>{dailyPercentage}%</progress><p className={styles.footnote}>Doğru cevap hedefin. Küçük adımlar da ilerlemedir.</p></section>}
          <nav className={styles.tools} aria-label="Diğer alanlar">
            <h2>Diğer alanlar</h2>
            <Link href={'/arena/' + props.game}><BookOpenText size={20} aria-hidden="true" /><span className={styles.toolCopy}><strong>Pratik yap</strong><small>Bilgini sorularla pekiştir</small></span><ChevronRight size={16} aria-hidden="true" /></Link>
            <Link href="/arena/yanlislarim"><GraduationCap size={20} aria-hidden="true" /><span className={styles.toolCopy}><strong>Yanlışlarıma dön</strong><small>Takıldığın yeri birlikte bulalım</small></span><ChevronRight size={16} aria-hidden="true" /></Link>
            <Link href="/arena/magaza"><ShoppingBag size={20} />Mağaza<ChevronRight size={16} /></Link>
            {props.classroomEnabled && <DocumentBoundaryLink href="/arena/sinif"><GraduationCap size={20} />Sınıflarım<ChevronRight size={16} /></DocumentBoundaryLink>}
            {props.institutionEnabled && <DocumentBoundaryLink href="/arena/kurum"><GraduationCap size={20} />Kurum paneli<ChevronRight size={16} /></DocumentBoundaryLink>}
            {props.communityQualityEnabled && <Link href="/arena/kalite-gorevleri"><ShieldCheck size={20} />Kalite görevleri<ChevronRight size={16} /></Link>}
          </nav>
        </aside>
      </div>
      {props.studyTools}
{dialog === 'support' && <AcademyDialog title="Bilge’den küçük bir not" onClose={() => setDialog(null)}><div className={styles.support}><Image src={bilgeImage(character, ready && props.pathComplete ? 'kutlayan' : 'destekleyici')} alt={(character === 'male' ? 'Erkek' : 'Kadın') + ' Bilge destek veriyor'} width={220} height={220} sizes="220px" /><div><Sparkles size={24} aria-hidden="true" /><blockquote>{ready && props.pathComplete ? 'Bu yolu tamamladın. Emeğini bir anlığına kutlayalım.' : 'Her şeyi ilk seferde bilmek zorunda değilsin. Küçük bir adımla başlayalım.'}</blockquote><p className={styles.secondary}>Bu bir destek mesajıdır. Konu anlatımı veya soru yardımı için çalışma araçlarını açabilirsin.</p><Link href="/arena/calisma#calisma-araclari" className={styles.textLink} onClick={() => setDialog(null)}>Çalışma araçlarına git <ChevronRight size={17} /></Link></div></div></AcademyDialog>}
    </div>
  )
}
