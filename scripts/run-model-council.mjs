#!/usr/bin/env node
/**
 * Modeller arasi tartisma kosucusu koprusu.
 *
 * NEDEN BU KOPRU VAR:
 *   Kurul mantigi src/lib/model-council/ altinda TypeScript. Node ESM
 *   uzantisiz import ('./types') cozmez, `@/` alias'ini hic bilmez. Vite'in
 *   ssrLoadModule'u ikisini de UYGULAMANIN KENDISIYLE ayni sekilde cozer.
 *   (Ayni kopru deseni: database/run-question-audit.mjs)
 *
 * GUVENLIK: --confirm olmadan HICBIR LLM cagrisi yapilmaz. Plan ve cagri
 *   tavani basilir, cikilir. Modeller arasi bir donguyu yanlislikla baslatmak
 *   kolay olmamali.
 *
 * Kullanim:
 *   npm run council -- --topic "Rate limit katmanini sec" --participants codex,claude
 *   npm run council -- --topic "..." --participants codex,claude --confirm
 *   npm run council -- --brief-file plan.md --context-file src/app/api/chat/route.ts --confirm
 *   npm run council -- --topic "..." --rounds 4 --out kurul.json --confirm
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

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

function parseArgs(argv) {
  const a = {
    topic: null,
    briefFile: null,
    contextFile: null,
    participants: process.env.COUNCIL_PARTICIPANTS || 'codex,claude',
    rounds: Number(process.env.COUNCIL_ROUNDS || 3),
    criteria: [],
    out: 'model-council-run.json',
    maxCalls: Number(process.env.COUNCIL_MAX_CALLS || 60),
    confirm: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--topic') a.topic = argv[++i]
    else if (k === '--brief-file') a.briefFile = argv[++i]
    else if (k === '--context-file') a.contextFile = argv[++i]
    else if (k === '--participants') a.participants = argv[++i]
    else if (k === '--rounds') a.rounds = Number(argv[++i])
    else if (k === '--criterion') a.criteria.push(argv[++i])
    else if (k === '--out') a.out = argv[++i]
    else if (k === '--max-calls') a.maxCalls = Number(argv[++i])
    else if (k === '--confirm') a.confirm = true
    else if (k === '--help' || k === '-h') a.help = true
  }
  return a
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf-8').split('*/')[0])
  process.exit(0)
}

function readFileArg(path, label) {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) {
    console.error(`${label} bulunamadi: ${full}`)
    process.exit(1)
  }
  return readFileSync(full, 'utf-8')
}

const brief = args.briefFile ? readFileArg(args.briefFile, '--brief-file') : args.topic
if (!brief) {
  console.error('Konu yok. --topic "..." veya --brief-file <yol> ver.')
  process.exit(1)
}

const server = await createServer({
  root,
  // `@/` alias'i UYGULAMAYLA AYNI sekilde cozulmeli — koprunun varlik sebebi
  // bu (tsconfig paths / vitest.config.ts ile ayni esleme). Alias olmadan
  // `@/lib/llm/transport-core` gibi importlar "module not found" verir.
  resolve: { alias: { '@': join(root, 'src') } },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
})

