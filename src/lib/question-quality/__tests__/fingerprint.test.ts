import { describe, expect, it } from 'vitest'
import { correctionFingerprint, normalizeCorrectionText } from '../fingerprint'

describe('quality correction fingerprint', () => {
  it('normalizes Turkish case, unicode and whitespace deterministically', () => {
    expect(normalizeCorrectionText('  İKİ   seçenek  ')).toBe('iki seçenek')
    expect(correctionFingerprint({ reasonCode: 'wrong_key', proposedAnswerIndex: 2, correctionText: ' C ' }))
      .toBe(correctionFingerprint({ reasonCode: 'wrong_key', proposedAnswerIndex: 2, correctionText: 'c' }))
  })

  it('keeps different proposed options distinct', () => {
    expect(correctionFingerprint({ reasonCode: 'wrong_key', proposedAnswerIndex: 1 }))
      .not.toBe(correctionFingerprint({ reasonCode: 'wrong_key', proposedAnswerIndex: 2 }))
  })
})
