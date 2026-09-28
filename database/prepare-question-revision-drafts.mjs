#!/usr/bin/env node
/**
 * Pilot bulgularindan taslak revizyon paketi
 * ============================================================================
 * Antigravity pilotlari (1-4) ve deterministik tarama, yayimli sorularda kusur
 * adaylari uretir. Bu adaylar YAYIN degil, TASLAKTIR: migration 106/142
 * yonetisimine gore bir sorunun icerigi yalniz `create_question_content_revision`
 * ile taslak olur, iki BAGIMSIZ insan `review_question_content_revision` ile
 * (stage 1, stage 2) onaylar ve `publish_question_content_revision` yayimlar.
 * Pasife alma da bir revizyondur: changeKind='retire' (is_active elle
 * degistirilmez; `trg_question_content_direct_mutation_guard` bunu 42501 ile
 * zaten reddeder).
 *
 * Bu betik oneri dosyasini (question-revision-proposals@1) alir, her soru icin
 * mevcut yayimli revizyonu, kazanim eslemesini ve kaynak kaydini okur, RPC'nin
 * `content_governance_validate_payload` sozlesmesine uyan payload'i kurar,
 * deterministik taramadan gecirir ve:
 *   - varsayilan (kuru calisma): payload'lari, inceleme sayfasini ve raporu
 *     out-dir'e yazar; DB'ye DOKUNMAZ.
 *   - --apply --user-id <hazirlayan>: yalniz "ready" ogeler icin taslak acar.
 *     Inceleme, yayin, karantina ve is_active bu betigin yetkisinde DEGILDIR.
 *
 * YETKI SINIRI: Hicbir LLM ciktisi (pilot cozucusu, oneri metni) tek basina
 * yayin, ret veya karantina otoritesi degildir. Bu betik yalniz taslak acar;
 * iki insan onayi RPC tarafinda zorunludur (hazirlayan kendi taslagini
 * inceleyemez, stage 1 ve stage 2 ayni kisi olamaz).
 *
 * Kullanim:
 *   npm run revision:drafts -- --proposals secure/revision-proposals.json
 *   npm run revision:drafts -- --proposals ... --rows secure/16-flawed-questions.json   # DB yoksa cevrimdisi onizleme
 *   npm run revision:drafts -- --proposals ... --apply --user-id <uuid>                 # taslaklari ac
 * Secenekler: --env .env.local  --out-dir secure/revision-drafts/<batch>
 *
 * Oneri dosyasi: database/__fixtures__/question-revision-proposals/ altindaki
 * example.json (calisan ornek) ve pilot1-4.skeleton.json (16 soru iskeleti).
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanQuestion } from './scan-question-text-defects.mjs'

export const PROPOSALS_SCHEMA = 'question-revision-proposals@1'
export const CONTENT_KEYS = ['question', 'options', 'answer', 'solution', 'explanation', 'hint', 'sentence', 'passage', 'context', 'type']
export const METADATA_KEYS = ['game', 'category', 'subcategory', 'topic', 'difficulty', 'levelTag', 'examRef', 'isBoss']
export const SOURCE_KEYS = ['kind', 'title', 'url', 'licenseCode', 'licenseUrl', 'attribution', 'provenanceRef']
export const CHANGE_KINDS = ['edit', 'correct_answer', 'retire']
export const SEVERITIES = ['P0', 'P1', 'P2']
const GAMES = ['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']
const SOURCE_KINDS = ['original', 'licensed', 'public_domain', 'user_generated', 'official_exam']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WEIGHT_RE = /^(0([.][0-9]{1,3})?|1([.]0{1,3})?)$/
const DEFAULT_SOURCE = { kind: 'original', title: 'Bilge Arena soru bankasi', licenseCode: 'INTERNAL' }

// ── Yardimcilar ──────────────────────────────────────────────────────────────
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]))
  return value
}
const canon = (v) => JSON.stringify(canonicalize(v))
export const sameContent = (a, b) => canon(a) === canon(b)

/** Ayni soru + ayni payload her zaman ayni istek kimligini uretir: RPC'nin
 * content_governance_requests dedup'u ile yeniden calistirma taslagi cogaltmaz. */
