'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BILGE_CHARACTERS, BILGE_EXPRESSIONS, bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { AcademyDialog } from './academy-dialog'
import styles from './academy.module.css'

export function BilgeGallery({ onClose }: { onClose: () => void }) {
  const { character, persisted, setCharacter } = useBilgeCharacter()
  const [expression, setExpression] = useState<(typeof BILGE_EXPRESSIONS)[number]>(BILGE_EXPRESSIONS[0])
  return (
    <AcademyDialog title="Hangi Bilge sana eşlik etsin?" onClose={onClose}>
      <p className={styles.secondary}>İki görünüm, aynı destek. Seçimin derslerini ve profil fotoğrafını değiştirmez.</p>
      <fieldset className={styles.characterChoices}>
        <legend>Rehber görünümü</legend>
        {BILGE_CHARACTERS.map((item) => (
          <label key={item.id} className={styles.characterChoice}>
            <input type="radio" name="bilge-character" aria-label={item.label} value={item.id} checked={character === item.id} onChange={() => setCharacter(item.id)} />
            <Image src={bilgeImage(item.id)} alt="" width={64} height={64} sizes="64px" />
            <span><strong>{item.label}</strong><small>12 ifade</small></span>
          </label>
        ))}
      </fieldset>
      <p className={styles.preferenceNote} role="status">{persisted ? 'Tercihin bu tarayıcıda hatırlanır; hesabına kaydedilmez.' : 'Tarayıcı kaydı kapalı. Tercihin bu sayfada geçerli.'}</p>
      <div className={styles.gallery}>
        <figure className={styles.expressionStage}>
          <Image src={bilgeImage(character, expression.id)} alt={`${character === 'male' ? 'Erkek' : 'Kadın'} Bilge — ${expression.label}`} width={600} height={600} sizes="(min-width: 1000px) 340px, 40vw" />
          <figcaption aria-live="polite"><strong>{expression.label}</strong><blockquote>“{expression.message}”</blockquote><small>{expression.context}</small></figcaption>
        </figure>
        <div>
          <div className={styles.expressionGrid} aria-label="Bilge ifadeleri">
            {BILGE_EXPRESSIONS.map((item) => (
              <button type="button" key={item.id} aria-pressed={item.id === expression.id} onClick={() => setExpression(item)} className={styles.expressionOption}>
                <Image src={bilgeImage(character, item.id)} alt="" width={140} height={140} sizes="100px" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <p className={styles.preferenceNote}>Bilge öğrenciye kızmaz veya suçluluk hissettirmez. Üzgün ve yorgun ifadeleri otomatik duygu tespiti değildir.</p>
        </div>
      </div>
    </AcademyDialog>
  )
}
