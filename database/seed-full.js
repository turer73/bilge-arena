/**
 * Full Soru Bankasi → Supabase seed scripti
 * tyt_soru_bankasi_full.json dosyasindaki 600 soruyu yukler.
 *
 * Kullanim:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node database/seed-full.js
 *
 * Not: Service role key kullanir (RLS bypass). Anon key degil!
 *      Mevcut TYT sorulariyla duplicate olabilir — external_id ile kontrol eder.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_KEY env degiskenleri gerekli!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function loadFullBank() {
  const filePath = path.resolve(__dirname, '../../tyt_soru_bankasi_full.json')
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const questions = []

  for (const [game, gameData] of Object.entries(raw.subjects)) {
    const categories = Object.keys(gameData).filter(k => k !== 'meta')

    for (const cat of categories) {
      for (const q of gameData[cat]) {
        questions.push({
          external_id: q.id || null,
          game,
          category: q.category || cat,
          subcategory: q.topic || null,
          difficulty: q.difficulty || 2,
          content: {
            question: q.question,
            options: q.options,
            answer: q.answer,
            solution: q.solution || null,
          },
          source: 'tyt_full_bank',
          is_active: true,
        })
      }
    }
  }

  return questions
}

async function seed() {
  console.log('Full soru bankasi yukleniyor...\n')

  const questions = loadFullBank()
  console.log(`Toplam: ${questions.length} soru bulundu\n`)

  // Oyun bazli dagilim
  const stats = {}
  for (const q of questions) {
    stats[q.game] = (stats[q.game] || 0) + 1
  }
  for (const [game, count] of Object.entries(stats)) {
    console.log(`  ${game}: ${count} soru`)
  }
  console.log()

  // Mevcut external_id'leri kontrol et (duplicate onleme)
  const { data: existing } = await supabase
    .from('questions')
    .select('external_id')
    .eq('source', 'tyt_full_bank')
    .not('external_id', 'is', null)

  const existingIds = new Set((existing || []).map(q => q.external_id))
  const newQuestions = questions.filter(q => !q.external_id || !existingIds.has(q.external_id))

  if (newQuestions.length === 0) {
    console.log('Tum sorular zaten yuklu — yeni soru yok.')
    return
  }

  console.log(`${newQuestions.length} yeni soru yuklenecek (${questions.length - newQuestions.length} duplicate atlandi)\n`)

  // Batch insert
  let totalInserted = 0
  const BATCH = 100

  for (let i = 0; i < newQuestions.length; i += BATCH) {
    const batch = newQuestions.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('questions')
      .insert(batch)
      .select('id')

    if (error) {
      console.error(`  HATA (batch ${i}):`, error.message)
    } else {
      totalInserted += data.length
      process.stdout.write(`  ${totalInserted}/${newQuestions.length} yuklendi\r`)
    }
  }

  console.log(`\n\n✅ Toplam ${totalInserted} yeni soru yuklendi!`)
}

seed().catch(err => {
  console.error('Seed hatasi:', err)
  process.exit(1)
})
