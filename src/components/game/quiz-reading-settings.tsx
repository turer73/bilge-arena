'use client'

import { useEffect, useId, useState } from 'react'
import { AcademyDialog } from '@/components/academy/academy-dialog'
import type { QuizFontSize } from '@/lib/hooks/use-quiz-reading'
import { SoundToggle } from './sound-toggle'
import styles from './academy-quiz.module.css'

const sizes: { value: QuizFontSize; label: string; description: string }[] = [
  { value: 'small', label: 'Küçük', description: '%88' },
  { value: 'normal', label: 'Normal', description: '%100' },
  { value: 'large', label: 'Büyük', description: '%112' },
]

export function QuizReadingSettings({ fontSize, onChange, showSound = true, stats, variant = 'header',
  onOpenChange, timerBehavior, returnLabel = 'Oyuna dön' }: {
  fontSize: QuizFontSize
  onChange: (value: QuizFontSize) => void
  showSound?: boolean
  stats?: { streak: number; xp: number }
  /** header: renkli oyun ust bari; card: acik kart zemini (duello, tani). */
  variant?: 'header' | 'card'
  onOpenChange?: (open: boolean) => void
  timerBehavior?: 'paused' | 'continues'
  returnLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const groupId = useId()
  const changeOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }
  useEffect(() => () => onOpenChange?.(false), [onOpenChange])

  return (
    <>
      <button type="button" data-quiz-reading-toggle className={variant === 'card' ? styles.readingToggleCard : styles.readingToggle}
        aria-label={showSound ? 'Yazı boyutu ve ses ayarları' : 'Yazı boyutu ayarları'} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => changeOpen(true)}>Aa</button>
      {open && (
        <AcademyDialog title="Okuma ayarları" size="compact" mobileSheet onClose={() => changeOpen(false)}>
          <fieldset className={styles.readingSettings}>
            <legend>Yazı boyutu</legend>
            <p>Soru, şıklar ve çözüm metni için rahat okuduğun boyutu seç.</p>
            {timerBehavior === 'paused' && <p>Bu pencere açıkken soru süresi duraklatılır.</p>}
            {timerBehavior === 'continues' && <p>Sınav süresi bu pencere açıkken de devam eder.</p>}
            <div className={styles.fontChoices}>
              {sizes.map(({ value, label, description }) => (
                <label key={value}>
                  <input type="radio" name={groupId} value={value} checked={fontSize === value}
                    onChange={() => onChange(value)} />
                  <span>{label} <small>{description}</small></span>
                </label>
              ))}
            </div>
            {showSound && <div className={styles.readingSound}><span>Oyun sesi</span><SoundToggle /></div>}
            {stats && <p>Bu oturum: {stats.streak} seri · {stats.xp} XP</p>}
            <p>Tarayıcının yakınlaştırma özelliğini de kullanabilirsin.</p>
          </fieldset>
          <button type="button" className={styles.readingDone} onClick={() => changeOpen(false)}>{returnLabel}</button>
        </AcademyDialog>
      )}
    </>
  )
}
