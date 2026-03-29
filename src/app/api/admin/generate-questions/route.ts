import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `Sen bir YKS soru yazarisin. Verilen oyun, kategori ve zorluk seviyesine gore coktan secmeli sorular uretiyorsun.

KURALLAR:
- Her soru 5 secenekli (A-E) olmali
- Tam olarak 1 dogru cevap olmali (0-4 index)
- Turkce yazilmali
- Zorluk seviyesine uygun olmali (1=kolay, 5=uzman)
- Cozum aciklamasi kisa ve net olmali
- JSON formatinda dondur

ZORLUK SEVIYELERI:
1: Temel bilgi, dogrudan hatirlatma
2: Basit uygulama, tek adim
3: Orta seviye, birden fazla adim
4: Zor, analiz ve sentez gerektiren
5: Uzman, cok adimli ve tuzakli

CIKTI FORMATI (JSON dizisi):
[
  {
    "question": "Soru metni",
    "options": ["A secenegi", "B secenegi", "C secenegi", "D secenegi", "E secenegi"],
    "answer": 0,
    "solution": "Cozum aciklamasi"
  }
]

SADECE JSON dondur, baska hicbir sey yazma.`

/**
 * POST /api/admin/generate-questions
 * Admin icin AI ile soru uretimi.
 * Body: { game, category, difficulty, count }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Admin kontrolu
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const { game, category, difficulty, count = 5 } = await req.json()

  if (!game || !category || !difficulty) {
    return NextResponse.json({ error: 'game, category, difficulty gerekli' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY ayarlanmamis' }, { status: 500 })
  }

  const CATEGORY_LABELS: Record<string, string> = {
    sayilar: 'Sayilar ve islemler',
    problemler: 'Problemler',
    geometri: 'Geometri',
    paragraf: 'Paragraf anlama',
    dil_bilgisi: 'Dil bilgisi',
    sozcuk: 'Sozcuk anlami',
    fizik: 'Fizik',
    kimya: 'Kimya',
    biyoloji: 'Biyoloji',
    tarih: 'Tarih',
    cografya: 'Cografya',
    felsefe: 'Felsefe ve mantik',
    vocabulary: 'Ingilizce kelime bilgisi',
    grammar: 'Ingilizce dilbilgisi',
    cloze: 'Ingilizce bosluk doldurma',
    dialogue: 'Ingilizce diyalog',
  }

  const categoryLabel = CATEGORY_LABELS[category] || category
  const userPrompt = `${count} adet ${categoryLabel} sorusu uret.
Oyun: ${game}
Kategori: ${category}
Zorluk: ${difficulty}/5
Soru sayisi: ${count}`

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    })

    const json = await res.json().catch(() => null)
    if (!json) {
      return NextResponse.json({ error: 'AI servisinden gecersiz yanit' }, { status: 502 })
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      return NextResponse.json({ error: 'AI yanit uretmedi' }, { status: 502 })
    }

    // JSON parse
    let questions
    try {
      questions = JSON.parse(text)
    } catch {
      // Bazen markdown code block icinde donuyor
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        questions = JSON.parse(match[0])
      } else {
        return NextResponse.json({ error: 'AI yaniti JSON olarak okunamadi', raw: text }, { status: 502 })
      }
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'AI dizisi bekleniyor', raw: text }, { status: 502 })
    }

    // Sorulari Supabase'e kaydet
    const insertData = questions.map((q: { question: string; options: string[]; answer: number; solution: string }) => ({
      game,
      category,
      difficulty: Number(difficulty),
      content: {
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
      },
      source: 'ai_generated',
      is_active: false, // Admin onaylayana kadar pasif
    }))

    const { data: inserted, error } = await supabase
      .from('questions')
      .insert(insertData)
      .select('id')

    if (error) {
      console.error('[AI Generate] Insert hatasi:', error)
      return NextResponse.json({ error: 'Sorular kaydedilemedi' }, { status: 500 })
    }

    return NextResponse.json({
      generated: questions.length,
      saved: inserted?.length || 0,
      questions, // Onizleme icin
    })
  } catch (err) {
    console.error('[AI Generate] Hata:', err)
    return NextResponse.json({ error: 'Soru uretim hatasi' }, { status: 500 })
  }
}
