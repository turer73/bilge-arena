#!/usr/bin/env node
/**
 * Soru Bankası Envanter Aracı
 * --------------------------------------------------------------
 * Production Supabase'de questions tablosunun aktif kayıtlarını
 * game + category bazında sayar; sonucu hem konsola hem de
 * sabit bir snapshot dosyasına (database/inventory-snapshot.json)
 * yazar.
 *
 * Kullanım:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node database/inventory-questions.mjs
 *
 * Notlar:
 *   - Service role key kullanır (RLS bypass). is_active=true filtreli.
 *   - Salt-okunur; INSERT/UPDATE yapmaz.
 *   - Snapshot dosyası planlama dökümanlarında referans almak içindir.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_KEY env değişkenleri gerekli.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GAMES = ['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']

async function fetchAllActive() {
  // PostgREST default cap = 1000 satır. Pagination ile tamamını çekiyoruz.
  // Sayfa boyutu 1000 (PostgREST üst sınırı varsayılan), .range(start, end) inclusive.
  const PAGE = 1000
  const all = []
  let totalCount = 0
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error, count } = await supabase
      .from('questions')
      .select('game, category, difficulty, level_tag, is_active', { count: 'exact' })
      .eq('is_active', true)
      .range(from, from + PAGE - 1)

    if (error) {
      throw new Error(`Supabase select error: ${error.message}`)
    }
    if (count !== null && count !== undefined) totalCount = count
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return { data: all, totalCount }
}

async function countByGameCategory() {
  const { data, totalCount } = await fetchAllActive()
  const count = totalCount

  const byGame = {}
  for (const game of GAMES) {
    byGame[game] = {
      total: 0,
      byCategory: {},
      byDifficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byLevel: {},
    }
  }

  for (const row of data ?? []) {
    const g = row.game
    if (!byGame[g]) {
      // Schema dışı game değeri; istisna olarak yakala
      byGame[g] = {
        total: 0,
        byCategory: {},
        byDifficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        byLevel: {},
      }
    }
    byGame[g].total += 1
    byGame[g].byCategory[row.category] = (byGame[g].byCategory[row.category] ?? 0) + 1
    if (row.difficulty in byGame[g].byDifficulty) {
      byGame[g].byDifficulty[row.difficulty] += 1
    }
    if (row.level_tag) {
      byGame[g].byLevel[row.level_tag] = (byGame[g].byLevel[row.level_tag] ?? 0) + 1
    }
  }

  return { totalActive: count ?? data?.length ?? 0, byGame }
}

function formatSummary({ totalActive, byGame }) {
  const lines = []
  lines.push(`Toplam aktif soru: ${totalActive}`)
  lines.push('')

  for (const game of Object.keys(byGame).sort()) {
    const b = byGame[game]
    lines.push(`[${game}] toplam=${b.total}`)
    const cats = Object.entries(b.byCategory).sort((a, c) => c[1] - a[1])
    for (const [cat, n] of cats) {
      lines.push(`  - ${cat}: ${n}`)
    }
    const diffs = Object.entries(b.byDifficulty).filter(([, n]) => n > 0)
    if (diffs.length) {
      lines.push(`  difficulty: ${diffs.map(([d, n]) => `${d}=${n}`).join(' ')}`)
    }
    const levels = Object.entries(b.byLevel)
    if (levels.length) {
      lines.push(`  level_tag: ${levels.map(([l, n]) => `${l}=${n}`).join(' ')}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function fetchPlayDistribution() {
  // Son 30 gündeki game_sessions dağılımı (status=completed) — talep sinyali.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const PAGE = 1000
  const all = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('game, status')
      .eq('status', 'completed')
      .gte('started_at', since)
      .range(from, from + PAGE - 1)
    if (error) {
      throw new Error(`Supabase select error (game_sessions): ${error.message}`)
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  const byGame = {}
  for (const row of all) {
    byGame[row.game] = (byGame[row.game] ?? 0) + 1
  }
  return { since, totalSessions: all.length, byGame }
}

async function main() {
  const snapshot = await countByGameCategory()
  const summary = formatSummary(snapshot)
  console.log(summary)

  const plays = await fetchPlayDistribution()
  console.log('Son 30 gün tamamlanmış oyun seansı dağılımı:')
  console.log(`  Toplam: ${plays.totalSessions} (since ${plays.since})`)
  for (const [game, n] of Object.entries(plays.byGame).sort((a, c) => c[1] - a[1])) {
    console.log(`  ${game}: ${n}`)
  }

  const outPath = resolve(__dirname, 'inventory-snapshot.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      { takenAt: new Date().toISOString(), ...snapshot, plays },
      null,
      2
    ),
    'utf-8'
  )
  console.log(`\nSnapshot yazıldı: ${outPath}`)
}

main().catch((err) => {
  console.error('Envanter hatası:', err)
  process.exit(1)
})