export function draftRequestId(questionId, payload) {
  const h = createHash('sha256').update(`question-revision-draft:${questionId}:${canon(payload)}`).digest('hex')
  const v = '4' + h.slice(13, 16)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k]
  return out
}

// ── Oneri dosyasi ────────────────────────────────────────────────────────────
export function validateProposal(p, index = 0) {
  const errors = []
  const at = `proposals[${index}]`
  if (!p || typeof p !== 'object') return [`${at}: nesne degil`]
  if (typeof p.ref !== 'string' || !p.ref.trim()) errors.push(`${at}.ref: zorunlu`)
  if (p.status === 'needs_patch') {
    // Iskelet ogesi: yalniz kimlik ve bulgu; patch/questionId sonra doldurulur.
    if (!p.finding || typeof p.finding !== 'object' || typeof p.finding.summary !== 'string') errors.push(`${at}.finding.summary: zorunlu`)
    return errors
  }
  if (typeof p.questionId !== 'string' || !UUID_RE.test(p.questionId)) errors.push(`${at}.questionId: uuid degil`)
  const f = p.finding
  if (!f || typeof f !== 'object') errors.push(`${at}.finding: zorunlu`)
  else {
    if (typeof f.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,60}$/.test(f.code)) errors.push(`${at}.finding.code: BUYUK_HARF_KODU bekleniyor`)
    if (!SEVERITIES.includes(f.severity)) errors.push(`${at}.finding.severity: ${SEVERITIES.join('|')}`)
    if (typeof f.summary !== 'string' || !f.summary.trim()) errors.push(`${at}.finding.summary: zorunlu`)
  }
  if (!Array.isArray(p.evidence) || p.evidence.some((e) => typeof e !== 'string' || !e.trim())) errors.push(`${at}.evidence: string dizisi`)
  if (!CHANGE_KINDS.includes(p.changeKind)) errors.push(`${at}.changeKind: ${CHANGE_KINDS.join('|')}`)
  if (!p.patch || typeof p.patch !== 'object' || Array.isArray(p.patch)) errors.push(`${at}.patch: nesne`)
  else {
    for (const k of Object.keys(p.patch)) if (!CONTENT_KEYS.includes(k)) errors.push(`${at}.patch.${k}: izinli icerik alani degil`)
    if (p.changeKind === 'retire' && Object.keys(p.patch).length) errors.push(`${at}: retire icin patch bos olmali`)
    if (p.changeKind !== 'retire' && !Object.keys(p.patch).length) errors.push(`${at}: ${p.changeKind} icin patch bos olamaz`)
  }
  if (typeof p.rationale !== 'string' || !p.rationale.trim()) errors.push(`${at}.rationale: zorunlu`)
  if (p.outcomes !== undefined && !Array.isArray(p.outcomes)) errors.push(`${at}.outcomes: dizi`)
  if (p.status !== undefined && p.status !== 'ready' && p.status !== 'needs_patch') errors.push(`${at}.status: ready|needs_patch`)
  return errors
}

export function parseProposals(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') return { batch: null, proposals: [], errors: ['oneri dosyasi nesne degil'] }
  if (raw.schemaVersion !== PROPOSALS_SCHEMA) errors.push(`schemaVersion ${PROPOSALS_SCHEMA} olmali`)
  const batch = raw.batch && typeof raw.batch === 'object' ? raw.batch : null
  if (!batch || typeof batch.title !== 'string' || !batch.title.trim()) errors.push('batch.title zorunlu')
  const proposals = Array.isArray(raw.proposals) ? raw.proposals : []
  if (!proposals.length) errors.push('proposals bos')
  proposals.forEach((p, i) => errors.push(...validateProposal(p, i)))
  const refs = new Set(); const qids = new Map()
  proposals.forEach((p, i) => {
    if (refs.has(p?.ref)) errors.push(`proposals[${i}].ref tekrar: ${p.ref}`); refs.add(p?.ref)
    if (p?.status === 'needs_patch') return // iskelet ogesi: questionId henuz yok
    if (qids.has(p?.questionId)) errors.push(`proposals[${i}].questionId tekrar: ${p.questionId} (ilk: ${qids.get(p.questionId)})`); qids.set(p?.questionId, p?.ref)
  })
  return { batch, proposals, errors }
}

