#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const MIN_PLAY = 5
const LOW_ACC = 0.35
const GAMES = ['turkce', 'sosyal']

async function fetchAll(game) {
  let out = [], from = 0
  while (true) {
    const { data, error } = await s.from('questions')
      .select('id,game,category,difficulty,content,times_answered,times_correct,is_active')
      .eq('game', game).eq('is_active', true).range(from, from + 999)
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) }
    if (!data?.length) break
    out.push(...data); if (data.length < 1000) break; from += 1000
  }
  return out
}

let allCandidates = []
for (const game of GAMES) {
  const rows = await fetchAll(game)
  console.log(`${game}: ${rows.length} aktif soru`)
  for (const r of rows) {
    const ta = r.times_answered || 0, tc = r.times_correct || 0
    if (ta >= MIN_PLAY && tc / ta < LOW_ACC) {
      const c = r.content || {}
      allCandidates.push({
        id: r.id, game: r.game, category: r.category, difficulty: r.difficulty,
        times_answered: ta, times_correct: tc,
        content: c,
      })
    }
  }
  console.log(`  aday: ${allCandidates.filter(x => x.game === game).length}`)
}

console.log(`\nToplam aday: ${allCandidates.length}`)

const outPath = join(__dirname, 'audit-keybug-candidates.json')
writeFileSync(outPath, JSON.stringify(allCandidates, null, 2))
console.log(`Kaydedildi: ${outPath}`)
