import { describe, expect, it } from 'vitest'
import {
  buildTopicExplanationPrompt,
  STUDY_ASSISTANT_ACTIONS,
  TOPIC_EXPLANATION_SYSTEM_INSTRUCTION,
} from '../topic-explanation'

describe('topic explanation prompt contract', () => {
  it('requires a detailed, evidence-conscious teaching sequence', () => {
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('Öğrenme hedefi ve gerekli ön bilgiler')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('Kavramın mantığı')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('Adım adım çözümlü örnek')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('Sık yapılan hata')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('Mini kontrol')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('uydurma')
    expect(TOPIC_EXPLANATION_SYSTEM_INSTRUCTION).toContain('500-800 kelimelik')
  })

  it('adds the selected lesson and exam context without asking for a short summary', () => {
    const prompt = buildTopicExplanationPrompt({
      topic: 'İkinci dereceden denklemler',
      subject: 'Matematik',
      examRef: 'TYT',
      difficulty: 3,
    })
    expect(prompt).toContain('Konu: İkinci dereceden denklemler')
    expect(prompt).toContain('Ders: Matematik · Sınav: TYT · Zorluk: 3/5')
    expect(prompt).toContain('yüzeysel özetleme')
    expect(prompt).not.toContain('kısaca anlat')
    expect(STUDY_ASSISTANT_ACTIONS.find((action) => action.id === 'topic')?.mode)
      .toBe('topic_explanation')
  })
})