// ── Mevcut durum: DB satirlarindan tek nesne ─────────────────────────────────
/** question: questions satiri; revision: yayimli question_content_revisions satiri;
 * outcomes: question_outcomes satirlari; source: question_revision_sources satiri. */
export function currentFromRows({ question, revision, outcomes = [], source = null }) {
  if (!question) return null
  const content = revision?.content ?? question.content ?? null
  return {
    questionId: question.id,
    baseRevisionId: question.published_revision_id ?? revision?.id ?? null,
    isActive: question.is_active !== false,
    content,
    metadata: {
      game: question.game, category: question.category, subcategory: question.subcategory ?? undefined, topic: question.topic ?? undefined,
      difficulty: question.difficulty, levelTag: question.level_tag ?? undefined, examRef: question.exam_ref ?? undefined, isBoss: question.is_boss ?? undefined,
    },
    outcomes: outcomes.map((o) => ({ outcomeId: o.outcome_id, weight: Number(o.weight), primary: o.is_primary === true })),
    source: source ? pick({ kind: source.source_kind, title: source.source_title, url: source.source_url, licenseCode: source.license_code, licenseUrl: source.license_url, attribution: source.attribution, provenanceRef: source.provenance_ref }, SOURCE_KEYS) : null,
  }
}

/** Cevrimdisi onizleme icin dis aktarim satirlari (Antigravity `[{code,row}]`,
 * `{rows:[...]}` veya duz dizi). Kazanim/kaynak bilgisi tasimaz. */
export function snapshotFromExport(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.rows || raw?.items || raw?.questions || [])
  const out = new Map()
  for (const item of arr) {
    const row = item?.row && typeof item.row === 'object' ? item.row : item
    const id = row?.id ?? row?.questionId ?? row?.question_id
    if (!id) continue
    out.set(String(id), { ref: item?.code ?? null, questionId: String(id), content: row.content ?? null, game: row.game ?? null, category: row.category ?? null, publishedRevisionId: row.published_revision_id ?? row.revision_id ?? null })
  }
  return out
}

// ── Payload kurma ────────────────────────────────────────────────────────────
export function buildSummary(proposal) {
  const head = `[${proposal.ref} ${proposal.finding.severity} ${proposal.finding.code}] `
  const body = String(proposal.finding.summary).replace(/\s+/g, ' ').trim()
  return (head + body).slice(0, 500)
}

export function buildRevisionPayload({ current, proposal }) {
  const errors = []
  if (!current) return { payload: null, errors: ['mevcut yayimli revizyon bulunamadi'] }
  if (!current.content || typeof current.content !== 'object') errors.push('mevcut icerik yok')
  const before = pick(current.content ?? {}, CONTENT_KEYS)
  const patch = proposal.patch ?? {}
  const content = { ...before }
  for (const k of Object.keys(patch)) {
    if (!CONTENT_KEYS.includes(k)) { errors.push(`patch.${k}: izinli icerik alani degil`); continue }
    content[k] = patch[k]
  }
  const answerChanged = Number.isInteger(patch.answer) && patch.answer !== before.answer
  if (proposal.changeKind === 'retire' && Object.keys(patch).length) errors.push('retire icin patch bos olmali')
  if (proposal.changeKind === 'edit' && answerChanged) errors.push('cevap anahtari degisiyor: changeKind correct_answer olmali')
  if (proposal.changeKind === 'correct_answer' && !answerChanged) errors.push('correct_answer icin patch.answer mevcut cevaptan farkli olmali')
  if (proposal.changeKind !== 'retire' && sameContent(content, before)) errors.push('patch mevcut icerigi degistirmiyor')

  const metadata = pick(current.metadata ?? {}, METADATA_KEYS)
  const outcomes = (proposal.outcomes ?? current.outcomes ?? []).map((o) => ({ outcomeId: o.outcomeId, weight: o.weight, primary: o.primary === true }))
  if (!outcomes.length) errors.push('kazanim eslemesi yok: proposal.outcomes ile en az bir outcomeId verin')
  const source = pick(current.source ?? DEFAULT_SOURCE, SOURCE_KEYS)
  const payload = { changeKind: proposal.changeKind, content, metadata, outcomes, source, summary: buildSummary(proposal) }
  errors.push(...validatePayloadShape(payload))
  return { payload, errors, before, after: content }
}

