import { describe, expect, it } from 'vitest'
import { parseCoachPublicResponse } from '../public-contract'

const evaluation = { passed: true, policyVersion: 'coach-r2.2-v1' }

describe('coach public response contract', () => {
  it('guidance yanıtını kabul eder ve iç alanları reddeder', () => {
    const response = {
      sessionId: '11111111-2222-4333-8444-555555555555',
      stage: 'hint1',
      hint: 'Olası odak: işlem sırası. Önce verilenleri ayır.',
      source: 'fallback',
      sourceLabel: 'Koruyucu Koç şablonu',
      evaluation,
      nextToken: 'signed-token',
    }
    expect(parseCoachPublicResponse(response)).toEqual(response)
    expect(parseCoachPublicResponse({ ...response, answer: 2 })).toBeNull()
    expect(parseCoachPublicResponse({ ...response, evaluation: { passed: false, policyVersion: 'x' } })).toBeNull()
  })

  it('çözümde answer içermeyen strict transfer sorusu ister', () => {
    const response = {
      sessionId: '11111111-2222-4333-8444-555555555555',
      stage: 'solution',
      hint: 'Küratörlü çözüm.',
      source: 'solution',
      sourceLabel: 'Onaylı soru çözümü',
      evaluation,
      transferQuestion: {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        game: 'matematik',
        category: 'sayilar',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        base_points: 20,
        content: { question: '3 + 4?', options: ['6', '7'] },
      },
      nextToken: 'transfer-token',
    }
    expect(parseCoachPublicResponse(response)).toEqual(response)
    expect(parseCoachPublicResponse({
      ...response,
      transferQuestion: {
        ...response.transferQuestion,
        content: { ...response.transferQuestion.content, answer: 1 },
      },
    })).toBeNull()
  })

  it('transfer sonucu yalnız cevap gönderildikten sonraki güvenli alanları taşır', () => {
    expect(parseCoachPublicResponse({
      sessionId: '11111111-2222-4333-8444-555555555555',
      stage: 'transfer',
      isCorrect: true,
      correctOption: 1,
      solution: 'Onaylı transfer çözümü.',
      source: 'approved_transfer',
      sourceLabel: 'Onaylı soru bankası',
      evaluation,
      nextToken: null,
    })?.stage).toBe('transfer')
  })
})
