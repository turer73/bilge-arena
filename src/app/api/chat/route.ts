import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

const SYSTEM_PROMPT = `Sen Bilge Arena'nin yapay zeka asistani "Bilge Asistan"sin.

Gorevlerin:
1. TYT/YKS sorularini adim adim cozmek
2. Konu anlatimi yapmak (kisa, net, ogrenci dostu)
3. Benzer ornek sorular uretmek
4. Calisma stratejisi onermek

Kurallar:
- Turkce konus
- Ogrenci seviyesinde, motive edici, kisa tut
- Emojileri olculü kullan
- Formulleri goster
- Her aciklamada "Neden?" sorusuna cevap ver
- Konuyu anlatirken gunluk hayattan ornek ver
- Maksimum 200 kelime ile cevap ver

Konu alanlarin:
- Matematik: Sayilar, cebir, geometri, problemler
- Turkce: Paragraf, dil bilgisi, sozcuk anlami
- Fen: Fizik, kimya, biyoloji
- Sosyal: Tarih, cografya, felsefe
- Ingilizce: Vocabulary, grammar

Su anki ogrencinin sorusu veya konusu hakkinda yardimci ol.`

export async function POST(request: Request) {
  const { messages, questionContext } = await request.json()

  // Rate limiting (basit — production'da Redis kullan)
  // Simdilik unlimited

  const systemMessages = questionContext
    ? `${SYSTEM_PROMPT}\n\nOgrencinin su anda calistigi soru:\n${questionContext}`
    : SYSTEM_PROMPT

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemMessages,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    maxOutputTokens: 500,
  })

  return result.toTextStreamResponse()
}
