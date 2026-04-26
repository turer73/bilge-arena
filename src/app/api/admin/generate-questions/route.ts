import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { trLower, isLikelyTurkish } from '@/lib/utils/tr-text'

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
    // 2026-04-26: sosyoloji kategorisi DB'de mevcut (13 soru) ama TOPIC_MAP'te yoktu;
    // AI generator bu kategoriye konu listesi olmadan ureyemiyordu. YKS müfredatı sosyoloji konuları:
    sosyoloji: [
      'Toplum ve Birey',
      'Sosyal Yapı',
      'Toplumsal Kurumlar',
      'Toplumsal Değişme',
      'Aile',
      'Kültür ve Toplum',
      'Din ve Toplum',
      'Eğitim ve Toplum',
      'Toplumsal Tabakalaşma',
      'Toplumsal Hareketlilik',
    ],
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
  sosyoloji: 'Sosyoloji',
  vocabulary: 'İngilizce Kelime Bilgisi',
  grammar: 'İngilizce Dilbilgisi',
  cloze_test: 'İngilizce Boşluk Doldurma',
  dialogue: 'İngilizce Diyalog',
  restatement: 'İngilizce Yeniden İfade',
  sentence_completion: 'İngilizce Cümle Tamamlama',
  phrasal_verbs: 'İngilizce Phrasal Verbs',
}

// Template production'da QUESTION_GEN_PROMPT_TEMPLATE env'inden okunur.
// Env yoksa generic bir fallback kullanilir — soru uretimi calisir ama kalite dusuk olur
// (zorluk kalibrasyonu, secenek tasarim kurallari, few-shot directive'leri eksik).
// Gercek template Vercel/Supabase env'lerine yazilir; repo'da saklamayiz.
//
// Placeholder'lar: {categoryLabel}, {langRule}, {topicList}
// KRITIK: JSON key guardrail'i ("question", "options"...) fallback'te zorunlu — Gemini
// aksi halde Turkce key uretip JSON.parse'i patlatiyor (observed behavior, 2025-11).
const QUESTION_GEN_PROMPT_FALLBACK = `Sen YKS soru üretiyorsun. Kategori: {categoryLabel}.
- Her soru 5 seçenekli (A-E), 1 doğru cevap (index 0-4)
- {langRule}
- Zorluk seviyesine uygun, çözüm kısa ve net olmalı
- JSON formatında döndür
{topicList}

ÇIKTI FORMATI — JSON key isimleri İngilizce olmalı:
[{"question":"Soru metni","options":["A","B","C","D","E"],"answer":0,"solution":"Çözüm","topic":"Konu"}]

KRİTİK: JSON anahtarları MUTLAKA "question", "options", "answer", "solution", "topic" olmalı.
Türkçe key KULLANMA. SADECE JSON döndür, başka hiçbir şey yazma.`

// CEFR seviyesine gore AI'ye verilecek kelime/grammar kalibrasyon ipucu.
// 2026-04-26 (Tier C): Onceki versiyon C2 rubrigi ('Mastery: idiomatic
// native-like vocabulary...') tamamen Ingilizce'ydi -> Gemini bu rubrigin
// etkisinde solution'lari Ingilizce uretti (10 satir gozlemlendi). Drift
// kayniginda kapatildi: tum rehberler Turkce, "Ileri Duzey/Usta/Yetkin/Ana
// Dili" gibi acik Turkce yon-belirleyici kelimeler eklendi. Tek surum
// gercek (database/run-generation.mjs CLI ile birebir mirror edilir).
const CEFR_GUIDANCE: Record<string, string> = {
  A1: 'A1 — Başlangıç Düzeyi: en temel 500-1000 kelime, simple present/past, kısa cümleler, günlük basit konular',
  A2: 'A2 — Temel Düzey: yaygın 2000 kelime, present/past/future temel kullanım, basit bağlaç yapıları',
  B1: 'B1 — Orta Düzey: 3000-4000 kelime, present perfect, 1st conditional, edilgen yapılar',
  B2: 'B2 — Orta-İleri Düzey: deyimler, phrasal verb kullanımı, 2nd-3rd conditional, dolaylı anlatım',
  C1: 'C1 — İleri Düzey: nüanslı kelime hazinesi, karmaşık dilbilgisi yapıları, soyut konular, resmi register',
  C2: 'C2 — Usta Düzey (Ana Dili Yetkinliği): native-level deyimsel kullanım, karmaşık yapılar, soyut konular',
}

