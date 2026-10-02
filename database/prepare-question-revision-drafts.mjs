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
 * mevcut yayimli revizyonu, kazanim eslemesini ve kaynak kaydini
 * `get_question_content_revision` RPC'si ile okur (106 REVOKE ALL; 136 yalniz
 * question_content_revisions icin sutun bazli SELECT verir, question_revision_sources
 * service_role'a kapali kalir; tam ve yetkili okuma yolu bu RPC'dir), RPC'nin
 * `content_governance_validate_payload` sozlesmesine (106 + 110 `coach`) uyan
 * payload'i kurar, deterministik taramadan gecirir ve:
 *   - varsayilan (kuru calisma): payload'lari, inceleme sayfasini ve raporu
 *     out-dir'e yazar; DB'ye DOKUNMAZ.
 *   - --apply: yalniz "ready" ogeler icin taslak acar.
 *     Inceleme, yayin, karantina ve is_active bu betigin yetkisinde DEGILDIR.
 * Cevrimici her iki modda --user-id (content.prepare yetkili hazirlayan) gerekir;
 * RPC okumasi da bu kimlikle yapilir.
 *
 * YETKI SINIRI: Hicbir LLM ciktisi (pilot cozucusu, oneri metni) tek basina
 * yayin, ret veya karantina otoritesi degildir. Bu betik yalniz taslak acar;
 * iki insan onayi RPC tarafinda zorunludur (hazirlayan kendi taslagini
 * inceleyemez, stage 1 ve stage 2 ayni kisi olamaz).
 * Tek istisna (migration 215, owner karari): degisikligi YALNIZ listelenmis
 * govdelerin Turkce harf geri getirmesi olan `edit` ogeleri (hat
 * turkish_restoration) --apply ile `publish_question_turkish_restoration`
 * uzerinden iki onaysiz yayimlanir. Kanit DB'dedir (harf harf, govde listesi,
 * kapsam disi konular, tabanin APPROVED dogrulama karari); buradaki JS aynasi
 * yalniz hat secimi ve inceleme sayfasi icindir.
 *
 * Kullanim:
 *   npm run revision:drafts -- --proposals secure/revision-proposals.json --user-id <uuid>
 *   npm run revision:drafts -- --proposals ... --rows secure/16-flawed-questions.json   # DB yoksa cevrimdisi onizleme
 *   npm run revision:drafts -- --proposals ... --user-id <uuid> --apply                 # taslaklari ac; 215 hattini yayimla
 * Secenekler: --env .env.local  --out-dir secure/revision-drafts/<batch>
 *
 * Oneri dosyasi: database/__fixtures__/question-revision-proposals/ altindaki
 * example.json (calisan ornek) ve pilot1-4.skeleton.json (16 soru iskeleti).
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanQuestion, turkishRestorationExclusion, turkishRestorationWords } from './scan-question-text-defects.mjs'

export const PROPOSALS_SCHEMA = 'question-revision-proposals@1'
// Payload'da tasinabilen icerik alanlari (106 + 110 `coach`). `coach` (kurate
// edilmis ipucu/yanilgi nesnesi) yayimli revizyondan AYNEN tasinir; patch ile
// degistirilemez, aksi halde yayin kurate icerigi sessizce silerdi (Codex #526).
// coach.misconceptions secenek BASINA aciklamadir: cevap indeksi degisirse null
// konumu kayar, secenek metni anlamca degisirse aciklama eski secenegi anlatir.
// Ikisi de coach'lu soruda bloklanir; yalniz yazim duzeltmesi (diakritik, buyuk/
// kucuk harf, bosluk, tirnak bicimi) secenekte gecer (Codex #528); isaret ve
// noktalama korunur (Codex #530).
export const CONTENT_KEYS = ['question', 'options', 'answer', 'solution', 'explanation', 'hint', 'sentence', 'passage', 'context', 'type', 'coach']
export const PATCH_KEYS = CONTENT_KEYS.filter((k) => k !== 'coach')
const COACH_KEYS = ['hint1', 'hint2', 'miniExample', 'misconceptions']
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
/** UUID'ler her yerde kucuk harfli anahtar olarak kullanilir: PostgreSQL kucuk
 * harf dondurur, oneri dosyasi buyuk harf tasiyabilir (Codex #526). */
