'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, ChevronUp, Play, SlidersHorizontal } from 'lucide-react'
import type { LobbyProps } from '@/components/game/lobby'
import { SoundToggle } from '@/components/game/sound-toggle'
import { QuizLimitBanner } from '@/components/premium/quiz-limit-banner'
import { AdBanner } from '@/components/ads/ad-banner'
import { GAMES, getCategoriesForExam, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { getModesForContext, DENEME_CONFIGS, type QuizMode } from '@/lib/constants/modes'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { bilgeImage, type BilgeExpression } from '@/lib/bilge/characters'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import styles from './desktop-game-lobby.module.css'

const PRIMARY_MODES = new Set(['classic', 'deneme', 'practice'])
const EXAMS: Record<string, string> = { TYT: 'TYT', LGS: 'LGS', 'AYT-SAY': 'AYT Sayısal', 'AYT-EA': 'AYT Eşit Ağırlık', 'AYT-SOZ': 'AYT Sözel', YDT: 'YDT' }
const DIFFICULTIES = ['Tümü', 'Kolay', 'Orta', 'Zor', 'Çok Zor', 'Uzman']
const ART = { matematik: '/academy/subjects/matematik-magic-v1.png', turkce: '/academy/subjects/turkce-magic-v1.png', fen: '/academy/subjects/fen-magic-v1.png', sosyal: '/academy/subjects/sosyal-magic-v1.png', wordquest: '/academy/modes/wordquest-v1.png' }
const MODE_ART: Readonly<Partial<Record<QuizMode['id'], string>>> = {
  classic: '/academy/lobby-modes/classic-v1.webp',
  blitz: '/academy/lobby-modes/blitz-v1.webp',
  marathon: '/academy/lobby-modes/marathon-v1.webp',
  boss: '/academy/lobby-modes/boss-v1.webp',
  deneme: '/academy/lobby-modes/deneme-v1.webp',
  practice: '/academy/lobby-modes/practice-v1.webp',
}
const MODE_ART_SIZES = '(min-width: 1240px) 259px, (min-width: 1051px) calc((100vw - 464px) / 3), calc((100vw - 382px) / 3)'

const GAME_GUIDANCE: Record<GameSlug, string> = {
  matematik: 'İşlemleri dikkatle kur. Hızdan önce doğru ritmi bul.',
  turkce: 'Metnin izini sür. Cevap çoğu zaman ayrıntıda saklı.',
  fen: 'Gözlemle, bağ kur ve kanıtı adım adım takip et.',
  sosyal: 'Zamanı, yeri ve nedeni birlikte düşün.',
  wordquest: 'Kelimeyi tek başına değil, bağlamın içinde yakala.',
}

const MODE_GUIDANCE: Readonly<Record<string, { expression: BilgeExpression; message: string }>> = {
  blitz: { expression: 'kararli', message: 'Hızlı ol; ama sorunun ne istediğini görmeden işaretleme.' },
  marathon: { expression: 'destekleyici', message: 'Ritmini koru. Uzun turu küçük adımlarla tamamlayacağız.' },
  boss: { expression: 'hafif-kizgin', message: 'Zor sorular seni bekliyor. İpuçlarını tek tek topla.' },
  deneme: { expression: 'odaklanmis', message: 'Sınav ritmini kur, süreni izle ve bir soruda takılı kalma.' },
  practice: { expression: 'merakli', message: 'Burada yanlış yapmak serbest. Her soru yeni bir ipucu.' },
}

function getLobbyGuide(game: GameSlug, modeId: string) {
  return MODE_GUIDANCE[modeId] ?? { expression: 'kararli' as const, message: GAME_GUIDANCE[game] }
}

/** Presentation only: the quiz engine still owns selections, starts and policy/limit gates. */
export function DesktopGameLobby(props: LobbyProps) {
  const { game, selectedMode, onSelectMode, onStart, selectedCategory, onSelectCategory, selectedDifficulty, onSelectDifficulty, selectedExamRef, onSelectExamRef, startBlocked = false, startBlockedLabel = 'Başlatılamıyor', startHref, startLabel, quizLimit, onLimitReached, loadError, personalizedMockCard } = props
  const [expandedModes, setExpandedModes] = useState(false)
  const searchParams = useSearchParams()
  const pendingMode = useRef<QuizMode | null>(null)
  useEffect(() => {
    // Apply the explicit choice after Next has consumed the old entry query.
    // Otherwise GameClient can re-apply practice during the same transition.
    if (!pendingMode.current || searchParams.has('mode')) return
    const nextMode = pendingMode.current
    pendingMode.current = null
    onSelectMode(nextMode)
  }, [searchParams, onSelectMode])
  const { character } = useBilgeCharacter()
  const gameDef = GAMES[game]
  const socialV2 = isTytSocialV2ClientEnabled()
  const examRef = game === 'sosyal' && socialV2 ? selectedExamRef ?? 'TYT' : selectedExamRef
  const modes = getModesForContext(game, examRef, socialV2)
  const mode = modes.find(item => item.id === selectedMode) ?? modes[0]
  const guide = getLobbyGuide(game, mode.id)
  const visibleModes = modes.filter(item => expandedModes || PRIMARY_MODES.has(item.id) || item.id === mode.id)
  const categories = getCategoriesForExam(game, examRef)
  const categoryIsValid = selectedCategory === null || categories.includes(selectedCategory)
  const categoryLabel = selectedCategory && categoryIsValid ? getCategoryLabel(selectedCategory) : 'Tüm konular'
  const exactSocial = socialV2 && game === 'sosyal' && examRef === 'TYT' && mode.isDeneme
  const preview = Boolean(quizLimit?.isGuest && !startHref)
  const limitReached = Boolean(quizLimit && !quizLimit.canPlay)
  const denemeMinutes = Math.ceil((DENEME_CONFIGS[game]?.totalTime ?? 0) / 60)
  const timeLabel = mode.isDeneme && !preview ? `${denemeMinutes} dk toplam` : mode.timePerQuestion ? `${mode.timePerQuestion} sn / soru` : 'Zamansız'
  const actionLabel = startBlocked ? startBlockedLabel : limitReached ? 'Limit doldu · Premium’a geç' : startLabel ?? (preview ? 'Önizlemeyi başlat · 1 soru' : `Başlat · ${mode.questionCount} soru`)
  const startDisabled = startBlocked || (limitReached && !onLimitReached) || !categoryIsValid
  const handleStart = startDisabled ? undefined : limitReached ? onLimitReached : onStart

  // Native History integrates with Next's search params without a reload. Keep
  // an entry link's query from re-applying the old selection after a UI change.
  const replaceSetupQuery = (updates: Record<string, string | null>) => {
    if (window.location.pathname !== `/arena/${game}`) return
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(updates)) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
  const selectScope = (value: string | null) => {
    const validTopic = selectedCategory && getCategoriesForExam(game, value).includes(selectedCategory) ? selectedCategory : null
    replaceSetupQuery({ exam_ref: value, category: validTopic })
    onSelectExamRef(value)
  }
  const selectTopic = (value: string | null) => {
    replaceSetupQuery({ category: value })
    onSelectCategory(value)
  }
  const selectMode = (value: QuizMode) => {
    // The entry route only accepts practice; do not add a generic URL mode API.
    // An explicit UI choice may leave that entry preference, while retaining
    // all program/source parameters and the engine's existing policy checks.
    if (window.location.pathname === `/arena/${game}` && new URLSearchParams(window.location.search).has('mode') && value.id !== 'practice') {
      pendingMode.current = value
      replaceSetupQuery({ mode: null })
      return
    }
    pendingMode.current = null
    onSelectMode(value)
  }

  return <div className={styles.root} data-responsive-game-lobby data-desktop-game-lobby style={{ '--game-color': gameDef.colorHex } as CSSProperties}>
    <ThemeToggle variant="sync-only" />
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <div className={styles.headerNavigation}>
          <Link className={styles.back} href="/arena"><ChevronLeft size={17} aria-hidden="true" /> Oyunlara dön</Link>
        </div>
        <p className={styles.eyebrow}>OYUN HAZIRLIĞI</p><h1>{gameDef.name} turunu kur</h1><p>Oyun biçimini seç, istersen soruları özelleştir. Hazır olduğunda başla.</p>
      </div>
      <div className={styles.headerTools}>
        <div className={styles.guide} data-lobby-guide>
          <Image src={bilgeImage(character, guide.expression)} alt={character === 'male' ? 'Erkek Bilge' : 'Kadın Bilge'} width={68} height={68} sizes="68px" />
          <div><span>BİLGE YANINDA</span><p>“{guide.message}”</p></div>
        </div>
        <SoundToggle />
      </div>
    </header>
    <div className={styles.columns}>
      <div className={styles.main}>
        <section className={styles.panel} aria-labelledby="desktop-mode-title">
          <h2 id="desktop-mode-title"><span className={styles.step}>1</span> Nasıl oynamak istersin?</h2>
          <div className={styles.modes} role="group" aria-label="Oyun biçimi">
            {visibleModes.map(item => {
              const modeArt = MODE_ART[item.id]
              const modeDuration = item.isDeneme ? `${denemeMinutes} dk` : item.timePerQuestion ? `${item.timePerQuestion} sn / soru` : 'Zamansız'
              return <button aria-label={`${item.name}, ${item.questionCount} soru, ${modeDuration}`} className={modeArt ? styles.modeWithArt : undefined} data-mode-art={modeArt ? item.id : undefined} key={item.id} type="button" aria-pressed={item.id === mode.id} onClick={() => selectMode(item)}>
                {modeArt && <span className={styles.modeArt} aria-hidden="true"><Image src={modeArt} alt="" fill sizes={MODE_ART_SIZES} /></span>}
                <span className={styles.modeCopy}>
                  {!modeArt && <span className={styles.modeIcon} aria-hidden="true">{item.icon}</span>}
                  <strong>{item.name}</strong><small>{item.questionCount} soru · {modeDuration}</small>
                </span>
                {item.id === mode.id && <Check className={styles.selected} size={17} aria-hidden="true" />}
              </button>
            })}
          </div>
          <button className={styles.more} type="button" aria-expanded={expandedModes} onClick={() => setExpandedModes(value => !value)}>{expandedModes ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}{expandedModes ? 'Daha az mod göster' : 'Blitz, Maraton ve Boss'}</button>
        </section>
        <section className={styles.panel} aria-labelledby="desktop-settings-title">
          <h2 id="desktop-settings-title"><span className={styles.step}>2</span> Soru ayarları <SlidersHorizontal size={17} aria-hidden="true" /></h2>
          <p className={styles.help}>Mevcut seçimlerle başlayabilir veya aşağıdan değiştirebilirsin.</p>
          <div className={styles.fields}>
            {game !== 'wordquest' && <label>Sınav kapsamı<select aria-label="Sınav kapsamı" value={examRef ?? ''} onChange={event => selectScope(event.target.value || null)}>
              {game !== 'sosyal' && <option value="">Tüm sınavlar</option>}
              {gameDef.examTags.map(ref => <option key={ref} value={ref}>{EXAMS[ref] ?? ref}</option>)}
            </select></label>}
            <label>Konu<select aria-label="Konu" disabled={Boolean(exactSocial)} value={categoryIsValid ? selectedCategory ?? '' : '__unavailable__'} onChange={event => selectTopic(event.target.value || null)}>
              {!categoryIsValid && <option value="__unavailable__" disabled>Geçerli bir konu seç</option>}
              <option value="">Tüm konular</option>{categories.map(category => <option key={category} value={category}>{getCategoryLabel(category)}</option>)}
            </select></label>
            <label>Zorluk<select aria-label="Zorluk" disabled={Boolean(exactSocial)} value={selectedDifficulty ?? 0} onChange={event => onSelectDifficulty(Number(event.target.value) || null)}>{DIFFICULTIES.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></label>
          </div>
          {!categoryIsValid && <p role="alert" className={styles.error}>Önceki konu bu sınavda yok. Devam etmek için konu seçimini güncelle.</p>}
          {mode.isDeneme && <div className={styles.format}>
            <strong>{exactSocial ? '20 soruluk TYT Sosyal bölümü' : 'Ders kapsamlı çalışma denemesi'}</strong>
            <p>{exactSocial ? 'Tarih, Coğrafya, Felsefe grubu ve seçtiğin cevaplama grubundan 5’er soru. Konu ve zorluk bu bölümde sabittir.' : 'Deneme süresi dersin yapılandırmasından gelir. Konu ve zorluk seçimleri soru havuzunu daraltır.'}</p>
            <small>Net hesabı: Doğru − (Yanlış / 4)</small>
          </div>}
        </section>
        {personalizedMockCard && <details className={styles.alternative}><summary>Sana özel bir deneme mi arıyorsun?</summary><div data-personalized-mock-slot>{personalizedMockCard}</div></details>}
      </div>
      <aside className={`${styles.sidebar} ${props.dailyPlanAction ? styles.sidebarWithPlan : ''}`} aria-label="Tur özeti">
        <section className={styles.summary}>
          <div className={styles.art} aria-hidden="true"><Image src={ART[game]} alt="" fill sizes="(min-width: 1051px) 320px, 280px" /></div>
          <div className={styles.summaryContent}>
            <p className={styles.eyebrow}>{preview ? 'MİSAFİR ÖNİZLEMESİ' : 'BU TURDA'}</p><h2>{mode.name}</h2>
            <dl className={styles.stats}><div><dt>Soru</dt><dd>{preview ? 1 : mode.questionCount}</dd></div><div><dt>Süre</dt><dd>{timeLabel}</dd></div><div><dt>Can</dt><dd>{mode.lives ?? 'Sınırsız'}</dd></div></dl>
            <p className={styles.selection}>{game === 'wordquest' ? 'İngilizce' : examRef ? EXAMS[examRef] ?? examRef : 'Tüm sınavlar'} · {exactSocial ? 'Sabit bölüm' : categoryLabel} · {exactSocial ? 'Standart dağılım' : DIFFICULTIES[selectedDifficulty ?? 0]}</p>
            {preview && <p className={styles.help}>Giriş yapmadan 1 soruyu deneyebilirsin. Tam tur ve ilerleme kaydı için hesabına giriş yap.</p>}
            {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
            <div data-desktop-lobby-start>{startHref && !startDisabled ? <Link className={styles.start} href={startHref}><Play size={18} aria-hidden="true" />{startLabel ?? 'Giriş yaparak başla'}</Link> : <button className={styles.start} type="button" disabled={startDisabled} onClick={handleStart}>{!startDisabled && <Play size={18} aria-hidden="true" />}{actionLabel}</button>}</div>
            {startBlocked && <p role="status" className={styles.help}>Başlamak için gerekli ayarı tamamla: {startBlockedLabel}.</p>}
            {props.dailyPlanAction && <div className={styles.dailyPlanAction} data-lobby-daily-plan-slot>{props.dailyPlanAction}</div>}
          </div>
        </section>
        {quizLimit && <QuizLimitBanner remaining={quizLimit.remaining} isPremium={quizLimit.isPremium} isGuest={quizLimit.isGuest} />}
      </aside>
    </div>
    <AdBanner slot="lobby" className="mx-auto mt-6" />
  </div>
}