function buildSystemPrompt(game: string, category: string, levelTag: string | null): string {
  const isEnglish = game === 'wordquest'
  const categoryLabel = CATEGORY_LABELS[category] || category
  const topics = TOPIC_MAP[game]?.[category] || []
  const topicList = topics.length > 0 ? `\nBu kategorideki YKS konulari: ${topics.join(', ')}` : ''
  // Wordquest icin CEFR seviyesi prompt'a girer; aksi halde Gemini her zaman B2 zorlugunda
  // soru ureticek (eski hata). Diger oyunlarda level_tag yok, langRule sade kalir.
  const cefrLine = isEnglish && levelTag && CEFR_GUIDANCE[levelTag]
    ? `\nCEFR seviyesi: ${CEFR_GUIDANCE[levelTag]}. Soru zorlugu bu seviyeye uygun olmali.`
    : ''
  // 2026-04-26 (Tier C): "çözüm Türkçe olmalı" tek satir kural
  // Gemini'nin C2 Ingilizce rubrik ile birlikte gormesinde drift'i engelleyemedi.
  // Daha kuvvetli emir kipi + tekrar + ornek-yon belirtilen kalip kullanildi.
  const langRule = isEnglish
    ? `Soru metni İngilizce yazılmalı. ANCAK "solution" alanı MUTLAKA Türkçe yazılmalıdır — kesinlikle İngilizce kullanma. Örnek doğru kalıp: "elated kelimesi çok mutlu anlamına gelir".${cefrLine}`
    : 'Türkçe yazılmalı'

  const template = process.env.QUESTION_GEN_PROMPT_TEMPLATE || QUESTION_GEN_PROMPT_FALLBACK

  return template
    .replace(/\{categoryLabel\}/g, categoryLabel)
    .replace(/\{langRule\}/g, langRule)
    .replace(/\{topicList\}/g, topicList)
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

  const { game, category, difficulty, count = 5, topic, level_tag } = await req.json()

  if (!game || !category || !difficulty) {
    return NextResponse.json({ error: 'game, category, difficulty gerekli' }, { status: 400 })
  }

  // CEFR seviye dogrulamasi: verilirse sadece A1-C2 izinli (DB CHECK constraint ile uyumlu).
  // 2026-04-26 (Tier B): wordquest icin level_tag onceden form'da yoktu, generator bu alani sessizce
  // dusurup NULL ekliyordu. Artik UI gondermeli; dogrulanmadan ekleme yok.
  const VALID_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
  if (level_tag !== undefined && level_tag !== null && !(VALID_CEFR as readonly string[]).includes(level_tag)) {
    return NextResponse.json({ error: 'Gecersiz level_tag — A1/A2/B1/B2/C1/C2 olmali' }, { status: 400 })
  }
  // wordquest icin default 'B2' (seed davranisi: legacy 364 soru B2 etiketli);
  // diger oyunlarda level_tag anlamsiz, NULL olarak insert edilir (eski davranisi koruyor).
  const effectiveLevelTag: string | null = level_tag ?? (game === 'wordquest' ? 'B2' : null)

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
        const text = trLower((c.question || c.sentence || '').slice(0, 50))
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
        system_instruction: { parts: [{ text: buildSystemPrompt(game, category, effectiveLevelTag) }] },
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
      return NextResponse.json({ error: 'AI geçerli soru üretemedi', raw: text }, { status: 502 })
    }

    // ── Solution dil kontrolu (drift guard, sadece wordquest) ─────────
    // 2026-04-26 (Tier C): C2 prompt drift gozlemi sonrasi eklendi.
    // Defense-in-depth: asil kaynagi (CEFR rubrigi Turkce) duzelttik ama
    // Gemini gelecekte yine drift edebilir; runtime filtre satirin DB'ye
    // ulasmasini engeller. Sadece wordquest'te uygulanir cunku diger
    // oyunlar zaten Turkce ureticek.
    let languageDriftCount = 0
    const languageOkQuestions = game === 'wordquest'
      ? validQuestions.filter((q) => {
          if (!isLikelyTurkish(q.solution)) {
            languageDriftCount++
            return false
          }
          return true
        })
      : validQuestions

    if (languageOkQuestions.length === 0) {
      return NextResponse.json({
        error: `${validQuestions.length} soru üretildi ama tümü İngilizce solution içeriyor (CEFR drift)`,
        languageDriftCount,
      }, { status: 409 })
    }

    // ── Duplicate filtre ──────────────────────────────
    let duplicateCount = 0
    const uniqueQuestions = languageOkQuestions.filter((q) => {
      const prefix = trLower(q.question.slice(0, 50))
      if (existingPrefixes.has(prefix)) {
        duplicateCount++
        return false
      }
      existingPrefixes.add(prefix) // ayni batch icerisinde de tekrari engelle
      return true
    })

    if (uniqueQuestions.length === 0) {
      return NextResponse.json({
        error: `${languageOkQuestions.length} soru uretildi ama hepsi mevcut sorularla ayni`,
        duplicateCount,
      }, { status: 409 })
    }

    // ── Kaydet ────────────────────────────────────────
    const insertData = uniqueQuestions.map((q) => ({
      game,
      category,
      topic: q.topic || topic || null,
      difficulty: Number(difficulty),
      level_tag: effectiveLevelTag,
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
      languageDriftCount,
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
  const { game, category, topic, difficulty, question, options, answer, solution, level_tag } = body

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
    // CEFR enum — DB CHECK constraint ile birebir; manuel ekleme akisinda da
    // generator'in kabullendigi sema gecerli olmali (tek surum hakikat).
    level_tag: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  })

  const result = schema.safeParse({ game, category, topic, difficulty, question, options, answer, solution, level_tag })
  if (!result.success) {
    return NextResponse.json({ error: 'Gecersiz veri', details: result.error.flatten() }, { status: 400 })
  }

  const effectiveLevelTag: string | null = level_tag ?? (game === 'wordquest' ? 'B2' : null)

  const svc = createServiceRoleClient()
  const { data: inserted, error } = await svc
    .from('questions')
    .insert({
      game,
      category,
      topic: topic || null,
      difficulty,
      level_tag: effectiveLevelTag,
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
