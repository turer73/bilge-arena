#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

function valueOf(name, fallback = null) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} <deger> ister`)
  return value
}

function loadEnv(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
  return env
}

async function all(db, table, columns, apply = (query) => query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(db.from(table).select(columns)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.code || ''} ${error.message || error.details || 'query failed'}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function canonicalContentHash(content) {
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex')
}

const envPath = resolve(valueOf('--env') ?? '.env.local')
const outDir = resolve(valueOf('--out-dir') ?? 'secure/question-audit-gold-v1')
const seed = valueOf('--seed')
const policyVersion = valueOf('--policy-version', 'question-quality@2')
if (!seed) throw new Error('--seed <sabit-deger> zorunlu')
if (existsSync(outDir)) throw new Error(`cikti dizini zaten var; ustune yazilmadi: ${outDir}`)

const env = loadEnv(envPath)
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase URL/service role eksik')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const [questions, revisions, decisions] = await Promise.all([
  all(db, 'questions', 'id,published_revision_id,game,category,subcategory,topic,exam_ref,difficulty', (query) => (
    query.eq('is_active', true).not('published_revision_id', 'is', null).order('id')
  )),
  all(db, 'question_content_revisions', 'id,question_id,game,category,subcategory,topic,exam_ref,difficulty,content,content_sha256,status', (query) => (
    query.eq('status', 'published').order('id')
  )),
  all(db, 'question_validation_decisions', 'revision_id,content_sha256,policy_version,verdict,decided_at', (query) => (
    query.eq('policy_version', policyVersion).order('decided_at')
  )),
])

const revisionById = new Map(revisions.map((revision) => [revision.id, revision]))
const decisionByRevision = new Map(decisions.map((decision) => [`${decision.revision_id}:${decision.content_sha256}`, decision]))
let excludedWithoutContentBoundSignal = 0
const candidates = questions.flatMap((question) => {
  const revision = revisionById.get(question.published_revision_id)
  if (!revision || revision.question_id !== question.id) throw new Error(`aktif published revision bulunamadi: ${question.id}`)
  const signalHash = canonicalContentHash(revision.content)
  const decision = decisionByRevision.get(`${revision.id}:${signalHash}`)
  if (!decision) {
    excludedWithoutContentBoundSignal++
    return []
  }
  return [{
    questionId: question.id,
    revisionId: revision.id,
    contentSha256: revision.content_sha256,
    game: revision.game,
    category: revision.category,
    subcategory: revision.subcategory,
    topic: revision.topic,
    examRef: revision.exam_ref,
    difficulty: revision.difficulty,
    content: revision.content,
    verdict: decision.verdict,
  }]
})

const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule('/src/lib/question-audit/review-pack.ts')
  const selected = mod.selectBlindReviewSet(candidates, { seed, perGame: 20, flaggedPerGame: 10 })
  const packet = mod.toBlindReviewPacket(selected)
  const reviewerRefs = { reviewerA: randomBytes(32).toString('hex'), reviewerB: randomBytes(32).toString('hex') }
  const template = (reviewerRef) => ({
    schemaVersion: 'question-audit-review@1',
    reviewerRef,
    role: 'reviewer',
    labels: packet.items.map((item) => ({
      questionId: item.questionId,
      contentSha256: item.contentSha256,
      flawCodes: null,
    })),
  })

  mkdirSync(outDir, { recursive: true })
  writeJson(resolve(outDir, 'coordinator-manifest.json'), {
    schemaVersion: 'question-audit-review-coordinator@1',
    createdAt: new Date().toISOString(),
    selectionId: packet.selectionId,
    seed,
    policyVersion,
    selectionDesign: {
      total: selected.length,
      eligibleCurrentPolicyRevisions: candidates.length,
      excludedWithoutContentBoundSignal,
      perGame: 20,
      approvedPerGame: 10,
      flaggedPerGame: 10,
      selectionSignalHash: 'canonical-content-sha256-v1',
      goldBindingHash: 'question_content_revisions.content_sha256',
      note: 'Prediction-stratified audit sample; not a prevalence estimate. Reviewers never receive the prediction stratum.',
    },
    reviewerRefs,
    items: packet.items.map(({ content: _content, ...item }) => item),
  })
  writeJson(resolve(outDir, 'blind-review-packet.json'), packet)
  writeJson(resolve(outDir, 'reviewer-a.labels.json'), template(reviewerRefs.reviewerA))
  writeJson(resolve(outDir, 'reviewer-b.labels.json'), template(reviewerRefs.reviewerB))
  writeFileSync(resolve(outDir, 'README.md'), `# Kör insan-altın inceleme paketi\n\n- \`blind-review-packet.json\` dosyasını iki alan uzmanına birbirinden bağımsız verin.\n- Reviewer A yalnız \`reviewer-a.labels.json\`, Reviewer B yalnız \`reviewer-b.labels.json\` üzerinde çalışır.\n- Her \`flawCodes: null\` alanı inceleme sonunda bir dizi olmalıdır. Temiz soru için \`[]\` kullanılır.\n- İzinli kodlar: WRONG_KEY_SUSPECTED, NO_CORRECT_OPTION, MULTIPLE_CORRECT, MISSING_PREMISE, AMBIGUOUS_WORDING, STEM_MISSING_TOKEN, SOLUTION_CONTRADICTS_ANSWER, INCOMPLETE_SOLUTION, LOGICAL_FALLACY.\n- Uzmanlar model kararını, selection stratum bilgisini ve birbirlerinin etiketlerini görmez.\n- Kimlik/hash/reviewerRef alanları değiştirilmez.\n- Tamamlanan iki dosya \`npm run audit:build-gold\` ile birleştirilir; ayrışma varsa üçüncü uzman yalnız ayrışan maddeleri adjudike eder.\n`)
  console.log(JSON.stringify({ outDir, selectionId: packet.selectionId, labels: selected.length, games: mod.REVIEW_GAMES }))
} finally {
  await server.close()
}