export const uid = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v ?? null)
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]))
  return value
}
const canon = (v) => JSON.stringify(canonicalize(v))
export const sameContent = (a, b) => canon(a) === canon(b)
// Yazim esdegerligi: NFC, Turkce kucuk harf, yalniz Turkce harf diakritigini
// kaldirma (Türkiye ~ Turkiye, ışık ~ isik, hâlâ ~ hala), tirnak/kesme isareti
// bicimlerini tekle indirme (’ ~ '), bosluk dizilerini tek bosluga indirme.
// BASKA hicbir karakter atilmaz: isaret, ondalik ayraci, kesir, yuzde ve
// operatorler anlam tasir (-10 vs 10, 1,5 vs 15, 1/2 vs 12; Codex #530).
// Birlesik isaretler de korunur: ≠ vs =, ∉ vs ∈, x̄ vs x, 0,3̅ vs 0,3 (Codex
// #542). Sira ve sayi korunur; anlam degisikligi (kitap -> defter) esdeger DEGILDIR.
const TR_LETTER_FOLD = { 'ç': 'c', 'ş': 's', 'ğ': 'g', 'ö': 'o', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u', 'ı': 'i' }
const foldSpelling = (x) => String(x ?? '').normalize('NFC').toLocaleLowerCase('tr').replace(/[çşğöüâîûı]/g, (c) => TR_LETTER_FOLD[c])
  .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/\s+/gu, ' ').trim()
export const sameSpelling = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => foldSpelling(x) === foldSpelling(b[i]))

/** Ayni soru + ayni payload her zaman ayni istek kimligini uretir: RPC'nin
 * content_governance_requests dedup'u ile yeniden calistirma taslagi cogaltmaz.
 * Kazanimlar payload kurulurken outcomeId'ye gore siralanir; DB satir sirasi
 * kimligi degistirmez. */
export function draftRequestId(questionId, payload) {
  const h = createHash('sha256').update(`question-revision-draft:${uid(questionId)}:${canon(payload)}`).digest('hex')
  const v = '4' + h.slice(13, 16)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k]
  return out
}
const sortOutcomes = (arr) => [...arr].sort((a, b) => (a.outcomeId < b.outcomeId ? -1 : a.outcomeId > b.outcomeId ? 1 : 0))

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
    for (const k of Object.keys(p.patch)) if (!PATCH_KEYS.includes(k)) errors.push(`${at}.patch.${k}: izinli icerik alani degil`)
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
    const id = uid(p?.questionId)
    if (qids.has(id)) errors.push(`proposals[${i}].questionId tekrar: ${p.questionId} (ilk: ${qids.get(id)})`); qids.set(id, p?.ref)
  })
  return { batch, proposals, errors }
}

/** DB'ye gidecek soru kimlikleri: iskelet (needs_patch) ogeleri ve uuid olmayan
 * degerler disarida kalir; aksi halde uuid tipli sorgu "TODO" ile patlar (Codex #526). */
export function dbLookupIds(proposals) {
  return [...new Set(proposals.filter((p) => p?.status !== 'needs_patch').map((p) => uid(p?.questionId)).filter((id) => typeof id === 'string' && UUID_RE.test(id)))]
}

// ── Mevcut durum ─────────────────────────────────────────────────────────────
/** question: questions satiri (PostgREST; service_role SELECT yetkisi var).
 * detail: get_question_content_revision(p_user_id, published_revision_id) ciktisi;
 * question_revision_sources 106 ile service_role'a kapalidir (136 yalniz
 * revizyon tablosuna sutun bazli SELECT verir); kaynak + kazanim + icerik
 * birlikte yalniz bu RPC'den gelir.
 * fallbackOutcomes: question_outcomes satirlari (legacy revizyonlarda revizyon
 * eslemesi bos olabilir). */
