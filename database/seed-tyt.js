/**
 * TYT Soru Bankasi → Supabase seed scripti
 *
 * Kullanim:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node database/seed-tyt.js
 *
 * Gereksinim:
 *   npm install @supabase/supabase-js
 *
 * Not: Service role key kullanir (RLS bypass). Anon key degil!
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

// TYT dosyalari → game mapping
const FILES = [
  { file: '../../tyt_matematik.json', game: 'matematik' },
  { file: '../../tyt_turkce.json', game: 'turkce' },
  { file: '../../tyt_fen.json', game: 'fen' },
  { file: '../../tyt_sosyal.json', game: 'sosyal' },
]

function loadQuestions(filePath, game) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, filePath), 'utf-8'))
  const categories = Object.keys(raw).filter(k => k !== 'meta')

  const questions = []
  for (const cat of categories) {
    for (const q of raw[cat]) {
      questions.push({
        game,
        category: q.category || cat,
        sub_category: q.topic || null,
        difficulty: q.difficulty || 2,
        content: {
          question: q.question,
          options: q.options,
          answer: q.answer,         // 0-based index (JSON zaten bu formatta)
          solution: q.solution || null,
        },
        is_active: true,
      })
    }
  }
  return questions
}

async function seed() {
  console.log('TYT soru bankasi yukleniyor...\n')

  let totalInserted = 0

  for (const { file, game } of FILES) {
    const questions = loadQuestions(file, game)
    console.log(`${game}: ${questions.length} soru yukleniyor...`)

    // Batch insert (100'er)
    const BATCH = 100
    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = questions.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from('questions')
        .insert(batch)
        .select('id')

      if (error) {
        console.error(`  HATA (${game}, batch ${i}):`, error.message)
      } else {
        totalInserted += data.length
        process.stdout.write(`  ${i + data.length}/${questions.length} yuklendi\r`)
      }
    }
    console.log(`  ✓ ${game} tamamlandi`)
  }

  console.log(`\n✅ Toplam ${totalInserted} soru yuklendi!`)
}

seed().catch(err => {
  console.error('Seed hatasi:', err)
  process.exit(1)
})
