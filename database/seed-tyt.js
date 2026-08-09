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

async function loadQuestionContentGuard() {
  const {
    createTdkGuard,
    parseExpandedTdkTokenPairs,
    parseFixtureTdkTokenPairs,
    validateGeneratedQuestionContent,
  } = await import('../src/lib/admin/question-content-guard.mjs')

  const tokenPairs = []
  const tdkJsonPath = path.resolve(__dirname, '../src/lib/validations/data/tdk-tokens-expanded.json')
  const tdkFixturePath = path.resolve(__dirname, '../src/lib/validations/tdk-rules.fixture.ts')
  if (fs.existsSync(tdkJsonPath)) {
    try {
      tokenPairs.push(...parseExpandedTdkTokenPairs(JSON.parse(fs.readFileSync(tdkJsonPath, 'utf-8'))))
    } catch (err) {
      console.warn('TDK JSON yuklenemedi:', err.message)
    }
  }
  if (fs.existsSync(tdkFixturePath)) {
    try {
      tokenPairs.push(...parseFixtureTdkTokenPairs(fs.readFileSync(tdkFixturePath, 'utf-8')))
    } catch (err) {
      console.warn('TDK fixture yuklenemedi:', err.message)
    }
  }

  return {
    tdkGuard: createTdkGuard(tokenPairs),
    validateGeneratedQuestionContent,
  }
}

// TYT dosyalari → game mapping
const FILES = [
  { file: '../data/soru-bankasi/tyt_matematik.json', game: 'matematik' },
  { file: '../data/soru-bankasi/tyt_turkce.json', game: 'turkce' },
  { file: '../data/soru-bankasi/tyt_fen.json', game: 'fen' },
  { file: '../data/soru-bankasi/tyt_sosyal.json', game: 'sosyal' },
]

function loadQuestions(filePath, game) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, filePath), 'utf-8'))
  const categories = Object.keys(raw).filter(k => k !== 'meta')

  const questions = []
  for (const cat of categories) {
    for (const q of raw[cat]) {
      questions.push({
        // stable-key. Codex #260-E: idempotent-reseed için .upsert({onConflict:'external_id'})
        // gerekir AMA external_id UNIQUE-index ister (ayrı migration). Şimdilik plain-insert.
        external_id: q.id || null,
        game,
        category: q.category || cat,
        subcategory: q.topic || null,
        difficulty: q.difficulty || 2,
        content: {
          question: q.question,
          options: q.options,
          answer: q.answer,         // 0-based index (JSON zaten bu formatta)
          solution: q.solution || null,
        },
        exam_ref: 'TYT',
        is_active: true,
      })
    }
  }
  return questions
}

async function seed() {
  console.log('TYT soru bankasi yukleniyor...\n')
  const guard = await loadQuestionContentGuard()

  let totalInserted = 0

  for (const { file, game } of FILES) {
    const loadedQuestions = loadQuestions(file, game)
    const questions = []
    const rejected = []
    for (const row of loadedQuestions) {
      const err = guard.validateGeneratedQuestionContent(row.content, { game: row.game, tdkGuard: guard.tdkGuard })
      if (err) rejected.push({ external_id: row.external_id, err, q: row.content.question?.slice(0, 60) })
      else questions.push(row)
    }
    console.log(`${game}: ${questions.length} soru yukleniyor...`)
    if (rejected.length > 0) {
      console.log(`${game}: ${rejected.length} soru kalite guard tarafindan reddedildi`)
      for (const r of rejected.slice(0, 10)) console.log(`  ${r.external_id || '?'} [${r.err}] ${r.q}`)
      if (rejected.length > 10) console.log(`  ... ${rejected.length - 10} ek red gizlendi`)
    }

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
