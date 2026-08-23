#!/usr/bin/env node
/**
 * Kalibrasyon kosucusu koprusu.
 *
 * NEDEN BU KOPRU VAR:
 *   Kosucu mantigi src/lib/question-audit/ altinda TypeScript. Node ESM
 *   uzantisiz import ('./types') cozmez, `@/` alias'ini hic bilmez. Vite'in
 *   ssrLoadModule'u ikisini de UYGULAMANIN KENDISIYLE ayni sekilde cozer.
 *
 *   Alternatifler ve neden secilmediler:
 *   - tsx devDep: ~10-25MB esbuild indirir ve kendi cozumleme kurallarini
 *     getirir (uygulamayla birebir ayni olmaz).
 *   - vitest harness: 30 dakikalik batch isi test degil; timeout, worker
 *     omru, stdout tamponlama ve `npm test`'in kazara toplamasi sorun olur.
 *   - vite: vitest@4 ile zaten diskte, ek indirme YOK.
 *
 * DIKKAT: `vite` su an TRANSITIF bagimlilik (vitest uzerinden). Kalici
 *   kullanim icin `npm install --save-dev vite@8` ile acikca sabitlenmeli —
 *   sifir indirme, ama package.json'a elle satir eklemek `npm ci`'i bozar
 *   (lockfile senkronu), o yuzden install komutuyla yapilmali.
 *
 * Kullanim:
 *   npm run audit:calibrate                          # dry-run (plan + maliyet)
 *   npm run audit:calibrate -- --limit 50 --confirm
 *   npm run audit:calibrate -- --category matematik --samples 3 --confirm
 *   npm run audit:calibrate -- --revision-id <uuid> --persist --confirm
 *   npm run audit:calibrate -- --governance-ready --persist --confirm
 *   npm run audit:calibrate -- --provider deepseek --persist --no-decisions --confirm
 *   npm run audit:calibrate -- --persist --promotion-report benchmark.json --confirm
 *   npm run audit:calibrate -- --gold-labels secure/gold-labels.json --confirm
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// .env.local yukle (repo'daki mevcut script deseni)
const envPath = join(root, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok — .env.local kontrol et.')
  process.exit(1)
}
const sb = createClient(supabaseUrl, serviceKey)

const PAGE = 1000 // Supabase tek istekte en fazla bu kadar satir doner

async function attachPublishedRevisionHashes(rows) {
  const withoutPointer = rows.filter((row) => !row.published_revision_id)
  if (withoutPointer.length > 0) {
    throw new Error(`aktif soru published revision pointer tasimiyor: ${withoutPointer.length}/${rows.length}`)
  }
  const revisionIds = [...new Set(rows.map((row) => row.published_revision_id).filter(Boolean))]
  const revisions = new Map()
  for (let offset = 0; offset < revisionIds.length; offset += 100) {
    const { data, error } = await sb
      .from('question_content_revisions')
      .select('id, question_id, content_sha256, status')
      .in('id', revisionIds.slice(offset, offset + 100))
    if (error) throw new Error(`supabase published revision hashes: ${error.message}`)
    for (const revision of data ?? []) revisions.set(revision.id, revision)
  }
  const missing = rows.filter((row) => !revisions.has(row.published_revision_id))
  if (missing.length > 0) throw new Error(`published revision hash bulunamadi: ${missing.length}/${revisionIds.length}`)
  return rows.map((row) => {
    const revision = revisions.get(row.published_revision_id)
    if (revision.question_id !== row.id || revision.status !== 'published') {
      throw new Error(`published revision pointer gecersiz: ${row.id}:${row.published_revision_id}`)
    }
    if (!/^[a-f0-9]{64}$/i.test(String(revision.content_sha256))) {
      throw new Error(`published revision DB hash gecersiz: ${row.id}:${row.published_revision_id}`)
    }
    return { ...row, content_sha256: revision.content_sha256 }
  })
}

/**
 * Aktif sorulari ceker. Kalibrasyon salt-okuma: hicbir yazma yapilmaz.
 *
 * SAYFALAMA SART: banka 4434 aktif soru tasiyor, tek istek 1000'de kesiliyor.
 * Sayfalamasiz "tam banka kosusu" sessizce ilk 1000 soruyu olcup tam sanilirdi.
 */
