'use client'

import Image from 'next/image'
import { bilgeImage, type BilgeExpression } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import styles from './academy-quiz.module.css'

/** Presentation only: character preference never changes coaching or quiz policy. */
export function AcademyQuizPortrait({ expression = 'odaklanmis' }: { expression?: BilgeExpression }) {
  const { character } = useBilgeCharacter()
  return (
    <div className={styles.portrait} data-quiz-portrait={character}>
      <Image
        src={bilgeImage(character, expression)}
        alt={character === 'male' ? 'Erkek Bilge' : 'Kadın Bilge'}
        fill
        sizes="(min-width: 1024px) 300px, 240px"
      />
    </div>
  )
}
