/**
 * Golden Replay Test — gercek Gemini batch ciktilarini fixture olarak kullan.
 *
 * NEDEN: 992 mock'lu testimiz var ama "Gemini gercekten ne uretiyor?" sorusunu
 * test etmedi. Tier C drift senaryosu (2026-04-26 C2 prompt drift) gercek
 * Gemini ciktisinin database/generated/ dizinine kaydedildigi durumlardan biri.
 *
 * Bu test database/generated/ dizinindeki gercek batch JSON'larini fixture
 * olarak yukler ve isLikelyTurkish helper'ini bunlara karsi calistirir.
 * Avantaj:
 *   - Gemini API quota tuketmez (deterministic, offline)
 *   - Gercek prompt drift senaryolarini regression test'e cevirir
 *   - Yeni drift senaryosu yasandiginda batch dosyasini ekleyip teste cevirebiliriz
 *
 * Kapsam:
 *   - Drift batch (C2 vocabulary, Tier C oncesi): 5 EN solution -> hepsi reddedilmeli
 *   - Clean batch (A1 vocabulary): 5 TR solution -> hepsi gecmeli
 *   - Sosyoloji batch (sosyal game, ana dil TR): drift filter uygulanmaz ama helper dogru calismali
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isLikelyTurkish } from '../tr-text'

interface GeneratedBatch {
  takenAt: string
  game: string
  category: string
  difficulty: number
  level_tag: string | null
  count: number
  questions: Array<{
    question: string
    options: string[]
    answer: number
    solution: string
    topic?: string
  }>
}

function loadBatch(filename: string): GeneratedBatch {
  const path = resolve(process.cwd(), 'database', 'generated', filename)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function countDrift(batch: GeneratedBatch): { driftCount: number; totalCount: number } {
  const driftCount = batch.questions.filter((q) => !isLikelyTurkish(q.solution)).length
  return { driftCount, totalCount: batch.questions.length }
}

describe('Golden Replay: gercek Gemini ciktisinda drift filtresi', () => {
  // C2 drift batch — Tier C oncesi prompt drift gozlem dosyasi.
  // Tum 5 solution Ingilizce: "Undaunted, meaning not intimidated...", "Veiled means..."
  it('C2 drift batch (2026-04-26T08-17-04): tum 5 solution Ingilizce, drift filter hepsini reddeder', () => {
    const batch = loadBatch('2026-04-26T08-17-04-wordquest-vocabulary-C2.json')
    const { driftCount, totalCount } = countDrift(batch)
    expect(totalCount).toBe(5)
    expect(driftCount).toBe(5) // hepsi Ingilizce solution -> drift
  })

  // A1 clean batch — Tier C oncesi de A1 prompt'ta drift gozlemlenmedi
  // (A1 rubrik kisaydi, Gemini Ingilizce'ye kaymadi).
  it('A1 wordquest vocabulary clean batch: 2/2 solution Turkce, 0 drift', () => {
    const batch = loadBatch('2026-04-26T08-14-54-wordquest-vocabulary-A1.json')
    const { driftCount } = countDrift(batch)
    expect(driftCount).toBe(0)
  })

  // A2 batch — A1 ile ayni, Turkce solution beklenir
  it('A2 wordquest vocabulary clean batch: 0 drift', () => {
    const batch = loadBatch('2026-04-26T08-15-58-wordquest-vocabulary-A2.json')
    const { driftCount } = countDrift(batch)
    expect(driftCount).toBe(0)
  })

  // Sosyal/sosyoloji batch — game wordquest degil, route filtre uygulamaz ama
  // helper dogru calismali (tum solution Turkce -> 0 drift).
  // Bu test "isLikelyTurkish helper dogru calisiyor mu" sigorta amacli.
  it('Sosyal sosyoloji batch: ana dil Turkce, helper 0 drift dogrular', () => {
    const batch = loadBatch('2026-04-26T08-14-42-sosyal-sosyoloji.json')
    const { driftCount } = countDrift(batch)
    expect(driftCount).toBe(0)
  })
})
