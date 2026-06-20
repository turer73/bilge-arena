import { describe, it, expect } from 'vitest'
import { SUBJECT_CONTENT, SUBJECT_EMOJI } from '../konular'
import { GAME_SLUGS } from '@/lib/constants/games'

/**
 * Konu icerik kontrati: her ders icin SEO metni + emoji eksiksiz olmali.
 * games.ts'e yeni ders eklenirse bu test eksigi yakalar (sessiz drift yok).
 */
describe('konular icerigi kontrati', () => {
  it('her GameSlug icin SUBJECT_CONTENT ve SUBJECT_EMOJI tanimli', () => {
    for (const slug of GAME_SLUGS) {
      expect(SUBJECT_CONTENT[slug], `${slug} icerik eksik`).toBeDefined()
      expect(SUBJECT_EMOJI[slug], `${slug} emoji eksik`).toBeTruthy()
    }
  })

  it('tagline/intro/studyTip anlamli uzunlukta, keywords dolu', () => {
    for (const slug of GAME_SLUGS) {
      const c = SUBJECT_CONTENT[slug]
      expect(c.tagline.length, `${slug} tagline`).toBeGreaterThan(10)
      expect(c.intro.length, `${slug} intro`).toBeGreaterThan(50)
      expect(c.studyTip.length, `${slug} studyTip`).toBeGreaterThan(30)
      expect(c.keywords.length, `${slug} keywords`).toBeGreaterThan(0)
    }
  })
})
