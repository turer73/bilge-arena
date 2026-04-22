import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { chatRequestSchema } from '@/lib/validations/schemas'

const chatLimiter = createRateLimiter('chat', 30, 60_000)

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Prompt production'da CHAT_SYSTEM_PROMPT env'inden okunur.
// Env yoksa generic bir fallback kullanilir — chat calisir ama kalite dusuk olur.
// Gercek prompt Vercel/Supabase env'lerine yazilir; repo'da saklamayiz.
const SYSTEM_PROMPT_FALLBACK = `Sen bir YKS asistanisin. Turkce konus, net ve kisa cevapla. Soruyu ogrenci seviyesinde adim adim coz.`

const SYSTEM_PROMPT = process.env.CHAT_SYSTEM_PROMPT || SYSTEM_PROMPT_FALLBACK

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
  const rl = await chatLimiter.check(user.id)
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

  const systemInstruction = questionContext
    ? `${SYSTEM_PROMPT}\n\nOgrencinin su anda calistigi soru:\n${questionContext}`
    : SYSTEM_PROMPT

  // Mesajlari Gemini formatina cevir
  const geminiContents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI servisi yapilandirilmamis.' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        },
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[Chat API] Gemini error:', res.status, errBody.substring(0, 500))
      return NextResponse.json(
        { error: `AI servisi hatasi: ${errBody.substring(0, 200)}` },
        { status: 502 }
      )
    }

    const json = await res.json().catch(() => null)
    if (!json) {
      return NextResponse.json(
        { error: 'AI servisinden gecersiz yanit alindi.' },
        { status: 502 }
      )
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || 'Cevap alinamadi.'

    // Streaming uyumlu response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    console.error('[Chat API] Fetch error:', err)
    return NextResponse.json(
      { error: `Baglanti hatasi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}` },
      { status: 502 }
    )
  }
}
