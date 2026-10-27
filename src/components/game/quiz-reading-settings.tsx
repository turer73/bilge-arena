'use client'

import { useId, useState } from 'react'
import { AcademyDialog } from '@/components/academy/academy-dialog'
import type { QuizFontSize } from '@/lib/hooks/use-quiz-reading'
import { SoundToggle } from './sound-toggle'
import styles from './academy-quiz.module.css'

const sizes: { value: QuizFontSize; label: string; description: string }[] = [
  { value: 'small', label: 'Küçük', description: '%88' },
  { value: 'normal', label: 'Normal', description: '%100' },
  { value: 'large', label: 'Büyük', description: '%112' },
]

export function QuizReadingSettings({ fontSize, onChange, showSound = true, stats }: {
  fontSize: QuizFontSize
  onChange: (value: QuizFontSize) => void
  showSound?: boolean
  stats?: { streak: number; xp: number }
}) {
  const [open, setOpen] = useState(false)
  const groupId = useId()

  return (
    <>
      <button type="button" data-quiz-reading-toggle className={styles.readingToggle}
        aria-label="Yazı boyutu ve ses ayarları" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}>Aa</button>
      {open && (
        <AcademyDialog title="Okuma ayarları" size="compact" mobileSheet onClose={() => setOpen(false)}>
          <fieldset className={styles.readingSettings}>
            <legend>Yazı boyutu</legend>
            <p>Soru, şıklar ve çözüm metni için rahat okuduğun boyutu seç.</p>
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
          <button type="button" className={styles.readingDone} onClick={() => setOpen(false)}>Oyuna dön</button>
        </AcademyDialog>
      )}
    </>
  )
}
