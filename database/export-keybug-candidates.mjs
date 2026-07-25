#!/usr/bin/env node
/**
 * Answer-key-bug adaylarını (≥5 oynanmış, <%35 doğruluk) tam içerikle JSON'a aktarır.
 * Judge fazının (judge-keybugs.mjs) girdisi. Sayaçlar mig-082 + repair sonrası temiz
 * olduğundan doğruluk istatistiği güvenilir (2026-07-25).
 *
 * node database/export-keybug-candidates.mjs > database/keybug-candidates.json
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const MIN_PLAY = 5
const LOW_ACC = 0.35
const games = ['matematik', 'turkce', 'sosyal', 'fen']

const out = []
for (const game of games) {
  let from = 0
  while (true) {
    const { data, error } = await s.from('questions')
      .select('id,game,category,subcategory,difficulty,content,times_answered,times_correct')
      .eq('game', game).eq('is_active', true).range(from, from + 999)
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) }
    if (!data?.length) break
    for (const r of data) {
      const ta = r.times_answered || 0, tc = r.times_correct || 0
      if (ta >= MIN_PLAY && tc / ta < LOW_ACC) {
        const c = r.content || {}
        out.push({
          id: r.id, game: r.game, category: r.category, difficulty: r.difficulty,
          ta, tc, acc: Math.round((tc / ta) * 100),
          question: c.question || c.sentence || '',
          options: c.options || [],
          answer: (c.answer != null ? c.answer : c.correct),
          solution: c.solution || '',
        })
      }
    }
    if (data.length < 1000) break
    from += 1000
  }
}
out.sort((a, b) => b.ta - a.ta)
console.log(JSON.stringify(out, null, 1))
console.error(`TOPLAM ADAY: ${out.length} (` + games.map(g => `${g}:${out.filter(x => x.game === g).length}`).join(', ') + ')')