async function fetchRows(args) {
  if (args.goldLabelsPath) {
    const labels = JSON.parse(readFileSync(resolve(args.goldLabelsPath), 'utf8'))
    if (!Array.isArray(labels) || labels.length === 0) throw new Error('gold label listesi bos veya gecersiz')
    const wanted = new Map()
    for (const label of labels) {
      if (
        !label || typeof label.questionId !== 'string'
        || typeof label.contentSha256 !== 'string'
        || !/^[a-f0-9]{64}$/i.test(label.contentSha256)
      ) throw new Error('gold label questionId/contentSha256 gecersiz')
      const key = `${label.questionId}:${label.contentSha256.toLowerCase()}`
      if (wanted.has(key)) throw new Error(`yinelenen gold label secimi: ${key}`)
      wanted.set(key, label)
    }

    const matched = new Map()
    for (let offset = 0; offset < labels.length; offset += 100) {
      const batch = labels.slice(offset, offset + 100)
      const { data, error } = await sb
        .from('question_content_revisions')
        .select('id, question_id, game, category, subcategory, topic, exam_ref, difficulty, content, content_sha256, status')
        .in('question_id', batch.map((label) => label.questionId))
        .in('content_sha256', batch.map((label) => label.contentSha256.toLowerCase()))
        .order('id', { ascending: true })
      if (error) throw new Error(`supabase gold revisions: ${error.message}`)
      for (const revision of data ?? []) {
        const key = `${revision.question_id}:${String(revision.content_sha256).toLowerCase()}`
        if (wanted.has(key) && !matched.has(key)) matched.set(key, revision)
      }
    }
    const missing = [...wanted.keys()].filter((key) => !matched.has(key))
    if (missing.length > 0) throw new Error(`gold revision bulunamadi: ${missing.length}/${wanted.size}`)
    return [...wanted.keys()].map((key) => {
      const r = matched.get(key)
      return {
        id: r.question_id,
        game: r.game,
        category: r.category,
        subcategory: r.subcategory,
        topic: r.topic,
        exam_ref: r.exam_ref,
        difficulty: r.difficulty,
        content: r.content,
        published_revision_id: r.id,
        content_sha256: r.content_sha256,
      }
    })
  }
  if (args.revisionId || args.governanceReady) {
    let q = sb
      .from('question_content_revisions')
      .select('id, question_id, game, category, subcategory, topic, exam_ref, difficulty, content, content_sha256, status')
    if (args.revisionId) q = q.eq('id', args.revisionId)
    else q = q.eq('status', 'stage2_approved')
    if (args.category) q = q.eq('category', args.category)
    if (args.game) q = q.eq('game', args.game)
    const { data, error } = await q.order('id', { ascending: true }).limit(args.limit)
    if (error) throw new Error(`supabase revisions: ${error.message}`)
    return (data ?? []).map((r) => ({
      id: r.question_id,
      game: r.game,
      category: r.category,
      subcategory: r.subcategory,
      topic: r.topic,
      exam_ref: r.exam_ref,
      difficulty: r.difficulty,
      content: r.content,
      published_revision_id: r.id,
      content_sha256: r.content_sha256,
    }))
  }
  const rows = []
  for (let from = 0; from < args.limit; from += PAGE) {
    const to = Math.min(from + PAGE, args.limit) - 1
    let q = sb
      .from('questions')
      .select('id, game, category, subcategory, topic, exam_ref, difficulty, content, published_revision_id')
      .eq('is_active', true)
    if (args.category) q = q.eq('category', args.category)
    if (args.game) q = q.eq('game', args.game)
    // ORDER BY sart: Postgres siralamasiz sorguda satir sirasini garanti etmez.
    // Onsuz iki kosu FARKLI kumeler ceker ve sonuclar karsilastirilamaz
    // (ilk pilotta tam bu oldu: --limit 3 ve --limit 50 ortusmeyen kumeler verdi).
    // Sayfalamada ayrica sayfa sinirlarinin kaymamasi icin zorunlu.
    const { data, error } = await q.order('id', { ascending: true }).range(from, to)
    if (error) throw new Error(`supabase: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < to - from + 1) break
  }
  return attachPublishedRevisionHashes(rows)
}

/**
 * Ham kosuyu question_validation_runs'a yazar (migration 134).
 * Yalniz --persist verilince aktif: migration canliya uygulanmadan cagrilirsa
 * her satir hata verir ve kosu gurultuye bogulur.
 */
async function persistRun(rows) {
  const { error } = await sb.from('question_validation_runs').upsert(rows, {
    // Basarisiz onceki deneme yeni kosuda iyilestiyse satiri guncelle.
    onConflict: 'question_id,content_sha256,agent,sample_index,provider_id,model_id,prompt_version,generation_config_sha256',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(error.message)
}

async function persistDecision(decision) {
  const { error: decisionError } = await sb.from('question_validation_decisions').upsert(decision, {
    onConflict: 'revision_id,content_sha256,policy_version',
    ignoreDuplicates: false,
  })
  if (decisionError) throw new Error(`decision: ${decisionError.message}`)
}

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
try {
  const mod = await server.ssrLoadModule('/src/lib/question-audit/runner.ts')
  const benchmark = await server.ssrLoadModule('/src/lib/question-audit/benchmark.ts')
  const persistence = await server.ssrLoadModule('/src/lib/question-audit/persistence.ts')
  const goldIndex = process.argv.indexOf('--gold-labels')
  if (goldIndex !== -1) {
    const goldPath = process.argv[goldIndex + 1]
    if (!goldPath || goldPath.startsWith('--')) throw new Error('--gold-labels <json> ister')
    const labels = JSON.parse(readFileSync(resolve(goldPath), 'utf8'))
    benchmark.validateGoldLabels(labels)
  }
  const deps = { fetchRows }
  if (process.argv.includes('--persist')) {
    deps.persistRun = persistRun
    // --no-decisions: ham kosulari yaz ama YETKILI KARARI EZME.
    //
    // question_validation_runs dedup'i provider_id iceriyor, yani iki
    // saglayicinin ham ciktilari yan yana durabilir. Fakat
    // question_validation_decisions UNIQUE(revision_id, content_sha256,
    // policy_version) — saglayici TASIMIYOR — ve kopru ignoreDuplicates:false
    // ile upsert ediyor. Yani ikincil bir saglayiciyla --persist kosmak
    // birincil saglayicinin TUM kararlarini ezer ve yayin kapisi onun
    // verdict'lerine doner.
    //
    // Capraz-model karsilastirmasinda ikincil saglayici KANIT uretmeli,
    // yetkili karari degistirmemeli. Bu bayrak o ayrimi saglar.
    if (!process.argv.includes('--no-decisions')) {
      const promotionIndex = process.argv.indexOf('--promotion-report')
      const promotionPath = promotionIndex === -1 ? null : process.argv[promotionIndex + 1]
      if (!promotionPath || promotionPath.startsWith('--')) {
        throw new Error('yetkili karar yazimi --promotion-report <benchmark.json> ister; benchmark oncesi --no-decisions kullanin')
      }
      deps.promotionEvidence = JSON.parse(readFileSync(resolve(promotionPath), 'utf8'))
      deps.persistDecision = persistDecision
    }
    deps.loadCachedRun = async (draft, identity) => {
      const { data, error } = await sb
        .from('question_validation_runs')
        .select('*')
        .eq('question_id', draft.questionId)
        .eq('content_sha256', draft.contentSha256)
        .eq('generation_config_sha256', identity.generationConfigSha256)
      if (error) throw new Error(`onbellek sorgusu: ${error.message}`)
      const rows = (data ?? []).filter((row) => {
        const role = row.agent === 'blind_solver' ? 'blind' : row.agent === 'adversarial' ? 'adversarial' : 'verifier'
        return row.provider_id === identity.providerIds[role]
          && row.model_id === identity.modelIds[role]
          && row.prompt_version === identity.promptVersions[role]
      })
      if (rows.length === 0 || rows.some((row) => row.status === 'failed')) return null
      try {
        return persistence.fromValidationRunRows(rows)
      } catch {
        // Eksik/eski satir grubu cache miss'tir; ucretli kosu onu tamamlar.
        return null
      }
    }
  }
  const report = await mod.main(process.argv.slice(2), deps)
  process.exitCode = report ? 0 : 0
} catch (e) {
  console.error('KOSU HATASI:', e?.stack || e)
  process.exitCode = 1
} finally {
  await server.close()
}
