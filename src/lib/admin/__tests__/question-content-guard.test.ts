import { describe, expect, it } from 'vitest'
import {
  buildSubjectPromptAppendix,
  createTdkGuard,
  validateGeneratedQuestionContent,
} from '../question-content-guard.mjs'

const tdkGuard = createTdkGuard([
  ['Hazirlik', 'Hazırlık'],
  ['hazirlik', 'hazırlık'],
  ['dogru', 'doğru'],
])

describe('question-content-guard', () => {
  it('TDK ASCII ihlali olan Turkce soruyu reddeder', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Hazirlik sürecinde ilk olarak hangi adım uygulanmalıdır?',
      options: ['Plan yapmak', 'Sonucu açıklamak', 'Raporu silmek', 'Yanıtı saklamak', 'Soruyu atlamak'],
      answer: 0,
      solution: 'Hazırlık sürecinde önce plan yapılır.',
    }, { game: 'turkce', tdkGuard })

    expect(err).toMatch(/TDK ASCII ihlali/)
  })

  it('onculleri options alanina bolen soruyu yakalar', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Bir cismin kinetik enerjisiyle ilgili hangileri doğrudur?',
      options: [
        'I. Cismin kütlesine bağlıdır',
        'II. Hızının karesi ile orantılıdır',
        'III. Vektörel bir büyüklüktür',
        'I ve II',
        'II ve III',
      ],
      answer: 3,
      solution: 'Kinetik enerji kütleye ve hızın karesine bağlıdır; vektörel değildir.',
    }, { game: 'fen', tdkGuard })

    expect(err).toBe('Öncüller seçeneklere bölünemez')
  })

  it('Roma rakamli tarih adlarini false-positive olarak reddetmez', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Osmanlı Devleti hangi savaş sonrasında Balkanlarda önemli toprak kaybetmiştir?',
      options: [
        'I. Balkan Savaşı',
        'Trablusgarp Savaşı',
        'Karlofça Antlaşması',
        'II. Viyana Kuşatması',
        'Prut Savaşı',
      ],
      answer: 0,
      solution: 'I. Balkan Savaşı sonucunda Osmanlı Devleti Balkanlarda önemli toprak kaybetmiştir.',
    }, { game: 'sosyal', tdkGuard })

    expect(err).toBeNull()
  })

  it('prompt appendix tek ortak kaynaktan oyun bazli altin ornek verir', () => {
    expect(buildSubjectPromptAppendix('matematik')).toContain('ALTIN KURAL')
    expect(buildSubjectPromptAppendix('matematik')).toContain('ALTIN ÖRNEK')
    expect(buildSubjectPromptAppendix('bilinmeyen')).toBe('')
  })
})
