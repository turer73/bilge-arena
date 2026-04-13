import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ── Kategori bazli YKS konu listesi ─────────────────────
const TOPIC_MAP: Record<string, Record<string, string[]>> = {
  matematik: {
    sayilar: ['Bölünebilme', 'Asal Sayılar', 'EBOB-EKOK', 'Tam Sayılar', 'Üslü Sayılar', 'Köklü Sayılar', 'Rasyonel Sayılar', 'Mutlak Değer', 'Ondalık Sayılar', 'Yüzdeler', 'Oran Orantı'],
    problemler: ['Yaş Problemleri', 'İşçi Problemleri', 'Havuz Problemleri', 'Hız Problemleri', 'Karışım Problemleri', 'Kar-Zarar', 'Sayı Problemleri', 'Rakam Problemleri', 'Kesir Problemleri'],
    geometri: ['Üçgenler', 'Dörtgenler', 'Çember ve Daire', 'Alan Hesaplama', 'Açılar', 'Benzerlik', 'Pisagor Teoremi', 'Koordinat Geometri'],
    denklemler: ['1. Derece Denklemler', 'Denklem Sistemleri', 'Eşitsizlikler', 'Mutlak Değerli Denklemler'],
    fonksiyonlar: ['Fonksiyon Kavramı', 'Bileşke Fonksiyon', 'Ters Fonksiyon', 'Polinom'],
    olasilik: ['Permütasyon', 'Kombinasyon', 'Olasılık', 'Veri Analizi', 'İstatistik'],
  },
  turkce: {
    paragraf: ['Ana Düşünce', 'Yardımcı Düşünce', 'Paragraf Tamamlama', 'Paragraf Sıralama', 'Başlık Belirleme'],
    dil_bilgisi: ['Sözcük Türleri', 'Cümle Öğeleri', 'Fiil Çekimi', 'Ek ve Kök', 'Yapım Ekleri'],
    sozcuk: ['Eş Anlamlı', 'Zıt Anlamlı', 'Mecaz Anlam', 'Deyimler', 'Atasözleri'],
    anlam_bilgisi: ['Cümle Anlamı', 'Söz Yorumu', 'Anlam İlişkileri'],
    yazim_kurallari: ['Noktalama', 'Yazım Kuralları', 'Büyük Harf Kullanımı'],
  },
  fen: {
    fizik: ['Kuvvet ve Hareket', 'Enerji', 'Isı ve Sıcaklık', 'Basınç', 'Elektrik', 'Dalgalar', 'Optik'],
    kimya: ['Atom ve Periyodik Tablo', 'Kimyasal Bağlar', 'Asit-Baz', 'Karışımlar', 'Kimyasal Tepkimeler', 'Mol Kavramı'],
    biyoloji: ['Hücre', 'Canlıların Sınıflandırılması', 'Ekosistem', 'Kalıtım', 'DNA ve Gen', 'Sindirim Sistemi', 'Dolaşım Sistemi'],
  },
  sosyal: {
    tarih: ['İlk Türk Devletleri', 'Osmanlı Kuruluş', 'Osmanlı Yükseliş', 'Tanzimat', 'Kurtuluş Savaşı', 'Atatürk İnkılapları', 'Çok Partili Dönem'],
    cografya: ['İklim', 'Nüfus', 'Göç', 'Harita Bilgisi', 'Türkiye Coğrafyası', 'Doğal Afetler', 'Ekonomik Coğrafya'],
    felsefe: ['Felsefenin Alanı', 'Bilgi Felsefesi', 'Ahlak Felsefesi', 'Mantık', 'Psikoloji', 'Sosyoloji'],
  },
  wordquest: {
    vocabulary: ['Synonyms', 'Antonyms', 'Contextual Meaning', 'Word Families', 'Collocations'],
    grammar: ['Tenses', 'Conditionals', 'Passive Voice', 'Relative Clauses', 'Modals'],
    cloze_test: ['Reading Comprehension', 'Vocabulary in Context'],
    dialogue: ['Daily Conversations', 'Formal Situations'],
    restatement: ['Sentence Rewriting', 'Paraphrasing'],
    sentence_completion: ['Grammar Completion', 'Vocabulary Completion'],
    phrasal_verbs: ['Common Phrasal Verbs', 'Idiomatic Expressions'],
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  sayilar: 'Sayılar ve İşlemler',
  problemler: 'Problemler',
  geometri: 'Geometri',
  denklemler: 'Denklemler',
  fonksiyonlar: 'Fonksiyonlar',
  olasilik: 'Olasılık ve İstatistik',
  paragraf: 'Paragraf Anlama',
  dil_bilgisi: 'Dil Bilgisi',
  sozcuk: 'Sözcük Anlamı',
  anlam_bilgisi: 'Anlam Bilgisi',
  yazim_kurallari: 'Yazım Kuralları',
  fizik: 'Fizik',
  kimya: 'Kimya',
  biyoloji: 'Biyoloji',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  felsefe: 'Felsefe ve Mantık',
  vocabulary: 'İngilizce Kelime Bilgisi',
  grammar: 'İngilizce Dilbilgisi',
  cloze_test: 'İngilizce Boşluk Doldurma',
  dialogue: 'İngilizce Diyalog',
  restatement: 'İngilizce Yeniden İfade',
  sentence_completion: 'İngilizce Cümle Tamamlama',
  phrasal_verbs: 'İngilizce Phrasal Verbs',
}

function buildSystemPrompt(game: string, category: string): string {
  const isEnglish = game === 'wordquest'
  const lang = isEnglish ? 'Ingilizce' : 'Turkce'
  const topics = TOPIC_MAP[game]?.[category] || []
  const topicList = topics.length > 0 ? `\nBu kategorideki YKS konulari: ${topics.join(', ')}` : ''

  return `Sen deneyimli bir YKS soru yazarisin. ${CATEGORY_LABELS[category] || category} alaninda uzmansin.

KURALLAR:
- Her soru 5 secenekli (A-E) olmali
- Tam olarak 1 dogru cevap olmali (0-4 index)
- ${isEnglish ? 'Soru metni Ingilizce, cozum Turkce olmali' : 'Turkce yazilmali'}
- Zorluk seviyesine KESINLIKLE uygun olmali
- Cozum aciklamasi kisa, net ve ogretici olmali
- Secenekler mantikli ve yaniltici olmali (rastgele deger koyma)
- Mevcut sorulardan FARKLI sorular uret
- JSON formatinda dondur
${topicList}

ZORLUK SEVIYELERI:
1: Temel bilgi — dogrudan hatirlatma, tek islem
2: Basit uygulama — tek adim, formul uygulama
3: Orta seviye — birden fazla adim, bilgi birlestirme
4: Zor — analiz, sentez, cok adimli cozum
5: Uzman — tuzakli, derin anlama, YKS seviyesinde

CIKTI FORMATI — JSON key isimleri INGILIZCE olmali, degistirme:
[
  {
    "question": "Soru metni buraya (Turkce)",
    "options": ["A secenegi", "B secenegi", "C secenegi", "D secenegi", "E secenegi"],
    "answer": 0,
    "solution": "Kisa cozum aciklamasi (Turkce)",
    "topic": "Konu adi"
  }
]

KRITIK: JSON anahtarlari (key) MUTLAKA "question", "options", "answer", "solution", "topic" olmali.
Turkce key KULLANMA ("soru", "secenekler", "cevap" gibi key KULLANMA).
SADECE JSON dondur, baska hicbir sey yazma.`
}

/**
 * POST /api/admin/generate-questions — AI ile soru uretimi
 * Body: { game, category, difficulty, count, topic? }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.generate')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { game, category, difficulty, count = 5, topic } = await req.json()

  if (!game || !category || !difficulty) {
    return NextResponse.json({ error: 'game, category, difficulty gerekli' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY ayarlanmamis' }, { status: 500 })
  }

  // ── Few-shot: mevcut 3 soruyu ornek olarak cek ───────
  let fewShotText = ''
  try {
    let query = supabase
      .from('questions')
      .select('content')
      .eq('game', game)
      .eq('category', category)
      .eq('is_active', true)
      .limit(3)

    if (topic) query = query.eq('topic', topic)

    const { data: examples } = await query
    if (examples && examples.length > 0) {
      const formatted = examples.map((e, i) => {
        const c = e.content as { question?: string; sentence?: string; options?: string[]; answer?: number; solution?: string }
        const q = c.question || c.sentence || ''
        const opts = (c.options || []).map((o, j) => `  ${String.fromCharCode(65 + j)}) ${o}`).join('\n')
        return `Ornek ${i + 1}:\nSoru: ${q}\n${opts}\nDogru: ${String.fromCharCode(65 + (c.answer ?? 0))}\nCozum: ${c.solution || '-'}`
      })
      fewShotText = `\n\nMEVCUT ORNEKLER (bunlara benzer ama FARKLI sorular uret):\n${formatted.join('\n\n')}`
    }
  } catch {
    // Few-shot opsiyonel — hata olursa devam et
  }

  // ── Mevcut soru metinlerini duplicate kontrolu icin cek ──
  const existingPrefixes: Set<string> = new Set()
  try {
    const { data: existing } = await supabase
      .from('questions')
      .select('content')
      .eq('game', game)
      .eq('category', category)
      .limit(500)

    if (existing) {
      for (const e of existing) {
        const c = e.content as { question?: string; sentence?: string }
        const text = (c.question || c.sentence || '').slice(0, 50).toLowerCase()
        if (text) existingPrefixes.add(text)
      }
    }
  } catch {
    // Duplicate kontrolu opsiyonel
  }

  const categoryLabel = CATEGORY_LABELS[category] || category
  const topicLine = topic ? `\nKonu: ${topic}` : ''
  const userPrompt = `${count} adet ${categoryLabel} sorusu uret.
Oyun: ${game}
Kategori: ${category}${topicLine}
Zorluk: ${difficulty}/5
Soru sayisi: ${count}${fewShotText}`

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(game, category) }] },
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

    // JSON parse — bozuk JSON'i temizlemeye calis
    let questions
    try {
      questions = JSON.parse(text)
    } catch {
      try {
        // Markdown code block icinde olabilir
        const match = text.match(/\[[\s\S]*\]/)
        if (match) {
          // Bozuk karakter temizligi: trailing comma, kontrol karakterleri
          const cleaned = match[0]
            .replace(/,\s*([}\]])/g, '$1')           // trailing comma
            .replace(/[\x00-\x1F\x7F]/g, ' ')       // kontrol karakterleri
            .replace(/\n/g, ' ')                      // newline
          questions = JSON.parse(cleaned)
        }
      } catch {
        // Son care: her {...} bloğunu ayri parse et
        try {
          const blocks = text.match(/\{[^{}]*\}/g) || []
          questions = blocks
            .map((b: string) => { try { return JSON.parse(b) } catch { return null } })
            .filter(Boolean)
        } catch {
          // Tamamen basarisiz
        }
      }
      if (!questions || (Array.isArray(questions) && questions.length === 0)) {
        return NextResponse.json({ error: 'AI yaniti JSON olarak okunamadi' }, { status: 502 })
      }
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'AI dizisi bekleniyor', raw: text }, { status: 502 })
    }

    // Zod dogrulama
    const { z } = await import('zod')
    const questionSchema = z.object({
      question: z.string().min(10).max(2000),
      options: z.array(z.string().min(1).max(500)).length(5),
      answer: z.number().int().min(0).max(4),
      solution: z.string().min(5).max(3000),
      topic: z.string().optional(),
    })

    type QData = { question: string; options: string[]; answer: number; solution: string; topic?: string }
    const parsed = questions.map((q: unknown) => questionSchema.safeParse(q))
    const validQuestions: QData[] = parsed
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: QData }).data)

    if (validQuestions.length === 0) {
      return NextResponse.json({ error: 'AI gecerli soru uretemedi', raw: text }, { status: 502 })
    }

    // ── Duplicate filtre ──────────────────────────────
    let duplicateCount = 0
    const uniqueQuestions = validQuestions.filter((q) => {
      const prefix = q.question.slice(0, 50).toLowerCase()
      if (existingPrefixes.has(prefix)) {
        duplicateCount++
        return false
      }
      existingPrefixes.add(prefix) // ayni batch icerisinde de tekrari engelle
      return true
    })

    if (uniqueQuestions.length === 0) {
      return NextResponse.json({
        error: `${validQuestions.length} soru uretildi ama hepsi mevcut sorularla ayni`,
        duplicateCount,
      }, { status: 409 })
    }

    // ── Kaydet ────────────────────────────────────────
    const insertData = uniqueQuestions.map((q) => ({
      game,
      category,
      topic: q.topic || topic || null,
      difficulty: Number(difficulty),
      content: {
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
      },
      source: 'ai_generated',
      is_active: false,
    }))

    const svc = createServiceRoleClient()
    const { data: inserted, error } = await svc
      .from('questions')
      .insert(insertData)
      .select('id')

    if (error) {
      console.error('[AI Generate] Insert hatasi:', error)
      return NextResponse.json({ error: 'Sorular kaydedilemedi: ' + error.message }, { status: 500 })
    }

    return NextResponse.json({
      generated: validQuestions.length,
      saved: inserted?.length || 0,
      duplicateCount,
      questions: uniqueQuestions,
    })
  } catch (err) {
    console.error('[AI Generate] Hata:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Soru uretim hatasi: ' + msg }, { status: 500 })
  }
}

/**
 * PUT /api/admin/generate-questions — Manuel soru ekleme
 * Body: { game, category, topic?, difficulty, question, options, answer, solution }
 */
export async function PUT(req: Request) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.edit')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const body = await req.json()
  const { game, category, topic, difficulty, question, options, answer, solution } = body

  // Dogrulama
  const { z } = await import('zod')
  const schema = z.object({
    game: z.string().min(1),
    category: z.string().min(1),
    topic: z.string().optional(),
    difficulty: z.number().int().min(1).max(5),
    question: z.string().min(10).max(2000),
    options: z.array(z.string().min(1).max(500)).length(5),
    answer: z.number().int().min(0).max(4),
    solution: z.string().min(5).max(3000),
  })

  const result = schema.safeParse({ game, category, topic, difficulty, question, options, answer, solution })
  if (!result.success) {
    return NextResponse.json({ error: 'Gecersiz veri', details: result.error.flatten() }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data: inserted, error } = await svc
    .from('questions')
    .insert({
      game,
      category,
      topic: topic || null,
      difficulty,
      content: { question, options, answer, solution },
      source: 'manual',
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Manuel Soru] Insert hatasi:', error)
    return NextResponse.json({ error: 'Soru kaydedilemedi' }, { status: 500 })
  }

  return NextResponse.json({ id: inserted.id, success: true })
}

/**
 * GET /api/admin/generate-questions?game=X&category=Y — Konu listesi
 * DB'deki mevcut topic'leri dondurur.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const game = searchParams.get('game')
  const category = searchParams.get('category')

  // Statik konu listesi
  const staticTopics = (game && category) ? (TOPIC_MAP[game]?.[category] || []) : []

  // DB'den mevcut topic'ler
  let dbTopics: string[] = []
  if (game && category) {
    const { data } = await supabase
      .from('questions')
      .select('topic')
      .eq('game', game)
      .eq('category', category)
      .not('topic', 'is', null)

    if (data) {
      dbTopics = Array.from(new Set(data.map((d) => d.topic as string).filter(Boolean)))
    }
  }

  // Birlestir ve tekrarlari kaldir
  const allTopics = Array.from(new Set([...staticTopics, ...dbTopics])).sort()

  return NextResponse.json({ topics: allTopics })
}