/** content_governance_validate_payload (migration 106) aynasi; RPC'ye gitmeden
 * once anlasilir hata verir. RPC yine de son sozu soyler. */
export function validatePayloadShape(p) {
  const e = []
  const keys = Object.keys(p ?? {}).sort()
  if (keys.join(',') !== 'changeKind,content,metadata,outcomes,source,summary') e.push(`payload anahtarlari tam olarak changeKind,content,metadata,outcomes,source,summary olmali (var: ${keys.join(',')})`)
  const c = p?.content ?? {}; const m = p?.metadata ?? {}; const s = p?.source ?? {}; const o = Array.isArray(p?.outcomes) ? p.outcomes : null
  for (const k of Object.keys(c)) if (!CONTENT_KEYS.includes(k)) e.push(`content.${k}: izinli degil`)
  for (const k of Object.keys(m)) if (!METADATA_KEYS.includes(k)) e.push(`metadata.${k}: izinli degil`)
  for (const k of Object.keys(s)) if (!SOURCE_KEYS.includes(k)) e.push(`source.${k}: izinli degil`)
  if (typeof c.question !== 'string' || !(c.question.trim().length >= 1 && c.question.trim().length <= 20000)) e.push('content.question: 1-20000 karakter')
  if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 5) e.push('content.options: 2-5 secenek')
  else if (c.options.some((x) => typeof x !== 'string' || x.length > 10000)) e.push('content.options: her secenek <=10000 karakterlik string')
  if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer > 4 || (Array.isArray(c.options) && c.answer >= c.options.length)) e.push('content.answer: 0-4 ve secenek sayisindan kucuk tamsayi')
  if (!GAMES.includes(m.game)) e.push(`metadata.game: ${GAMES.join('|')}`)
  if (typeof m.category !== 'string' || !(m.category.trim().length >= 1 && m.category.trim().length <= 120)) e.push('metadata.category: 1-120 karakter')
  if (!Number.isInteger(m.difficulty) || m.difficulty < 1 || m.difficulty > 5) e.push('metadata.difficulty: 1-5')
  if (!['create', 'edit', 'correct_answer', 'retire'].includes(p?.changeKind)) e.push('changeKind: create|edit|correct_answer|retire')
  if (typeof p?.summary !== 'string' || !(p.summary.trim().length >= 1 && p.summary.trim().length <= 500)) e.push('summary: 1-500 karakter')
  if (!o || o.length < 1 || o.length > 5) e.push('outcomes: 1-5 kazanim')
  else {
    for (const [i, x] of o.entries()) {
      const ks = Object.keys(x ?? {}).sort().join(',')
      if (ks !== 'outcomeId,primary,weight') e.push(`outcomes[${i}]: anahtarlar outcomeId,primary,weight olmali`)
      if (typeof x?.outcomeId !== 'string' || !UUID_RE.test(x.outcomeId)) e.push(`outcomes[${i}].outcomeId: uuid`)
      if (typeof x?.weight !== 'number' || !WEIGHT_RE.test(String(x.weight)) || x.weight <= 0) e.push(`outcomes[${i}].weight: (0,1] en cok 3 ondalik`)
      if (typeof x?.primary !== 'boolean') e.push(`outcomes[${i}].primary: boolean`)
    }
    if (o.filter((x) => x?.primary === true).length !== 1) e.push('outcomes: tam olarak bir primary')
    if (new Set(o.map((x) => x?.outcomeId)).size !== o.length) e.push('outcomes: outcomeId tekrar')
  }
  if (!SOURCE_KINDS.includes(s.kind)) e.push(`source.kind: ${SOURCE_KINDS.join('|')}`)
  if (typeof s.title !== 'string' || !(s.title.trim().length >= 1 && s.title.trim().length <= 200)) e.push('source.title: 1-200 karakter')
  if (typeof s.licenseCode !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(s.licenseCode)) e.push('source.licenseCode: [A-Za-z0-9._-]{1,80}')
  for (const k of ['url', 'licenseUrl']) if (s[k] !== undefined && (typeof s[k] !== 'string' || !/^https:\/\//.test(s[k]))) e.push(`source.${k}: https:// ile baslamali`)
  return e
}

// ── Deterministik tarama kapisi ──────────────────────────────────────────────
/** Onerilen icerik yeni bir ERROR bulgusu tasiyorsa oge bloklanir (diakritik
 * kaybi, gorsel gondermesi). WARN bulgular inceleme sayfasina not dusulur.
 * retire icin icerik degismedigi icin kapi atlanir. */
export function scanGate({ payload, current, changeKind }) {
  if (changeKind === 'retire' || !payload) return { blocking: [], notes: [] }
  const r = scanQuestion({ id: current?.questionId, game: payload.metadata.game, category: payload.metadata.category, content: payload.content })
  const blocking = r.findings.filter((f) => f.severity === 'error').map((f) => `${f.rule} @${f.field}: ${JSON.stringify(f.detail)}`)
  const notes = r.findings.filter((f) => f.severity !== 'error').map((f) => `${f.rule} @${f.field}: ${JSON.stringify(f.detail)}`)
  return { blocking, notes }
}

export function diffContent(before, after) {
  const out = []
  for (const k of CONTENT_KEYS) {
    const a = before?.[k]; const b = after?.[k]
    if (canon(a) === canon(b)) continue
    if (k === 'options' && Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length)
      for (let i = 0; i < n; i++) if (canon(a[i]) !== canon(b[i])) out.push({ field: `options[${i}]`, before: a[i], after: b[i] })
    } else out.push({ field: k, before: a, after: b })
  }
  return out
}

