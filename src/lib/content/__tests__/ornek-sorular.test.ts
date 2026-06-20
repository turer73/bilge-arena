import { describe, it, expect } from 'vitest'
import { SAMPLE_QUESTIONS } from '../ornek-sorular'
import { GAME_SLUGS } from '@/lib/constants/games'

/**
 * Ornek soru kontrati — en kritik: cevap anahtarinin gecerliligi.
 * Yanlis correct-index veya eksik secenek prod'da yanlis "Dogru" gosterir.
 */
describe('ornek sorular kontrati', () => {
  it('her ders icin en az 1 ornek soru', () => {
    for (const slug of GAME_SLUGS) {
      expect(SAMPLE_QUESTIONS[slug]?.length, `${slug} ornek soru yok`).toBeGreaterThan(0)
    }
  })

  it('her soru: 4 benzersiz secenek, correct index sinirda, aciklama dolu', () => {
    for (const slug of GAME_SLUGS) {
      for (const q of SAMPLE_QUESTIONS[slug] ?? []) {
        const ctx = `${slug}: ${q.q}`
        expect(q.options.length, `${ctx} 4 secenek`).toBe(4)
        expect(new Set(q.options).size, `${ctx} secenekler benzersiz`).toBe(4)
        expect(q.correct, `${ctx} correct >=0`).toBeGreaterThanOrEqual(0)
        expect(q.correct, `${ctx} correct < secenek`).toBeLessThan(q.options.length)
        expect(q.q.length, `${ctx} soru metni`).toBeGreaterThan(5)
        expect(q.explanation.length, `${ctx} aciklama`).toBeGreaterThan(10)
      }
    }
  })

  it('correct index dagilimi tek-degerde toplanmamis (gameable degil)', () => {
    const indices = GAME_SLUGS.flatMap((s) => (SAMPLE_QUESTIONS[s] ?? []).map((q) => q.correct))
    expect(new Set(indices).size, 'correct index cesitliligi').toBeGreaterThan(1)
  })
})
