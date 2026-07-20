/**
 * fsrs.ts wrapper — deterministik testler (enable_fuzz=false, ts-fsrs@5.4.1
 * pinli). Beklenen due/stability degerleri gercek ts-fsrs cikisiyla dogrulandi
 * (manuel probe), rastgele/tahmini degil.
 */

import { describe, test, expect } from 'vitest'
import { foldQuestionCard, isCardDue, type ReviewEvent } from '../fsrs'

const T0 = '2026-01-01T00:00:00.000Z'
const T0_PLUS_2D = '2026-01-03T00:00:00.000Z'

describe('foldQuestionCard', () => {
  test('bos gecmis: due=simdi (yeni kart), state=New', () => {
    const before = Date.now()
    const card = foldQuestionCard([])
    expect(card.state).toBe(0) // State.New
    expect(card.due.getTime()).toBeGreaterThanOrEqual(before)
  })

  test('tek yanlis cevap (Again): kisa-vadeli due, state=Learning', () => {
    const events: ReviewEvent[] = [{ isCorrect: false, answeredAt: T0 }]
    const card = foldQuestionCard(events)
    expect(card.due.toISOString()).toBe('2026-01-01T00:01:00.000Z')
    expect(card.state).toBe(1) // State.Learning
  })

  test('tek dogru cevap (Good): Again dan daha uzun due', () => {
    const events: ReviewEvent[] = [{ isCorrect: true, answeredAt: T0 }]
    const card = foldQuestionCard(events)
    expect(card.due.toISOString()).toBe('2026-01-01T00:10:00.000Z')
    expect(card.state).toBe(1)
  })

  test('ardisik iki dogru cevap: interval buyur (aralikli-tekrar davranisi)', () => {
    const events: ReviewEvent[] = [
      { isCorrect: true, answeredAt: T0 },
      { isCorrect: true, answeredAt: T0_PLUS_2D },
    ]
    const card = foldQuestionCard(events)
    expect(card.due.toISOString()).toBe('2026-01-14T00:00:00.000Z')
    expect(card.stability).toBeCloseTo(10.96433194, 5)
  })

  test('event sirasi onemsiz — fonksiyon kronolojik olarak kendi siralar', () => {
    const chronological: ReviewEvent[] = [
      { isCorrect: true, answeredAt: T0 },
      { isCorrect: true, answeredAt: T0_PLUS_2D },
    ]
    const reversed: ReviewEvent[] = [...chronological].reverse()
    expect(foldQuestionCard(reversed).due.toISOString()).toBe(
      foldQuestionCard(chronological).due.toISOString(),
    )
  })

  test('Date objesi answeredAt olarak da kabul edilir (string ile ayni sonuc)', () => {
    const asString = foldQuestionCard([{ isCorrect: false, answeredAt: T0 }])
    const asDate = foldQuestionCard([{ isCorrect: false, answeredAt: new Date(T0) }])
    expect(asDate.due.toISOString()).toBe(asString.due.toISOString())
  })
})

describe('isCardDue', () => {
  test('due <= now ise true', () => {
    const card = foldQuestionCard([{ isCorrect: false, answeredAt: T0 }])
    expect(isCardDue(card, new Date('2026-01-01T00:01:00.000Z'))).toBe(true)
    expect(isCardDue(card, new Date('2026-01-01T00:05:00.000Z'))).toBe(true)
  })

  test('due > now ise false', () => {
    const card = foldQuestionCard([{ isCorrect: false, answeredAt: T0 }])
    expect(isCardDue(card, new Date('2026-01-01T00:00:30.000Z'))).toBe(false)
  })
})