// ── Paket: ogeleri kur ───────────────────────────────────────────────────────
/** currentById: Map<questionId, current>; offline=true ise kazanim/kaynak eksikligi
 * blok degil "pending_db" notudur (DB'den tamamlanacak). */
export function buildBatch({ proposals, currentById, offline = false }) {
  return proposals.map((proposal) => {
    const current = currentById.get(proposal.questionId) ?? null
    const item = { ref: proposal.ref, questionId: proposal.questionId, changeKind: proposal.changeKind, finding: proposal.finding, evidence: proposal.evidence, rationale: proposal.rationale, status: 'ready', reasons: [], notes: [], diff: [], payload: null, baseRevisionId: current?.baseRevisionId ?? null, requestId: null }
    if (proposal.status === 'needs_patch') { item.status = 'needs_patch'; item.reasons.push('oneri henuz doldurulmadi (status: needs_patch)'); return item }
    if (!current) { item.status = 'blocked'; item.reasons.push('soru bulunamadi (DB veya --rows)'); return item }
    if (current.isActive === false && proposal.changeKind !== 'retire') item.notes.push('soru zaten pasif')
    const built = buildRevisionPayload({ current, proposal })
    item.payload = built.payload; item.diff = diffContent(built.before, built.after)
    let errors = built.errors
    if (offline) {
      // kazanim/kaynak DB'den gelecek; cevrimdisi bunlari not olarak ayir
      const pending = errors.filter((x) => x.startsWith('kazanim eslemesi yok') || x.startsWith('outcomes:'))
      if (pending.length) item.notes.push('pending_db: kazanim eslemesi ve kaynak kaydi DB\'den doldurulacak')
      errors = errors.filter((x) => !pending.includes(x))
      if (!current.baseRevisionId) item.notes.push('pending_db: taban revizyon DB\'den alinacak')
    } else if (!current.baseRevisionId) errors.push('yayimli revizyon yok (published_revision_id bos)')
    const gate = scanGate({ payload: built.payload, current, changeKind: proposal.changeKind })
    item.notes.push(...gate.notes.map((n) => `tarama: ${n}`))
    errors.push(...gate.blocking.map((b) => `tarama ERROR: ${b}`))
    if (errors.length) { item.status = 'blocked'; item.reasons.push(...errors) }
    else if (offline) item.status = 'preview' // kazanim/kaynak/taban DB'den gelmeden uygulanamaz
    else item.requestId = draftRequestId(proposal.questionId, built.payload)
    return item
  })
}