export function currentFromRevisionDetail({ question, detail, fallbackOutcomes = [] }) {
  if (!question) return null
  const r = detail?.revision ?? null
  const raw = Array.isArray(r?.outcomes) && r.outcomes.length
    ? r.outcomes
    : fallbackOutcomes.map((o) => ({ outcomeId: o.outcome_id ?? o.outcomeId, weight: o.weight, primary: (o.is_primary ?? o.primary) === true }))
  return {
    questionId: uid(question.id),
    baseRevisionId: uid(question.published_revision_id ?? r?.revisionId ?? null),
    isActive: question.is_active !== false,
    content: r?.content ?? question.content ?? null,
    metadata: {
      game: question.game, category: question.category, subcategory: question.subcategory ?? undefined, topic: question.topic ?? undefined,
      difficulty: question.difficulty, levelTag: question.level_tag ?? undefined, examRef: question.exam_ref ?? undefined, isBoss: question.is_boss ?? undefined,
    },
    outcomes: sortOutcomes(raw.map((o) => ({ outcomeId: uid(o.outcomeId), weight: Number(o.weight), primary: o.primary === true }))),
    source: r?.source && typeof r.source === 'object' && Object.keys(r.source).length ? pick(r.source, SOURCE_KEYS) : null,
    baseApproved: Array.isArray(r?.approvals) && r.approvals.some((a) => a?.decision === 'approved'),
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
    out.set(uid(String(id)), { ref: item?.code ?? null, questionId: uid(String(id)), content: row.content ?? null, game: row.game ?? null, category: row.category ?? null, publishedRevisionId: uid(row.published_revision_id ?? row.revision_id ?? null) })
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
  const errors = []; const notes = []
  if (!current) return { payload: null, errors: ['mevcut yayimli revizyon bulunamadi'], notes }
  if (!current.content || typeof current.content !== 'object') errors.push('mevcut icerik yok')
  const foreign = Object.keys(current.content ?? {}).filter((k) => !CONTENT_KEYS.includes(k))
  if (foreign.length) errors.push(`mevcut icerikte sozlesme disi alan: ${foreign.join(', ')} (payload'da tasinamaz, yayinda kaybolurdu; once insan incelesin)`)
  const before = pick(current.content ?? {}, CONTENT_KEYS)
  const patch = proposal.patch ?? {}
  const content = { ...before }
  for (const k of Object.keys(patch)) {
    if (!PATCH_KEYS.includes(k)) { errors.push(`patch.${k}: izinli icerik alani degil`); continue }
    content[k] = patch[k]
  }
  const answerChanged = Number.isInteger(patch.answer) && patch.answer !== before.answer
  if (proposal.changeKind === 'retire' && Object.keys(patch).length) errors.push('retire icin patch bos olmali')
  if (proposal.changeKind === 'edit' && answerChanged) errors.push('cevap anahtari degisiyor: changeKind correct_answer olmali')
  if (proposal.changeKind === 'correct_answer' && !answerChanged) errors.push('correct_answer icin patch.answer mevcut cevaptan farkli olmali')
  if (proposal.changeKind !== 'retire' && sameContent(content, before)) errors.push('patch mevcut icerigi degistirmiyor')
  if (answerChanged && before.coach) errors.push('cevap anahtari degisince coach.misconceptions (dogru secenek null) yeniden kurate edilmeli; patch coach degistiremez, once coach revizyonu insan tarafindan')
  // Secenek metni degisince secenek basina yanilgi aciklamasi eski secenegi
  // anlatir; yalniz yazim duzeltmesi gecer (Codex #528).
  const optionsChanged = Array.isArray(patch.options) && !sameContent(patch.options, before.options)
  if (optionsChanged && before.coach && !sameSpelling(patch.options, before.options)) errors.push('secenekler degisince coach.misconceptions (secenek basina aciklama) eski secenekleri anlatir; yalniz yazim duzeltmesi (Turkce harf diakritigi, buyuk/kucuk harf, bosluk, tirnak bicimi) gecer; isaret/ondalik/noktalama/birlesik isaret dahil anlam veya sira degisikliginde once coach revizyonu insan tarafindan')
  if (before.coach) notes.push('coach nesnesi yayimli revizyondan aynen tasindi')

  const metadata = pick(current.metadata ?? {}, METADATA_KEYS)
  let outcomes = (current.outcomes ?? []).map((o) => ({ outcomeId: uid(o.outcomeId), weight: o.weight, primary: o.primary === true }))
  if (Array.isArray(proposal.outcomes)) {
    // Kazanim degisikligi icerik paketinin kapsami disinda: yalniz eslemesi
    // olmayan (legacy) sorularda oneri esleme verebilir (Codex #526).
    if (outcomes.length) errors.push('soru zaten kazanim eslemesine sahip; proposal.outcomes yalniz eslemesi olmayan sorular icin (kazanim degisikligi bu paketin kapsami disinda)')
    else { outcomes = proposal.outcomes.map((o) => ({ outcomeId: uid(o.outcomeId), weight: o.weight, primary: o.primary === true })); notes.push('kazanim eslemesi oneriden alindi (soruda esleme yoktu)') }
  }
  if (!outcomes.length) errors.push('kazanim eslemesi yok: proposal.outcomes ile en az bir outcomeId verin')
  outcomes = sortOutcomes(outcomes)
  const source = pick(current.source ?? DEFAULT_SOURCE, SOURCE_KEYS)
  const payload = { changeKind: proposal.changeKind, content, metadata, outcomes, source, summary: buildSummary(proposal) }
  errors.push(...validatePayloadShape(payload))
  return { payload, errors, notes, before, after: content }
}

/** content_governance_validate_payload (106 + 110 coach) aynasi; RPC'ye
 * gitmeden once anlasilir hata verir. RPC yine de son sozu soyler. */
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
  if (c.coach !== undefined) {
    const co = c.coach
    if (!co || typeof co !== 'object' || Array.isArray(co) || Object.keys(co).sort().join(',') !== [...COACH_KEYS].sort().join(',')) e.push('content.coach: anahtarlar hint1,hint2,miniExample,misconceptions olmali')
    else {
      for (const k of ['hint1', 'hint2', 'miniExample']) if (typeof co[k] !== 'string' || co[k].trim().length < 1 || co[k].trim().length > 700) e.push(`content.coach.${k}: 1-700 karakter`)
      const n = Array.isArray(c.options) ? c.options.length : -1
      if (!Array.isArray(co.misconceptions) || co.misconceptions.length !== n) e.push('content.coach.misconceptions: secenek sayisi kadar oge')
      else co.misconceptions.forEach((x, i) => {
        if (i === c.answer) { if (x !== null) e.push(`content.coach.misconceptions[${i}]: dogru secenek icin null olmali`) }
        else if (typeof x !== 'string' || x.trim().length < 1 || x.trim().length > 1000) e.push(`content.coach.misconceptions[${i}]: 1-1000 karakter`)
      })
    }
  }
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
/** currentById: Map<questionId (kucuk harf), current>; offline=true ise
 * kazanim/kaynak eksigi blok degil "pending_db" notudur ve oge "preview" kalir. */
export function buildBatch({ proposals, currentById, offline = false }) {
  return proposals.map((proposal) => {
    const qid = uid(proposal.questionId)
    const current = currentById.get(qid) ?? null
    const item = { ref: proposal.ref, questionId: qid, changeKind: proposal.changeKind, finding: proposal.finding, evidence: proposal.evidence, rationale: proposal.rationale, status: 'ready', lane: 'draft', words: null, reasons: [], notes: [], diff: [], payload: null, baseRevisionId: current?.baseRevisionId ?? null, requestId: null }
    if (proposal.status === 'needs_patch') { item.status = 'needs_patch'; item.questionId = proposal.questionId ?? null; item.reasons.push('oneri henuz doldurulmadi (status: needs_patch)'); return item }
    if (!current) { item.status = 'blocked'; item.reasons.push('soru bulunamadi (DB veya --rows)'); return item }
    if (current.isActive === false && proposal.changeKind !== 'retire') item.notes.push('soru zaten pasif')
    const built = buildRevisionPayload({ current, proposal })
    item.payload = built.payload; item.diff = diffContent(built.before, built.after); item.notes.push(...built.notes)
    let errors = built.errors
    // Turkce harf duzeltmesi hatti (215): kazanim ve kaynak taban revizyondan
    // tasindigi icin esleme eksigi bu hatti engellemez.
    const mappingError = (x) => x.startsWith('kazanim eslemesi yok') || x.startsWith('outcomes:')
    const words = proposal.changeKind === 'edit' && built.payload && errors.every(mappingError)
      ? turkishRestorationWords(current.content, built.payload.content)
      : null
    if (words?.length) {
      const exclusion = turkishRestorationExclusion({ game: current.metadata?.game, category: current.metadata?.category, content: current.content, examRef: current.metadata?.examRef, baseApproved: current.baseApproved === true })
        ?? (current.isActive === false ? 'soru pasif' : null)
      if (exclusion) item.notes.push(`yalniz Turkce harf duzeltmesi, ama iki onayli yol: ${exclusion}`)
      else {
        item.lane = 'turkish_restoration'
        item.words = words
        errors = errors.filter((x) => !mappingError(x))
        item.notes.push('hat: iki onaysiz Turkce harf duzeltmesi (215); kazanim ve kaynak taban revizyondan tasinir, tabanin APPROVED dogrulama karari devralinir')
      }
    }
    if (offline) {
      // kazanim/kaynak DB'den gelecek; cevrimdisi bunlari not olarak ayir
      const pending = errors.filter((x) => x.startsWith('kazanim eslemesi yok') || x.startsWith('outcomes:'))
      if (pending.length) item.notes.push('pending_db: kazanim eslemesi ve kaynak kaydi DB\'den doldurulacak')
      errors = errors.filter((x) => !pending.includes(x))
      if (!current.baseRevisionId) item.notes.push('pending_db: taban revizyon DB\'den alinacak')
    } else if (!current.baseRevisionId) errors.push('yayimli revizyon yok (published_revision_id bos)')
    const gate = scanGate({ payload: built.payload, current, changeKind: proposal.changeKind })
    item.notes.push(...gate.notes.map((n) => `tarama: ${n}`))
    // Harf geri getirmesi yeni kusur ekleyemez; kalan ERROR'lar tabanda da vardir
    // ve ayri bir oneriyle (iki onayli yol) ele alinir.
    if (item.lane === 'turkish_restoration') item.notes.push(...gate.blocking.map((b) => `tarama ERROR (tabanda da var, ayri oneriyle ele alin): ${b}`))
    else errors.push(...gate.blocking.map((b) => `tarama ERROR: ${b}`))
    if (errors.length) { item.status = 'blocked'; item.reasons.push(...errors) }
    else if (offline) item.status = 'preview' // kazanim/kaynak/taban DB'den gelmeden uygulanamaz
    else item.requestId = draftRequestId(qid, built.payload)
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
  const lanes = items.filter((i) => i.lane === 'turkish_restoration').length
  lines.push(`Mod: ${mode}. Ogeler: ${items.length} (ready ${counts.ready ?? 0}, preview ${counts.preview ?? 0}, blocked ${counts.blocked ?? 0}, needs_patch ${counts.needs_patch ?? 0}${counts.applied ? `, applied ${counts.applied}` : ''}${counts.published ? `, published ${counts.published}` : ''}).`, '')
  lines.push('Bu sayfadaki hicbir oneri karar degildir. Her taslak icin iki bagimsiz insan onayi', '(stage 1 ve stage 2, hazirlayandan ve birbirinden farkli kisiler) ve ardindan yayin', 'RPC\'si gerekir. Pasife alma yalniz `retire` taslaginin yayimiyla olur.', '')
  if (lanes) lines.push(`Istisna: "Turkce harf duzeltmesi (215)" hattindaki ${lanes} oge --apply ile iki onaysiz yayimlanir.`, 'DB degisikligin yalniz listelenmis govdelerin ASCII->Turkce harf geri getirmesi oldugunu harf harf', 'kanitlar; kanitlanamazsa oge reddedilir ve iki onayli yola doner.', '')
  if (batch?.sourceRef) lines.push(`Kaynak: ${batch.sourceRef}`, '')
  for (const it of items) {
    lines.push(`## ${it.ref} · ${it.questionId}`, '')
    lines.push(`- Durum: **${it.status}**${it.revisionId ? ` · revizyon ${it.revisionId} (no ${it.revisionNo ?? '?'})` : ''}`)
    lines.push(`- Bulgu: ${it.finding.severity} ${it.finding.code}: ${it.finding.summary}`)
    lines.push(`- Degisiklik turu: ${it.changeKind}`)
    if (it.lane === 'turkish_restoration') lines.push(`- Hat: **Turkce harf duzeltmesi (215), iki onaysiz yayin** · ${(it.words ?? []).join(', ')}`)
    if (it.baseRevisionId) lines.push(`- Taban revizyon: ${it.baseRevisionId}`)
    if (it.payload?.outcomes?.length) lines.push(`- Kazanim eslemesi (degismez): ${it.payload.outcomes.map((o) => `${o.outcomeId} (w ${o.weight}${o.primary ? ', primary' : ''})`).join('; ')}`)
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
/** questions ve question_outcomes PostgREST ile (service_role SELECT), yayimli
 * revizyon + kaynak get_question_content_revision RPC'si ile (hazirlayan kimligi
 * content.prepare veya inceleme yetkisi tasimali). */
export async function loadCurrentFromDb(db, questionIds, userId) {
  const ids = [...new Set(questionIds.map(uid).filter((id) => typeof id === 'string' && UUID_RE.test(id)))]
  const byId = new Map()
  if (!ids.length) return byId
  const questions = await all(db, 'questions', 'id,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,is_active,content,published_revision_id', (q) => q.in('id', ids))
  const outcomes = await all(db, 'question_outcomes', 'question_id,outcome_id,weight,is_primary', (q) => q.in('question_id', ids))
  for (const q of questions) {
    let detail = null
    if (q.published_revision_id) {
      const { data, error } = await db.rpc('get_question_content_revision', { p_user_id: userId, p_revision_id: q.published_revision_id })
      if (error) throw new Error(`get_question_content_revision(${q.published_revision_id}): ${error.code ?? ''} ${error.message ?? ''}`.trim())
      detail = data
    }
    byId.set(uid(q.id), currentFromRevisionDetail({ question: q, detail, fallbackOutcomes: outcomes.filter((o) => uid(o.question_id) === uid(q.id)) }))
  }
  return byId
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }
  const proposalsPath = opt('--proposals'); const rowsPath = opt('--rows'); const apply = argv.includes('--apply'); const userId = uid(opt('--user-id'))
  if (!proposalsPath) { console.error('--proposals <dosya> zorunlu'); process.exit(2) }
  const { batch, proposals, errors } = parseProposals(JSON.parse(readFileSync(proposalsPath, 'utf8')))
  if (errors.length) { console.error('Oneri dosyasi gecersiz:\n  ' + errors.join('\n  ')); process.exit(2) }
  const env = { ...loadEnv(resolve(opt('--env') ?? '.env.local')), ...process.env }
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_SERVICE_ROLE_KEY
  const slug = String(batch.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'batch'
  const outDir = resolve(opt('--out-dir') ?? join('secure', 'revision-drafts', slug))
  mkdirSync(outDir, { recursive: true })

  let currentById; let offline = false; let db = null; let snapshot = null
  if (rowsPath) snapshot = snapshotFromExport(JSON.parse(readFileSync(rowsPath, 'utf8')))
  if (url && key) {
    if (!userId || !UUID_RE.test(userId)) { console.error('Cevrimici modda --user-id <hazirlayan uuid> zorunlu (get_question_content_revision bu kimlikle okur)'); process.exit(2) }
    const { createClient } = await import('@supabase/supabase-js')
    db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    currentById = await loadCurrentFromDb(db, dbLookupIds(proposals), userId)
  } else if (snapshot) {
    offline = true
    currentById = new Map()
    for (const p of proposals) {
      if (p.status === 'needs_patch') continue
      const s = snapshot.get(uid(p.questionId))
      if (s) currentById.set(uid(p.questionId), { questionId: uid(p.questionId), baseRevisionId: s.publishedRevisionId, isActive: true, content: s.content, metadata: { game: s.game, category: s.category, difficulty: 3 }, outcomes: [], source: null })
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
      if (it.lane === 'turkish_restoration') {
        const { data, error } = await db.rpc('publish_question_turkish_restoration', { p_user_id: userId, p_question_id: it.questionId, p_base_revision_id: it.baseRevisionId, p_content: it.payload.content, p_request_id: it.requestId })
        if (error) { it.status = 'blocked'; it.reasons.push(`RPC (215): ${error.code ?? ''} ${error.message ?? ''}`.trim()); continue }
        it.status = 'published'; it.revisionId = data?.revisionId ?? null; it.replayed = data?.replayed === true
        continue
      }
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
  for (const it of items) if (!['ready', 'applied', 'published', 'preview'].includes(it.status)) console.log(`  ${it.status.padEnd(11)} ${it.ref}: ${it.reasons.join(' | ')}`)
  for (const it of items) if (it.status === 'applied') console.log(`  applied     ${it.ref}: revizyon ${it.revisionId} no ${it.revisionNo}${it.replayed ? ' (replay)' : ''}`)
  for (const it of items) if (it.status === 'published') console.log(`  published   ${it.ref}: Turkce harf duzeltmesi (215) revizyon ${it.revisionId}${it.replayed ? ' (replay)' : ''}`)
  for (const it of items) if (it.lane === 'turkish_restoration' && it.status === 'ready') console.log(`  215 hatti   ${it.ref}: --apply ile iki onaysiz yayimlanir (${(it.words ?? []).join(', ')})`)
  console.log(`Yazildi: ${outDir}/{report.json,payloads.json,review-sheet.md}`)
  process.exit(apply && items.some((i) => i.status === 'blocked') ? 1 : 0)
}
