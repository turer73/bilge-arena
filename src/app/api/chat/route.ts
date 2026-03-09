import { google } from '@ai-sdk/google'
import { streamText } from 'ai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { chatRequestSchema } from '@/lib/validations/schemas'

const chatLimiter = createRateLimiter('chat', 30, 60_000) // 30 req/dk

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
  // 1) Auth kontrolu
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Bu ozelligi kullanmak icin giris yapmaniz gerekiyor.' },
      { status: 401 }
    )
  }

  // 2) Rate limiting
  const rl = chatLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek gonderdiniz. Lutfen biraz bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
    )
  }

  // 3) Request body — Zod ile dogrula
  const body = await request.json()
  const parsed = chatRequestSchema.safeParse(body)

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Gecersiz istek'
    return NextResponse.json(
      { error: `Gecersiz mesaj formati: ${firstError}` },
      { status: 400 }
    )
  }

  const { messages, questionContext } = parsed.data

  const systemMessages = questionContext
    ? `${SYSTEM_PROMPT}\n\nOgrencinin su anda calistigi soru:\n${questionContext}`
    : SYSTEM_PROMPT

  try {
    const result = streamText({
      model: google('gemini-2.0-flash-lite'),
      system: systemMessages,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      maxOutputTokens: 500,
    })

    // textStream'i manuel okuyarak hata yakalama + streaming
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (streamErr) {
          console.error('[Chat API] Streaming error:', streamErr)
          // Stream sirasinda hata olursa, hata mesajini stream'e yaz
          const errMsg = streamErr instanceof Error ? streamErr.message : 'Bilinmeyen hata'
          controller.enqueue(encoder.encode(`\n\n❌ Hata: ${errMsg}`))
          controller.close()
        }
      },
    })

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    console.error('[Chat API] Gemini error:', err)
    return NextResponse.json(
      { error: `AI servisi hatasi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}` },
      { status: 502 }
    )
  }
}