// ── Inceleme sayfasi ─────────────────────────────────────────────────────────
const fence = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
// Markdown tablo hucresi: once ters bolu, sonra boru ve satir sonu kacirilir
// (CodeQL: incomplete string escaping).
const cell = (v) => fence(v ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
export function renderReviewSheet({ batch, items, mode = 'dry-run' }) {
  const counts = items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {})
  const lines = []
  lines.push(`# Taslak revizyon paketi: ${batch?.title ?? ''}`, '')
  lines.push(`Mod: ${mode}. Ogeler: ${items.length} (ready ${counts.ready ?? 0}, preview ${counts.preview ?? 0}, blocked ${counts.blocked ?? 0}, needs_patch ${counts.needs_patch ?? 0}${counts.applied ? `, applied ${counts.applied}` : ''}).`, '')
  lines.push('Bu sayfadaki hicbir oneri karar degildir. Her taslak icin iki bagimsiz insan onayi', '(stage 1 ve stage 2, hazirlayandan ve birbirinden farkli kisiler) ve ardindan yayin', 'RPC\'si gerekir. Pasife alma yalniz `retire` taslaginin yayimiyla olur.', '')
  if (batch?.sourceRef) lines.push(`Kaynak: ${batch.sourceRef}`, '')
  for (const it of items) {
    lines.push(`## ${it.ref} · ${it.questionId}`, '')
    lines.push(`- Durum: **${it.status}**${it.revisionId ? ` · revizyon ${it.revisionId} (no ${it.revisionNo ?? '?'})` : ''}`)
    lines.push(`- Bulgu: ${it.finding.severity} ${it.finding.code}: ${it.finding.summary}`)
    lines.push(`- Degisiklik turu: ${it.changeKind}`)
    if (it.baseRevisionId) lines.push(`- Taban revizyon: ${it.baseRevisionId}`)
    if (it.evidence?.length) lines.push(`- Kanit: ${it.evidence.join('; ')}`)
    lines.push(`- Gerekce: ${it.rationale}`)
    if (it.reasons.length) { lines.push('- Engeller:'); for (const r of it.reasons) lines.push(`  - ${r}`) }
    if (it.notes.length) { lines.push('- Notlar:'); for (const n of it.notes) lines.push(`  - ${n}`) }
    if (it.diff.length) {
      lines.push('', '| Alan | Once | Sonra |', '|---|---|---|')
      for (const d of it.diff) lines.push(`| ${d.field} | ${cell(d.before)} | ${cell(d.after)} |`)
    } else if (it.changeKind === 'retire') lines.push('', 'Icerik degismez; yayimlanirsa soru pasife alinir.')
    lines.push('')
  }
  return lines.join('\n')
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function loadEnv(path) {
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return env
}
async function all(db, table, columns, apply) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(db.from(table).select(columns)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.code || ''} ${error.message || 'sorgu basarisiz'}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}
export async function loadCurrentFromDb(db, questionIds) {
  const ids = [...new Set(questionIds)]
  const questions = await all(db, 'questions', 'id,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,is_active,content,published_revision_id', (q) => q.in('id', ids))
  const revIds = questions.map((q) => q.published_revision_id).filter(Boolean)
  const revisions = revIds.length ? await all(db, 'question_content_revisions', 'id,question_id,content,status', (q) => q.in('id', revIds)) : []
  const outcomes = await all(db, 'question_outcomes', 'question_id,outcome_id,weight,is_primary', (q) => q.in('question_id', ids))
  const sources = revIds.length ? await all(db, 'question_revision_sources', 'revision_id,source_kind,source_title,source_url,license_code,license_url,attribution,provenance_ref', (q) => q.in('revision_id', revIds)) : []
  const byId = new Map()
  for (const q of questions) {
    const revision = revisions.find((r) => r.id === q.published_revision_id) ?? null
    byId.set(q.id, currentFromRows({ question: q, revision, outcomes: outcomes.filter((o) => o.question_id === q.id), source: sources.find((s) => s.revision_id === q.published_revision_id) ?? null }))
  }
  return byId
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }
  const proposalsPath = opt('--proposals'); const rowsPath = opt('--rows'); const apply = argv.includes('--apply'); const userId = opt('--user-id')
  if (!proposalsPath) { console.error('--proposals <dosya> zorunlu'); process.exit(2) }
  const { batch, proposals, errors } = parseProposals(JSON.parse(readFileSync(proposalsPath, 'utf8')))
  if (errors.length) { console.error('Oneri dosyasi gecersiz:\n  ' + errors.join('\n  ')); process.exit(2) }
  if (apply && (!userId || !UUID_RE.test(userId))) { console.error('--apply icin --user-id <hazirlayan uuid> zorunlu'); process.exit(2) }
  const env = { ...loadEnv(resolve(opt('--env') ?? '.env.local')), ...process.env }
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_SERVICE_ROLE_KEY
  const slug = String(batch.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'batch'
  const outDir = resolve(opt('--out-dir') ?? join('secure', 'revision-drafts', slug))
  mkdirSync(outDir, { recursive: true })

  let currentById; let offline = false; let db = null; let snapshot = null
  if (rowsPath) snapshot = snapshotFromExport(JSON.parse(readFileSync(rowsPath, 'utf8')))
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js')
    db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    currentById = await loadCurrentFromDb(db, proposals.map((p) => p.questionId))
  } else if (snapshot) {
    offline = true
    currentById = new Map()
    for (const p of proposals) {
      const s = snapshot.get(p.questionId)
      if (s) currentById.set(p.questionId, { questionId: p.questionId, baseRevisionId: s.publishedRevisionId, isActive: true, content: s.content, metadata: { game: s.game, category: s.category, difficulty: 3 }, outcomes: [], source: null })
    }
    if (apply) { console.error('--apply icin DB baglantisi gerekir (.env.local)'); process.exit(2) }
  } else { console.error('DB (.env.local) ya da --rows <dis aktarim> gerekir'); process.exit(2) }

  const items = buildBatch({ proposals, currentById, offline })
  if (apply && snapshot) {
    // Dis aktarim ile canli icerik ayrismissa (baska bir revizyon yayimlanmis) taslagi acma.
    for (const it of items) {
      const s = snapshot.get(it.questionId); const c = currentById.get(it.questionId)
      if (it.status === 'ready' && s?.content && c?.content && !sameContent(s.content, c.content)) { it.status = 'blocked'; it.reasons.push('canli icerik --rows dis aktarimindan farkli: once dis aktarimi yenileyin') }
    }
  }
  if (apply) {
    for (const it of items) {
      if (it.status !== 'ready') continue
      const { data, error } = await db.rpc('create_question_content_revision', { p_user_id: userId, p_question_id: it.questionId, p_base_revision_id: it.baseRevisionId, p_payload: it.payload, p_request_id: it.requestId })
      if (error) { it.status = 'blocked'; it.reasons.push(`RPC: ${error.code ?? ''} ${error.message ?? ''}`.trim()); continue }
      it.status = 'applied'; it.revisionId = data?.revisionId ?? null; it.revisionNo = data?.revisionNo ?? null; it.replayed = data?.replayed === true
    }
  }
  const mode = apply ? 'apply' : offline ? 'offline-preview' : 'dry-run'
  const report = { schemaVersion: 'question-revision-drafts-report@1', mode, batch, generatedAt: new Date().toISOString(), items }
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(outDir, 'payloads.json'), JSON.stringify(items.filter((i) => i.payload).map((i) => ({ ref: i.ref, questionId: i.questionId, baseRevisionId: i.baseRevisionId, requestId: i.requestId, status: i.status, payload: i.payload })), null, 2) + '\n')
  writeFileSync(join(outDir, 'review-sheet.md'), renderReviewSheet({ batch, items, mode }))
  const counts = items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {})
  console.log(`Mod: ${mode}  Ogeler: ${items.length}  ${JSON.stringify(counts)}`)
  for (const it of items) if (it.status !== 'ready' && it.status !== 'applied' && it.status !== 'preview') console.log(`  ${it.status.padEnd(11)} ${it.ref}: ${it.reasons.join(' | ')}`)
  for (const it of items) if (it.status === 'applied') console.log(`  applied     ${it.ref}: revizyon ${it.revisionId} no ${it.revisionNo}${it.replayed ? ' (replay)' : ''}`)
  console.log(`Yazildi: ${outDir}/{report.json,payloads.json,review-sheet.md}`)
  process.exit(apply && items.some((i) => i.status === 'blocked') ? 1 : 0)
}