let exitCode = 0
try {
  const { runCouncil, DEFAULT_COUNCIL_CONFIG } = await server.ssrLoadModule('/src/lib/model-council/council.ts')
  const { resolveParticipants, parseParticipantSpec, KNOWN_PARTICIPANTS } = await server.ssrLoadModule(
    '/src/lib/model-council/participants.ts',
  )

  const ids = parseParticipantSpec(args.participants)
  if (ids.length === 0) {
    console.error(`Katilimci yok. --participants ile ver. Taninanlar: ${KNOWN_PARTICIPANTS.join(', ')}`)
    process.exit(1)
  }

  const { participants, missingKeys } = resolveParticipants(ids, process.env)

  const topic = {
    title: args.topic ?? (args.briefFile ?? 'Kurul'),
    brief,
    context: args.contextFile ? readFileArg(args.contextFile, '--context-file') : null,
    successCriteria: args.criteria,
  }

  const config = {
    ...DEFAULT_COUNCIL_CONFIG,
    maxRounds: args.rounds,
    maxTotalCalls: args.maxCalls,
  }

  console.log('== KURUL PLANI ==')
  console.log(`Konu             : ${topic.title}`)
  console.log(`Katilimci        : ${participants.map((p) => `${p.displayName} (${p.provider.modelId})`).join(', ') || '-'}`)
  console.log(`Tur              : ${config.maxRounds}`)
  console.log(`Cagri tavani     : ${config.maxTotalCalls} (gercek saglayici cagrisi, tekrar denemeler DAHIL)`)
  console.log(
    `Tahmini cagri    : ${participants.length * config.maxRounds}` +
      ` (hatasiz kosuda; her tekrar deneme +1, en kotu ihtimalle x${config.maxAttempts})`,
  )
  if (topic.context) console.log(`Baglam           : ${topic.context.length} karakter`)

  // ANAHTARSIZ KATILIMCI SESSIZCE DUSURULMEZ: aksi halde kullanici "Codex ve
  // Claude tartisti" sanir, oysa Codex hic cagrilmamistir ve rapordaki
  // "uzlasma" tek modelin monologudur.
  if (missingKeys.length > 0) {
    console.log('')
    for (const m of missingKeys) {
      console.log(`!! ${m.id} KURULA GIRMEDI — anahtar yok (bakilan: ${m.tried.join(', ')})`)
    }
  }

  if (participants.length === 0) {
    console.error('\nHicbir katilimci kurulamadi — anahtarlari .env.local icine yaz.')
    process.exit(1)
  }
  if (participants.length < 2) {
    console.log('\n!! UYARI: tek katilimci var. Tek modelin monologu tartisma DEGILDIR;')
    console.log('   sonuc "inconclusive" olarak raporlanacak.')
  }

  if (!args.confirm) {
    console.log('\nDRY-RUN: --confirm verilmedi, hicbir LLM cagrisi yapilmadi.')
    process.exit(0)
  }

  console.log('\n== TARTISMA ==')
  const run = await runCouncil(topic, participants, config, {
    onMessage: (m) => {
      console.log(`\n[${m.id}] ${m.displayName} — ${m.payload.stance}${m.payload.blocking ? ' (BLOKLAYICI)' : ''}`)
      console.log(`  ${m.payload.position}`)
      if (m.payload.openQuestions.length) {
        console.log(`  acik: ${m.payload.openQuestions.join(' | ')}`)
      }
    },
    onFailure: (id, round, message) => console.log(`\n  ! ${id} tur ${round} basarisiz — ${message}`),
    onRoundEnd: (round) => console.log(`\n-- tur ${round} bitti --`),
  })

  console.log('\n== SONUC ==')
  console.log(`Durum            : ${run.outcome.kind}`)
  console.log(`Gerekce          : ${run.outcome.rationale}`)
  console.log(`Tur              : ${run.roundsRun}/${config.maxRounds}`)
  console.log(`Cagri            : ${run.totalCalls}/${config.maxTotalCalls} (tekrar denemeler dahil)`)
  console.log(`Token            : in=${run.inputTokens} out=${run.outputTokens}`)
  console.log(`Basarisiz tur    : ${run.transcript.failures.length}`)
  if (run.outcome.openQuestions.length > 0) {
    console.log('Acik sorular:')
    for (const q of run.outcome.openQuestions) console.log(`  - ${q}`)
  }
  console.log('\nAyakta duran pozisyonlar:')
  for (const s of run.outcome.standing) {
    console.log(`  ${s.displayName.padEnd(10)} ${s.stance.padEnd(9)} ${s.position}`)
  }

  // OKUMA UYARISI: arizali bir hatta "uzlasma" anlamsizdir. Iki sayi ayni
  // ekranda dursun (question-audit runner'inda ayni uyari, ayni gerekce).
  if (run.transcript.failures.length > 0) {
    console.log(
      `\n!! ${run.transcript.failures.length} tur basarisiz oldu. Sonuc bu hatta EKSIK katilimla uretildi.`,
    )
  }

  const outPath = resolve(process.cwd(), args.out)
  writeFileSync(outPath, JSON.stringify(run, null, 2))
  console.log(`\nTutanak: ${args.out}`)

  // Cikis kodu otomasyon icin anlamli: yalniz gercek uzlasma 0 doner.
  exitCode = run.outcome.kind === 'converged' ? 0 : 1
} catch (e) {
  console.error(`\nKurul kosusu basarisiz: ${e instanceof Error ? e.stack : String(e)}`)
  exitCode = 1
} finally {
  await server.close()
}

process.exit(exitCode)
