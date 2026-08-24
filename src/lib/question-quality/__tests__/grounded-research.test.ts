import { describe, expect, it, vi } from 'vitest'
import { isAuthoritativeSource, runGroundedOfficialResearch } from '../grounded-research'
import type { QuestionDraft } from '@/lib/question-audit/types'

const draft: QuestionDraft = {
  questionId: 'q', revisionId: 'r', contentSha256: 'a'.repeat(64), examRef: 'TYT',
  subject: 'Türkçe', topic: 'Yazım', questionText: 'Hangisi doğrudur?', passage: null,
  options: ['A', 'B', 'C', 'D', 'E'], markedAnswerIndex: 0, solutionText: null,
}

describe('grounded official research', () => {
  it('accepts official/academic Turkish hosts, not arbitrary web pages', () => {
    expect(isAuthoritativeSource('https://sozluk.gov.tr/')).toBe(true)
    expect(isAuthoritativeSource('https://example.edu.tr/paper')).toBe(true)
    expect(isAuthoritativeSource('https://answers.example.com/key')).toBe(false)
  })

  it('downgrades a grounded answer without an authoritative source to inconclusive', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{
        content: { parts: [{ text: JSON.stringify({ direction: 'supports_flaw', confidence: 0.99, rationale: 'x' }) }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://answers.example.com/key', title: 'Cevap' } }] },
      }] }),
    })
    const result = await runGroundedOfficialResearch({ draft, apiKey: 'secret', modelId: 'gemini-test', fetchImpl })
    expect(result.status).toBe('ok')
    expect(result.direction).toBe('inconclusive')
    expect(result.strength).toBe(0)
  })
})
