// ============================================================
// Bilge Arena — Soru Yükleme Scripti
// Kullanım: node database/seed.js
// Gereksinim: SUPABASE_URL ve SUPABASE_SERVICE_KEY .env'de tanımlı olmalı
// ============================================================

const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_KEY env degiskenleri gerekli!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Zorluk haritası
const DIFFICULTY_MAP = {
  vocabulary:           2,
  phrasal_verbs:        2,
  restatement:          3,
  grammar:              3,
  sentence_completion:  3,
  dialogue:             3,
  cloze_test:           4,
}

// Level tag haritası (soru level'ından DB level_tag'e)
const LEVEL_MAP = { B1: 'B1', B2: 'B2', C1: 'C1', C2: 'C2', A2: 'A2' }

// ──────────────────────────────────────────
// WordQuest dönüştürücü
// ──────────────────────────────────────────
function transformWordQuest(data) {
  const rows = []

  for (const [category, questions] of Object.entries(data)) {
    if (category.startsWith('_') || !Array.isArray(questions)) continue

    for (const q of questions) {
      // Cloze test özel format
      if (category === 'cloze_test') {
        // Her passage için ana soru kaydı
        rows.push({
          external_id: q.id,
          game:         'wordquest',
          category:     'cloze_test',
          subcategory:  q.topic || null,
          difficulty:   DIFFICULTY_MAP.cloze_test,
          level_tag:    LEVEL_MAP[q.level] || 'B2',
          source:       'original',
          content: {
            type:    'cloze_test',
            passage: q.passage,
            blanks:  q.questions.length,
            questions: q.questions.map(sub => ({
              number:  sub.number,
              options: sub.options,
              correct: sub.answer,
            })),
          },
        })
        continue
      }

      // Dialogue özel format
      if (category === 'dialogue') {
        rows.push({
          external_id: q.id,
          game:         'wordquest',
          category:     'dialogue',
          difficulty:   DIFFICULTY_MAP.dialogue,
          level_tag:    LEVEL_MAP[q.level] || 'B2',
          source:       'original',
          content: {
            type:     'dialogue',
            lines:    q.dialogue,
            options:  q.options,
            correct:  q.answer,
          },
        })
        continue
      }

      // Standart soru formatı
      rows.push({
        external_id: q.id,
        game:         'wordquest',
        category,
        topic:        q.topic || null,
        difficulty:   DIFFICULTY_MAP[category] ?? 2,
        level_tag:    LEVEL_MAP[q.level] || 'B2',
        source:       'original',
        content: {
          type:      'multiple_choice',
          sentence:  q.sentence,
          options:   q.options,
          correct:   q.answer,
          structure: q.structure || null,
        },
      })
    }
  }

  return rows
}

// ──────────────────────────────────────────
// Ana yükleme fonksiyonu
// ──────────────────────────────────────────
async function seed() {
  console.log('🚀 Bilge Arena — Soru yükleme başlıyor...\n')

  // Soru bankasını oku
  const rawData = JSON.parse(
    readFileSync(join(__dirname, '../wordquest/data/questions.json'), 'utf-8')
  )

  const rows = transformWordQuest(rawData)
  console.log(`📦 Toplam dönüştürülen soru: ${rows.length}`)

  // Mevcut wordquest sorularını sil (temiz yükleme)
  const { error: delErr } = await supabase
    .from('questions')
    .delete()
    .eq('game', 'wordquest')

  if (delErr) {
    console.error('❌ Silme hatası:', delErr.message)
    process.exit(1)
  }
  console.log('🗑️  Mevcut wordquest soruları temizlendi')

  // Toplu yükleme (50'şer batch)
  const BATCH = 50
  let loaded = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)

    const { data, error } = await supabase
      .from('questions')
      .insert(batch)
      .select('id')

    if (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH)+1} hatası:`, error.message)
      errors += batch.length
    } else {
      loaded += data.length
      process.stdout.write(`\r✅ Yüklendi: ${loaded}/${rows.length}`)
    }
  }

  console.log('\n')
  console.log('─'.repeat(50))
  console.log(`✅ Başarıyla yüklenen: ${loaded}`)
  console.log(`❌ Hata:               ${errors}`)
  console.log('─'.repeat(50))

  // Kategori özeti
  const { data: summary } = await supabase
    .from('questions')
    .select('category')
    .eq('game', 'wordquest')

  if (summary) {
    const counts = summary.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1
      return acc
    }, {})
    console.log('\n📊 Kategori dağılımı:')
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, cnt]) => console.log(`   ${cat.padEnd(20)} ${cnt}`))
  }

  console.log('\n🎉 Yükleme tamamlandı!')
}

seed().catch(err => {
  console.error('💥 Beklenmeyen hata:', err)
  process.exit(1)
})
