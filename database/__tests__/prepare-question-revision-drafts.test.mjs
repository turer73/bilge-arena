/**
 * Taslak revizyon paketi — mantik testi (DB'siz).
 *
 * RPC sozlesmesi (content_governance_validate_payload, migration 106) aynasi,
 * degisiklik turu kurallari, tarama kapisi, deterministik istek kimligi ve
 * inceleme sayfasi burada kilitlenir. Gercek RPC kabulu
 * question-content-governance-postgres.integration.test.mjs icinde.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROPOSALS_SCHEMA,
  applyRevisionItems,
  buildBatch,
  buildRevisionPayload,
  currentFromRevisionDetail,
  contentFingerprint,
  dbLookupIds,
  diffContent,
  draftRequestId,
  parseProposals,
  renderReviewSheet,
  revisionApplyPreflight,
  scanGate,
  snapshotFromExport,
  validatePayloadShape,
  validateProposal,
} from '../prepare-question-revision-drafts.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'question-revision-proposals')
const readFixture = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'))
const OUTCOME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const Q = '11111111-1111-4111-8111-111111111111'
const current = () => ({
  questionId: Q, baseRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isActive: true,
  content: { question: 'Asagidakilerden hangisi dogru yazilmistir?', options: ['kitab', 'kitap', 'kıtap', 'kitapp'], answer: 1, solution: 'Doğru yazım kitap.' },
  metadata: { game: 'turkce', category: 'Yazım', subcategory: undefined, topic: 'yazım kuralları', difficulty: 2, levelTag: undefined, examRef: 'TYT', isBoss: false },
  outcomes: [{ outcomeId: OUTCOME, weight: 1, primary: true }],
  source: { kind: 'original', title: 'Ogretmen notu', licenseCode: 'INTERNAL' },
})
const proposal = (over = {}) => ({
  ref: 'T-1', questionId: Q, finding: { code: 'ASCII_DIACRITIC_LOSS', severity: 'P1', summary: 'Kokte karakter kaybi.' }, evidence: ['scan'],
  changeKind: 'edit', patch: { question: 'Aşağıdakilerden hangisi doğru yazılmıştır?' }, rationale: 'Yalniz yazim.', ...over,
})

describe('tam-paket uygulama on kontrolu', () => {
  const ready = (n = 1, over = {}) => ({ ref: `R-${n}`, questionId: `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`,
    baseRevisionId: current().baseRevisionId, requestId: `request-${n}`, status: 'ready', lane: 'draft',
    payload: { content: current().content }, reasons: [], ...over })
  const fakeDb = (response = { data: { revisionId: 'new-revision', revisionNo: 2, mappingRequired: true }, error: null }) => {
    const calls = []
    return { calls, rpc: async (...args) => { calls.push(args); return response } }
  }
  it('tek engelli oge tum pakette sifir mutation RPC ile durur; hazir ogeler yazilmis sayilmaz', async () => {
    const items = [ready(), ready(2, { status: 'blocked' })]
    const db = fakeDb()
    const preflight = await applyRevisionItems({ db, userId: Q, items, requireAllReady: true, draftOnly: true })
    expect(preflight.passed).toBe(false)
    expect(preflight.blockingRefs).toEqual(['R-2'])
    expect(db.calls).toHaveLength(0)
    expect(items.map(i => i.status)).toEqual(['ready', 'blocked'])
  })
  it('needs_patch ve preview hazir veya uygulanmis sayilmaz', () => {
    for (const status of ['needs_patch', 'preview']) {
      expect(revisionApplyPreflight([ready(1, { status })], { requireAllReady: true }).passed).toBe(false)
    }
  })
  it('bos veya ayni soruya iki oneri iceren paket hic yazmadan durur', async () => {
    for (const items of [[], [ready(), ready(2, { questionId: ready().questionId })]]) {
      const db = fakeDb()
      expect((await applyRevisionItems({ db, userId: Q, items, requireAllReady: true })).passed).toBe(false)
      expect(db.calls).toHaveLength(0)
    }
  })
  it('esleme bekleyen taslak hattinda 215 yayin RPCsine dusmez', async () => {
    const db = fakeDb()
    const items = [ready(), ready(2, { lane: 'turkish_restoration' })]
    expect((await applyRevisionItems({ db, userId: Q, items, draftOnly: true })).passed).toBe(false)
    expect(db.calls).toHaveLength(0)
  })
  it('tam hazir pakette yalniz mevcut create revision RPCsini ayni pin ve requestId ile cagirir', async () => {
    const items = [ready(), ready(2)]
    const before = structuredClone(items)
    const db = fakeDb()
    expect((await applyRevisionItems({ db, userId: Q, items, requireAllReady: true, draftOnly: true })).passed).toBe(true)
    expect(db.calls).toEqual(before.map(it => ['create_question_content_revision', {
      p_user_id: Q, p_question_id: it.questionId, p_base_revision_id: it.baseRevisionId,
      p_payload: it.payload, p_request_id: it.requestId,
    }]))
    expect(items.every(it => it.status === 'applied' && it.mappingRequired === true)).toBe(true)
    expect(items.every(it => it.status !== 'published')).toBe(true)
  })
  it('varsayilan parcali hazir-oge davranisi degismez; tam paket secenegi acik olmalidir', async () => {
    const items = [ready(), ready(2, { status: 'blocked' })]
    const db = fakeDb()
    expect((await applyRevisionItems({ db, userId: Q, items })).passed).toBe(true)
    expect(db.calls).toHaveLength(1)
    expect(items.map(it => it.status)).toEqual(['applied', 'blocked'])
  })
  it('izin/CAS RPC reddi uygulanmis sayilmaz; batch on kontrolu DB transaction garantisi degildir', async () => {
    const db = fakeDb({ data: null, error: { code: '42501', message: 'prepare permission required' } })
    const items = [ready()]
    const preflight = await applyRevisionItems({ db, userId: Q, items, requireAllReady: true })
    expect(preflight.passed).toBe(true)
    expect(items[0].status).toBe('blocked')
    expect(items[0].reasons.join(' ')).toContain('42501')
  })
  it('215 hattinin mevcut yayin ve replay sonucu varsayilan modda korunur', async () => {
    const db = fakeDb({ data: { revisionId: 'restored', replayed: true }, error: null })
    const items = [ready(1, { lane: 'turkish_restoration' })]
    await applyRevisionItems({ db, userId: Q, items, requireAllReady: true })
    expect(db.calls[0][0]).toBe('publish_question_turkish_restoration')
    expect(items[0]).toMatchObject({ status: 'published', revisionId: 'restored', replayed: true })
  })
})

describe('buildRevisionPayload', () => {
  it('RPC sozlesmesine uyan payload kurar: tam alti anahtar, icerik overlay, bos metadata alanlari dusuk', () => {
    const { payload, errors } = buildRevisionPayload({ current: current(), proposal: proposal() })
    expect(errors).toEqual([])
    expect(Object.keys(payload).sort()).toEqual(['changeKind', 'content', 'metadata', 'outcomes', 'source', 'summary'])
    expect(payload.content).toEqual({ question: 'Aşağıdakilerden hangisi doğru yazılmıştır?', options: ['kitab', 'kitap', 'kıtap', 'kitapp'], answer: 1, solution: 'Doğru yazım kitap.' })
    expect(payload.metadata).toEqual({ game: 'turkce', category: 'Yazım', topic: 'yazım kuralları', difficulty: 2, examRef: 'TYT', isBoss: false })
    expect(payload.outcomes).toEqual([{ outcomeId: OUTCOME, weight: 1, primary: true }])
    expect(payload.source).toEqual({ kind: 'original', title: 'Ogretmen notu', licenseCode: 'INTERNAL' })
    expect(payload.summary).toBe('[T-1 P1 ASCII_DIACRITIC_LOSS] Kokte karakter kaybi.')
  })
  it('ozet 500 karakterde kesilir; kaynak yoksa INTERNAL varsayilani', () => {
    const c = { ...current(), source: null }
    const { payload, errors } = buildRevisionPayload({ current: c, proposal: proposal({ finding: { code: 'X_LONG', severity: 'P2', summary: 'a'.repeat(900) } }) })
    expect(errors).toEqual([])
    expect(payload.summary.length).toBe(500)
    expect(payload.source).toEqual({ kind: 'original', title: 'Bilge Arena soru bankasi', licenseCode: 'INTERNAL' })
  })
  it('degisiklik turu kurallari: cevap degisirse correct_answer; correct_answer cevabi degistirmeli; retire patch bos; edit icerigi degistirmeli', () => {
    expect(buildRevisionPayload({ current: current(), proposal: proposal({ patch: { answer: 2 } }) }).errors).toContain('cevap anahtari degisiyor: changeKind correct_answer olmali')
    expect(buildRevisionPayload({ current: current(), proposal: proposal({ changeKind: 'correct_answer', patch: { answer: 1 } }) }).errors).toContain('correct_answer icin patch.answer mevcut cevaptan farkli olmali')
    expect(buildRevisionPayload({ current: current(), proposal: proposal({ changeKind: 'retire', patch: { question: 'x' } }) }).errors).toContain('retire icin patch bos olmali')
    expect(buildRevisionPayload({ current: current(), proposal: proposal({ patch: { answer: 1 } }) }).errors).toContain('patch mevcut icerigi degistirmiyor')
    const ok = buildRevisionPayload({ current: current(), proposal: proposal({ changeKind: 'correct_answer', patch: { answer: 2 } }) })
    expect(ok.errors).toEqual([]); expect(ok.payload.content.answer).toBe(2); expect(ok.payload.changeKind).toBe('correct_answer')
  })
  it('retire: icerik aynen kalir, changeKind retire; kazanim yoksa hata, proposal.outcomes ile asilir', () => {
    const r = buildRevisionPayload({ current: current(), proposal: proposal({ changeKind: 'retire', patch: {} }) })
    expect(r.errors).toEqual([]); expect(r.payload.content).toEqual(current().content); expect(r.payload.changeKind).toBe('retire')
    const none = buildRevisionPayload({ current: { ...current(), outcomes: [] }, proposal: proposal() })
    expect(none.errors.some((e) => e.startsWith('kazanim eslemesi yok'))).toBe(true)
    const over = buildRevisionPayload({ current: { ...current(), outcomes: [] }, proposal: proposal({ outcomes: [{ outcomeId: OUTCOME, weight: 0.5, primary: true }] }) })
    expect(over.errors).toEqual([]); expect(over.payload.outcomes).toEqual([{ outcomeId: OUTCOME, weight: 0.5, primary: true }])
  })
  it('zorluk, kategori ve kazanim patch ile degistirilemez (LLM zorluk degisikligi yok)', () => {
    const r = buildRevisionPayload({ current: current(), proposal: proposal({ patch: { question: 'x', difficulty: 5 } }) })
    expect(r.errors).toContain('patch.difficulty: izinli icerik alani degil')
    expect(r.payload.metadata.difficulty).toBe(2)
  })
})

describe('coach, kazanim ve kimlik kurallari (Codex #526)', () => {
  const coach = { hint1: 'ipucu 1', hint2: 'ipucu 2', miniExample: 'ornek', misconceptions: ['a', null, 'c', 'd'] }
  const coached = () => ({ ...current(), content: { ...current().content, coach } })
  it('coach yayimli revizyondan aynen tasinir, patch ile degistirilemez, diff satiri uretmez', () => {
    const r = buildRevisionPayload({ current: coached(), proposal: proposal() })
    expect(r.errors).toEqual([]); expect(r.payload.content.coach).toEqual(coach); expect(r.notes).toContain('coach nesnesi yayimli revizyondan aynen tasindi')
    expect(diffContent(r.before, r.after)).toEqual([{ field: 'question', before: 'Asagidakilerden hangisi dogru yazilmistir?', after: 'Aşağıdakilerden hangisi doğru yazılmıştır?' }])
    expect(buildRevisionPayload({ current: coached(), proposal: proposal({ patch: { question: 'x', coach: { hint1: 'y' } } }) }).errors).toContain('patch.coach: izinli icerik alani degil')
    expect(validateProposal(proposal({ patch: { coach: {} } }))).toContain('proposals[0].patch.coach: izinli icerik alani degil')
  })
  it('coach varken cevap anahtari degisemez (misconceptions null konumu kayar): insan coach revizyonu once', () => {
    const r = buildRevisionPayload({ current: coached(), proposal: proposal({ changeKind: 'correct_answer', patch: { answer: 2 } }) })
    expect(r.errors.some((e) => e.startsWith('cevap anahtari degisince coach.misconceptions'))).toBe(true)
    expect(r.errors).toContain('content.coach.misconceptions[1]: 1-1000 karakter')
    expect(r.errors).toContain('content.coach.misconceptions[2]: dogru secenek icin null olmali')
  })
  it('coach varken secenek metni anlamca degisemez veya yer degistiremez; yalniz yazim duzeltmesi gecer (Codex #528)', () => {
    const blocked = (e) => e.startsWith('secenekler degisince coach.misconceptions')
    // ayni sayi, ayni cevap indeksi, farkli secenek: misconceptions eski secenegi anlatirdi
    expect(buildRevisionPayload({ current: coached(), proposal: proposal({ patch: { options: ['kitab', 'kitap', 'defter', 'kitapp'] } }) }).errors.some(blocked)).toBe(true)
    // sira degisikligi de bloklanir (aciklama indeksle eslesir)
    expect(buildRevisionPayload({ current: coached(), proposal: proposal({ patch: { options: ['kitap', 'kitab', 'kıtap', 'kitapp'], answer: 0 } , changeKind: 'correct_answer' }) }).errors.some(blocked)).toBe(true)
    // yalniz yazim: diakritik, buyuk/kucuk harf, bosluk, tirnak bicimi
    const spelling = buildRevisionPayload({ current: coached(), proposal: proposal({ patch: { options: ['Kitab', 'kitap ', 'kıtap', 'kitapp'] } }) })
    expect(spelling.errors).toEqual([]); expect(spelling.payload.content.coach).toEqual(coach)
    const apostrophe = buildRevisionPayload({ current: { ...coached(), content: { ...coached().content, options: ["Türkiye'nin", 'kitap', 'kıtap', 'kitapp'] } }, proposal: proposal({ patch: { options: ['Türkiye’nin', 'kitap', 'kıtap', 'kitapp'] } }) })
    expect(apostrophe.errors).toEqual([])
    // isaret, ondalik ayraci, kesir, yuzde ve noktalama anlam tasir: yazim sayilmaz (Codex #530)
    const numeric = () => ({ ...coached(), content: { ...coached().content, options: ['-10', '1,5', '1/2', '%50'] } })
    for (const options of [['10', '1,5', '1/2', '%50'], ['-10', '15', '1/2', '%50'], ['-10', '1,5', '12', '%50'], ['-10', '1,5', '1/2', '50']])
      expect(buildRevisionPayload({ current: numeric(), proposal: proposal({ patch: { options } }) }).errors.some(blocked)).toBe(true)
    expect(buildRevisionPayload({ current: coached(), proposal: proposal({ patch: { options: ['kitab', 'kitap', 'kıtap.', 'kitapp'] } }) }).errors.some(blocked)).toBe(true)
    const diacritic = buildRevisionPayload({ current: { ...coached(), content: { ...coached().content, options: ['Turkiye', 'kitap', 'isik', 'Istanbul'] } }, proposal: proposal({ patch: { options: ['Türkiye', 'kitap', 'ışık', 'İstanbul'] } }) })
    expect(diacritic.errors).toEqual([])
    // ayni metnin ayrisik (NFD) yazimi ve sapkali harf de yazimdir
    const decomposed = buildRevisionPayload({ current: { ...coached(), content: { ...coached().content, options: ['Türkiye', 'hala', 'şişe', 'çiçek'] } }, proposal: proposal({ patch: { options: ['Türkiye', 'hâlâ', 'şişe', 'çiçek'] } }) })
    expect(decomposed.errors).toEqual([])
    // birlesik isaretli operator ve gosterimler anlam tasir: yazim sayilmaz (Codex #542)
    const marks = () => ({ ...coached(), content: { ...coached().content, options: ['≠', '∉', 'x̄', '0,3̅'] } })
    for (const options of [['=', '∉', 'x̄', '0,3̅'], ['≠', '∈', 'x̄', '0,3̅'], ['≠', '∉', 'x', '0,3̅'], ['≠', '∉', 'x̄', '0,3']])
      expect(buildRevisionPayload({ current: marks(), proposal: proposal({ patch: { options } }) }).errors.some(blocked)).toBe(true)
    // ayni operatorun ayrisik yazimi (= + U+0338) ise ayni kalir
    expect(buildRevisionPayload({ current: marks(), proposal: proposal({ patch: { options: ['≠', '∉', 'x̄', '0,3̅'] } }) }).errors).toEqual([])
    // coach yoksa secenek degisikligi serbest
    expect(buildRevisionPayload({ current: current(), proposal: proposal({ patch: { options: ['kitab', 'kitap', 'defter', 'kitapp'] } }) }).errors).toEqual([])
  })
  it('coach sekli 110 sozlesmesine gore dogrulanir', () => {
    const p = buildRevisionPayload({ current: coached(), proposal: proposal() }).payload
    expect(validatePayloadShape({ ...p, content: { ...p.content, coach: { hint1: 'a' } } })).toContain('content.coach: anahtarlar hint1,hint2,miniExample,misconceptions olmali')
    expect(validatePayloadShape({ ...p, content: { ...p.content, coach: { ...coach, misconceptions: ['a', null] } } })).toContain('content.coach.misconceptions: secenek sayisi kadar oge')
    expect(validatePayloadShape({ ...p, content: { ...p.content, coach: { ...coach, hint1: '' } } })).toContain('content.coach.hint1: 1-700 karakter')
  })
  it('mevcut icerikte sozlesme disi alan varsa oge bloklanir (sessizce dusurulmez)', () => {
    const r = buildRevisionPayload({ current: { ...current(), content: { ...current().content, imageUrl: 'https://x/y.png' } }, proposal: proposal() })
    expect(r.errors.some((e) => e.startsWith('mevcut icerikte sozlesme disi alan: imageUrl'))).toBe(true)
  })
  it('proposal.outcomes yalniz eslemesi olmayan soruda kabul edilir; varsa hata', () => {
    const over = { outcomes: [{ outcomeId: OUTCOME, weight: 1, primary: true }] }
    expect(buildRevisionPayload({ current: current(), proposal: proposal(over) }).errors).toContain('soru zaten kazanim eslemesine sahip; proposal.outcomes yalniz eslemesi olmayan sorular icin (kazanim degisikligi bu paketin kapsami disinda)')
    const r = buildRevisionPayload({ current: { ...current(), outcomes: [] }, proposal: proposal(over) })
    expect(r.errors).toEqual([]); expect(r.notes).toContain('kazanim eslemesi oneriden alindi (soruda esleme yoktu)')
  })
  it('kazanimlar outcomeId sirasina gore kurulur: satir sirasi istek kimligini degistirmez', () => {
    const o1 = { outcomeId: OUTCOME, weight: 0.5, primary: true }; const o2 = { outcomeId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', weight: 0.5, primary: false }
    const a = buildRevisionPayload({ current: { ...current(), outcomes: [o1, o2] }, proposal: proposal() }).payload
    const b = buildRevisionPayload({ current: { ...current(), outcomes: [o2, o1] }, proposal: proposal() }).payload
    expect(a.outcomes).toEqual([o1, o2]); expect(draftRequestId(Q, a)).toBe(draftRequestId(Q, b))
  })
  it('buyuk harfli uuid oneri kucuk harfli DB anahtarini bulur; istek kimligi kucuk harfle hesaplanir', () => {
    const items = buildBatch({ proposals: [proposal({ questionId: Q.toUpperCase() })], currentById: new Map([[Q, current()]]) })
    expect(items[0].status).toBe('ready'); expect(items[0].questionId).toBe(Q)
    expect(draftRequestId(Q.toUpperCase(), items[0].payload)).toBe(items[0].requestId)
  })
})

describe('validatePayloadShape (106 aynasi)', () => {
  const good = () => buildRevisionPayload({ current: current(), proposal: proposal() }).payload
  it('gecerli payload hatasiz', () => { expect(validatePayloadShape(good())).toEqual([]) })
  it('secenek sayisi, cevap araligi, oyun, agirlik bicimi, tek primary, kaynak turu', () => {
    expect(validatePayloadShape({ ...good(), content: { ...good().content, options: ['a'] } })).toContain('content.options: 2-5 secenek')
    expect(validatePayloadShape({ ...good(), content: { ...good().content, answer: 4 } })).toContain('content.answer: 0-4 ve secenek sayisindan kucuk tamsayi')
    expect(validatePayloadShape({ ...good(), metadata: { ...good().metadata, game: 'tarih' } })).toContain('metadata.game: wordquest|matematik|turkce|fen|sosyal')
    expect(validatePayloadShape({ ...good(), outcomes: [{ outcomeId: OUTCOME, weight: 0.1234, primary: true }] })).toContain('outcomes[0].weight: (0,1] en cok 3 ondalik')
    expect(validatePayloadShape({ ...good(), outcomes: [{ outcomeId: OUTCOME, weight: 1, primary: false }] })).toContain('outcomes: tam olarak bir primary')
    expect(validatePayloadShape({ ...good(), source: { kind: 'llm', title: 'x', licenseCode: 'INTERNAL' } })).toContain('source.kind: original|licensed|public_domain|user_generated|official_exam')
    expect(validatePayloadShape({ ...good(), extra: 1 })[0]).toMatch(/payload anahtarlari tam olarak/)
  })
})

describe('scanGate', () => {
  it('ERROR bulgusu bloklar (diakritik kaybi eklemek), WARN not olur, retire atlanir', () => {
    const bad = buildRevisionPayload({ current: current(), proposal: proposal({ patch: { question: 'Asagidakilerden hangisi dogru?' , solution: 'x' } }) })
    expect(scanGate({ payload: bad.payload, current: current(), changeKind: 'edit' }).blocking[0]).toMatch(/ascii_diacritic_loss/)
    const warn = buildRevisionPayload({ current: current(), proposal: proposal({ patch: { question: 'Aşağıdakilerden hangisi en Büyük okyanustur?' } }) })
    const g = scanGate({ payload: warn.payload, current: current(), changeKind: 'edit' })
    expect(g.blocking).toEqual([]); expect(g.notes[0]).toMatch(/mid_sentence_capital/)
    expect(scanGate({ payload: bad.payload, current: current(), changeKind: 'retire' })).toEqual({ blocking: [], notes: [] })
  })
})

describe('draftRequestId', () => {
  it('deterministik, uuid bicimli, payload degisince degisir', () => {
    const p = buildRevisionPayload({ current: current(), proposal: proposal() }).payload
    const a = draftRequestId(Q, p); const b = draftRequestId(Q, { ...p, content: { ...p.content, answer: 2 } })
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(draftRequestId(Q, JSON.parse(JSON.stringify(p)))).toBe(a)
    expect(b).not.toBe(a)
  })
})

describe('parseProposals / validateProposal', () => {
  it('ornek fikstur gecerli: uc degisiklik turu', () => {
    const { proposals, errors } = parseProposals(readFixture('example.json'))
    expect(errors).toEqual([]); expect(proposals.map((p) => p.changeKind)).toEqual(['edit', 'correct_answer', 'retire'])
  })
  it('16 soruluk iskelet gecerli ve tamamen needs_patch: betik hicbirini uygulamaz', () => {
    const { proposals, errors } = parseProposals(readFixture('pilot1-4.skeleton.json'))
    expect(errors).toEqual([]); expect(proposals).toHaveLength(16)
    expect(proposals.every((p) => p.status === 'needs_patch')).toBe(true)
    const items = buildBatch({ proposals, currentById: new Map() })
    expect(items.every((i) => i.status === 'needs_patch' && i.payload === null && i.requestId === null)).toBe(true)
  })
  it('sema surumu, uuid, severity, patch/changeKind tutarliligi ve tekrarlar', () => {
    expect(parseProposals({ schemaVersion: 'x', batch: { title: 't' }, proposals: [proposal()] }).errors).toContain(`schemaVersion ${PROPOSALS_SCHEMA} olmali`)
    expect(validateProposal(proposal({ questionId: 'nope' }))).toContain('proposals[0].questionId: uuid degil')
    expect(validateProposal(proposal({ finding: { code: 'X_Y', severity: 'P9', summary: 's' } }))).toContain('proposals[0].finding.severity: P0|P1|P2')
    expect(validateProposal(proposal({ changeKind: 'retire' }))).toContain('proposals[0]: retire icin patch bos olmali')
    expect(validateProposal(proposal({ patch: {} }))).toContain('proposals[0]: edit icin patch bos olamaz')
    expect(validateProposal(proposal({ patch: { difficulty: 1 } }))).toContain('proposals[0].patch.difficulty: izinli icerik alani degil')
    const dup = parseProposals({ schemaVersion: PROPOSALS_SCHEMA, batch: { title: 't' }, proposals: [proposal(), proposal({ ref: 'T-2' })] })
    expect(dup.errors.some((e) => e.includes('questionId tekrar'))).toBe(true)
  })
})

describe('currentFromRows / snapshotFromExport', () => {
  it('get_question_content_revision ciktisini tek nesneye ceker; icerik/kaynak/kazanim RPC detayindan, taban published_revision_id, kimlikler kucuk harf', () => {
    const c = currentFromRevisionDetail({
      question: { id: Q.toUpperCase(), game: 'fen', category: 'fizik', subcategory: null, topic: null, difficulty: 3, level_tag: null, exam_ref: null, is_boss: false, is_active: true, content: { question: 'eski' }, published_revision_id: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB' },
      detail: { revision: { revisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', content: { question: 'yayimli', options: ['a', 'b'], answer: 0 }, source: { kind: 'official_exam', title: 'OSYM 2023', licenseCode: 'OSYM', provenanceRef: 'osym:2023' }, outcomes: [{ outcomeId: 'FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF', weight: 0.5, primary: false }, { outcomeId: OUTCOME, weight: 1, primary: true }] } },
      fallbackOutcomes: [{ outcome_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', weight: '1', is_primary: true }],
    })
    expect(c.questionId).toBe(Q); expect(c.content.question).toBe('yayimli'); expect(c.baseRevisionId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(c.outcomes).toEqual([{ outcomeId: OUTCOME, weight: 1, primary: true }, { outcomeId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', weight: 0.5, primary: false }])
    expect(c.source).toEqual({ kind: 'official_exam', title: 'OSYM 2023', licenseCode: 'OSYM', provenanceRef: 'osym:2023' })
    expect(buildRevisionPayload({ current: c, proposal: proposal({ patch: { question: 'yeni' } }) }).errors).toEqual([])
  })
  it('revizyon eslemesi bossa (legacy) question_outcomes satirlarina duser; kaynak yoksa null', () => {
    const c = currentFromRevisionDetail({
      question: { id: Q, game: 'turkce', category: 'Yazım', difficulty: 2, is_active: true, published_revision_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      detail: { revision: { revisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', content: current().content, source: {}, outcomes: [] } },
      fallbackOutcomes: [{ outcome_id: OUTCOME, weight: '1', is_primary: true }],
    })
    expect(c.outcomes).toEqual([{ outcomeId: OUTCOME, weight: 1, primary: true }]); expect(c.source).toBeNull()
  })
  it('dbLookupIds: iskelet ogeleri ve uuid olmayan degerler DB sorgusuna gitmez (Codex #526)', () => {
    expect(dbLookupIds([proposal(), { ref: 'S', status: 'needs_patch', questionId: 'TODO', finding: { summary: 's' } }, proposal({ questionId: Q.toUpperCase() })])).toEqual([Q])
  })
  it('Antigravity [{code,row}] dis aktarimini okur', () => {
    const m = snapshotFromExport([{ code: 'P4-Q10', row: { id: Q, game: 'turkce', content: { question: 'q', options: ['a', 'b'], answer: 0 } } }])
    expect(m.get(Q)).toEqual(expect.objectContaining({ ref: 'P4-Q10', game: 'turkce' }))
    expect(snapshotFromExport({ rows: [{ id: Q, content: {} }] }).has(Q)).toBe(true)
  })
})

describe('buildBatch / renderReviewSheet', () => {
  it('pinli oneri yalniz incelenen revizyon VE tam icerikte kurulur; eski oneriler uyumludur', () => {
    const c = current()
    const p = proposal({ expectedBase: { revisionId: c.baseRevisionId.toUpperCase(), contentFingerprint: contentFingerprint(c.content) } })
    expect(validateProposal(p)).toEqual([])
    const make = (value, prop = p) => buildBatch({ proposals: [prop], currentById: new Map([[Q, value]]), offline: true })[0]
    expect(make(c).status).toBe('preview')
    expect(make({ ...c, baseRevisionId: Q }).status).toBe('blocked')
    expect(make({ ...c, content: { ...c.content, solution: 'Başka açıklama.' } }).status).toBe('blocked')
    expect(make(c, proposal()).status).toBe('preview')
    expect(make(c, proposal({ expectedBase: null })).status).toBe('blocked')
  })
  it('canonical JSON fingerprint anahtar sirasindan bagimsizdir, noktalama ve tum icerigi korur', () => {
    expect(contentFingerprint({ a: { x: 1, y: 2 }, b: ['-10'] })).toBe(contentFingerprint({ b: ['-10'], a: { y: 2, x: 1 } }))
    expect(contentFingerprint({ a: '-10' })).not.toBe(contentFingerprint({ a: '10' }))
    for (const expectedBase of [{}, { revisionId: Q, contentFingerprint: 'x' }, { revisionId: Q, contentFingerprint: 'a'.repeat(64), extra: true }]) {
      expect(validateProposal(proposal({ expectedBase })).some(e => e.includes('.expectedBase:'))).toBe(true)
    }
  })
  it('dis aktarim metadata zorlugu/sinavi aynen korur, eski satir icin fallback kalir', () => {
    const s = snapshotFromExport({ rows: [{ id: Q, game: 'sosyal', category: 'tarih', difficulty: 5, exam_ref: 'TYT', topic: 'Konu', content: {} }] }).get(Q)
    expect(s.metadata).toEqual(expect.objectContaining({ difficulty: 5, examRef: 'TYT', topic: 'Konu' }))
    expect(snapshotFromExport({ rows: [{ id: Q, content: {} }] }).get(Q).metadata.difficulty).toBe(3)
  })
  it('--offline ortamda DB anahtari olsa da yalniz dosyadan preview uretir; apply ve eksik rows reddedilir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bilge-revision-offline-'))
    try {
      const c = current()
      const proposalsPath = join(dir, 'proposals.json'); const rowsPath = join(dir, 'rows.json')
      writeFileSync(proposalsPath, JSON.stringify({ schemaVersion: PROPOSALS_SCHEMA, batch: { title: 'CLI test' }, proposals: [proposal()] }))
      writeFileSync(rowsPath, JSON.stringify({ rows: [{ id: Q, game: c.metadata.game, category: c.metadata.category, difficulty: 2, content: c.content, published_revision_id: c.baseRevisionId }] }))
      const script = fileURLToPath(new URL('../prepare-question-revision-drafts.mjs', import.meta.url))
      const run = (...args) => spawnSync(process.execPath, [script, '--proposals', proposalsPath, '--out-dir', join(dir, 'out'), ...args], {
        encoding: 'utf8', timeout: 10000, env: { ...process.env, SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-not-a-secret' },
      })
      const result = run('--offline', '--rows', rowsPath)
      expect(result.status).toBe(0)
      const report = JSON.parse(readFileSync(join(dir, 'out', 'report.json'), 'utf8'))
      expect(report.mode).toBe('offline-preview'); expect(report.items[0].status).toBe('preview')
      expect(report.items[0].payload.metadata.difficulty).toBe(2)
      writeFileSync(proposalsPath, JSON.stringify({ schemaVersion: PROPOSALS_SCHEMA, batch: { title: 'CLI test' }, proposals: [proposal({ expectedBase: { revisionId: c.baseRevisionId, contentFingerprint: contentFingerprint(c.content) } })] }))
      expect(run('--offline', '--rows', rowsPath, '--mapping-pending-drafts').status).toBe(0)
      const mappingReport = JSON.parse(readFileSync(join(dir, 'out', 'report.json'), 'utf8'))
      expect(mappingReport.mappingPendingDrafts).toBe(true)
      expect(mappingReport.items[0]).toEqual(expect.objectContaining({ status: 'preview', lane: 'draft', mappingRequired: true, requestId: null }))
      expect(run('--offline', '--rows', rowsPath, '--mapping-pending-drafts', '--require-all-ready').status).toBe(1)
      const previewPreflight = JSON.parse(readFileSync(join(dir, 'out', 'report.json'), 'utf8'))
      expect(previewPreflight.applyPreflight).toMatchObject({ requiredAllReady: true, draftOnly: true, passed: false, blockingRefs: ['T-1'] })
      expect(previewPreflight.items[0].status).toBe('preview')
      expect(run('--offline', '--rows', rowsPath, '--apply').status).toBe(2)
      expect(run('--offline').status).toBe(2)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('cevrimdisi onizleme: oge preview (uygulanamaz), kazanim eksigi pending_db notu; canli modda blok', () => {
    const c = { ...current(), outcomes: [], baseRevisionId: null }
    const offline = buildBatch({ proposals: [proposal()], currentById: new Map([[Q, c]]), offline: true })[0]
    expect(offline.status).toBe('preview'); expect(offline.requestId).toBeNull(); expect(offline.notes.join(' ')).toMatch(/pending_db/)
    const online = buildBatch({ proposals: [proposal()], currentById: new Map([[Q, c]]) })[0]
    expect(online.status).toBe('blocked'); expect(online.reasons.join(' ')).toMatch(/kazanim eslemesi yok/); expect(online.reasons.join(' ')).toMatch(/yayimli revizyon yok/)
  })
  it('bulunamayan soru bloklanir; inceleme sayfasi once/sonra tablosu ve iki insan onayi notu tasir', () => {
    const items = buildBatch({ proposals: [proposal(), proposal({ ref: 'T-2', questionId: '22222222-2222-4222-8222-222222222222' })], currentById: new Map([[Q, current()]]) })
    expect(items.map((i) => i.status)).toEqual(['ready', 'blocked'])
    expect(items[0].diff).toEqual([{ field: 'question', before: 'Asagidakilerden hangisi dogru yazilmistir?', after: 'Aşağıdakilerden hangisi doğru yazılmıştır?' }])
    const md = renderReviewSheet({ batch: { title: 'Test' }, items })
    expect(md).toContain('## T-1 · ' + Q)
    expect(md).toContain('| question | Asagidakilerden hangisi dogru yazilmistir? | Aşağıdakilerden hangisi doğru yazılmıştır? |')
    expect(md).toMatch(/iki bagimsiz insan onayi/)
    expect(md).toContain('soru bulunamadi')
    expect(md).toContain(`- Kazanim eslemesi (degismez): ${OUTCOME} (w 1, primary)`)
  })
  it('inceleme sayfasi hucrelerinde ters bolu, boru ve satir sonu kacirilir (CodeQL)', () => {
    const c = { ...current(), content: { ...current().content, question: 'a\\b | c\nd' } }
    const items = buildBatch({ proposals: [proposal({ patch: { question: 'x\\y | z' } })], currentById: new Map([[Q, c]]) })
    const md = renderReviewSheet({ batch: { title: 'T' }, items })
    expect(md).toContain('| question | a\\\\b \\| c d | x\\\\y \\| z |')
  })
  it('diffContent secenekleri tek tek karsilastirir', () => {
    expect(diffContent({ options: ['a', 'b', 'c'], answer: 0 }, { options: ['a', 'B', 'c'], answer: 0 })).toEqual([{ field: 'options[1]', before: 'b', after: 'B' }])
  })
})

describe('esleme bekleyen TASLAK modu (migration 164)', () => {
  const unmapped = () => ({ ...current(), outcomes: [], source: { kind: 'original', title: 'Legacy import', licenseCode: 'legacy-import' } })
  const pinned = (c, over = {}) => proposal({ expectedBase: { revisionId: c.baseRevisionId, contentFingerprint: contentFingerprint(c.content) }, ...over })
  const run = (c, p = pinned(c), over = {}) => buildBatch({ proposals: [p], currentById: new Map([[Q, c]]), mappingPendingDrafts: true, ...over })[0]

  it('bos outcomes yalniz revision validator modu ile gecer; create ve default hala blok', () => {
    const built = buildRevisionPayload({ current: unmapped(), proposal: proposal(), allowUnmapped: true })
    expect(built.errors).toEqual([])
    expect(validatePayloadShape(built.payload, { allowUnmapped: true })).toEqual([])
    expect(validatePayloadShape(built.payload)).toContain('outcomes: 1-5 kazanim')
    expect(validatePayloadShape({ ...built.payload, changeKind: 'create' }, { allowUnmapped: true })).toContain('outcomes: 1-5 kazanim')
    expect(built.payload.source).toEqual(unmapped().source)
  })

  it('pinli duzeltme create RPC icin ready kalir, esleme/yayin uygunlugu iddia etmez', () => {
    const c = unmapped(); const it1 = run(c)
    expect(it1).toEqual(expect.objectContaining({ status: 'ready', lane: 'draft', mappingRequired: true }))
    expect(it1.payload.outcomes).toEqual([])
    expect(it1.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(renderReviewSheet({ batch: { title: 'test' }, items: [it1] })).toContain('stage 2/yayin uygunlugu degildir')
    expect(run(c, pinned(c), { mappingPendingDrafts: false }).status).toBe('blocked')
  })

  it('expectedBase zorunlu; farkli taban/icerik, eksik kaynak/revizyon reddedilir', () => {
    const c = unmapped(); const p = pinned(c)
    expect(run(c, proposal()).reasons.join(' ')).toContain('expectedBase zorunlu')
    expect(run({ ...c, baseRevisionId: Q }, p).status).toBe('blocked')
    expect(run({ ...c, content: { ...c.content, answer: 0 } }, p).status).toBe('blocked')
    expect(run({ ...c, source: null }, p).reasons.join(' ')).toContain('INTERNAL kaynak uydurulamaz')
    const noRevision = { ...c, baseRevisionId: null }
    expect(run(noRevision, p).status).toBe('blocked')
  })

  it('yanlis dolu kazanimi, tarama ERROR veya yeni soru yaratmayi filtrelemez', () => {
    const c = unmapped()
    expect(run(c, pinned(c, { outcomes: [{ outcomeId: OUTCOME, weight: 1, primary: false }] })).reasons).toContain('outcomes: tam olarak bir primary')
    expect(run(c, pinned(c, { patch: { question: 'Asagidaki ifadeyi okuyunuz.' } })).status).toBe('blocked')
    expect(run(c, pinned(c, { changeKind: 'create' })).status).toBe('blocked')
    expect(run(c, pinned(c), { offline: true })).toEqual(expect.objectContaining({ status: 'preview', requestId: null }))
  })

  it('215 harf duzeltmesi dahil butun ogeleri draft hattinda tutar', () => {
    const c = { ...unmapped(), metadata: { ...current().metadata, game: 'fen', category: 'fizik' },
      content: { question: 'Asagidaki ifadelerden hangisi dogrudur?', options: ['Ölçüm', 'Deney', 'Madde', 'Işık'], answer: 0, solution: 'Ölçüm.' } }
    const p = pinned(c, { patch: { question: 'Aşağıdaki ifadelerden hangisi doğrudur?' } })
    expect(run(c, p)).toEqual(expect.objectContaining({ status: 'ready', lane: 'draft', words: null, mappingRequired: true }))
    expect(run(c, p, { mappingPendingDrafts: false }).lane).toBe('turkish_restoration')
  })
})

describe('Turkce harf duzeltmesi hatti (migration 215)', () => {
  const fen = (over = {}) => ({
    ...current(),
    content: { question: 'Asagidaki ifadelerden hangisi dogrudur?', options: ['Ogrenci sinifta olcum yapar.', 'Gunes batar.', 'Deney yapilir.', 'Hepsi'], answer: 0, solution: 'Cozum: ogrenci olcum yapar.' },
    metadata: { ...current().metadata, game: 'fen', category: 'fizik', topic: undefined },
    ...over,
  })
  const restore = { question: 'Aşağıdaki ifadelerden hangisi doğrudur?', options: ['Öğrenci sınıfta ölçüm yapar.', 'Gunes batar.', 'Deney yapilir.', 'Hepsi'] }
  const run = (cur, patch = restore, over = {}) => buildBatch({ proposals: [proposal({ changeKind: 'edit', patch, ...over })], currentById: new Map([[Q, cur]]) })[0]

  it('yalniz listelenmis govdelerin harf duzeltmesi 215 hattina gider; kazanim eksigi bu hatti engellemez', () => {
    const it1 = run(fen())
    expect(it1).toEqual(expect.objectContaining({ status: 'ready', lane: 'turkish_restoration' }))
    expect(it1.words).toEqual(['Ogrenci>Öğrenci', 'sinifta>sınıfta', 'olcum>ölçüm', 'Asagidaki>Aşağıdaki', 'dogrudur>doğrudur'])
    expect(it1.requestId).toMatch(/^[0-9a-f-]{36}$/)
    const unmapped = run(fen({ outcomes: [] }))
    expect(unmapped).toEqual(expect.objectContaining({ status: 'ready', lane: 'turkish_restoration' }))
    expect(renderReviewSheet({ batch: { title: 't' }, items: [it1] })).toContain('Turkce harf duzeltmesi (215), iki onaysiz yayin')
  })

  it('listede olmayan govde, harf disi degisiklik veya cevap degisikligi iki onayli yolda kalir', () => {
    expect(run(fen(), { ...restore, options: ['Öğrenci sınıfta ölçüm yapar.', 'Güneş batar.', 'Deney yapilir.', 'Hepsi'] }).lane).toBe('draft')
    expect(run(fen(), { ...restore, question: 'Aşağıdaki ifadelerden hangisi doğrudur ?' }).lane).toBe('draft')
    expect(run(fen(), { ...restore, answer: 1 }, { changeKind: 'correct_answer' }).lane).toBe('draft')
    // esleme eksigi iki onayli yolda blok olarak kalir
    expect(run(fen({ outcomes: [] }), { ...restore, question: 'Aşağıdaki ifadelerden hangisi doğru ?' }).status).toBe('blocked')
  })

  it('kapsam disi: yazim konulu kok, yazim_kurallari, wordquest ve pasif soru', () => {
    const spelling = run(fen({ content: { ...fen().content, question: 'Asagidakilerin hangisinde yazim yanlisi vardir?' } }), { question: 'Aşağıdakilerin hangisinde yazim yanlisi vardir?' })
    expect(spelling.lane).toBe('draft')
    expect(spelling.notes.join(' ')).toContain('iki onayli yol: kok yazim/noktalama/ses bilgisi konulu')
    expect(run(fen({ metadata: { ...fen().metadata, game: 'turkce', category: 'yazim_kurallari' } })).lane).toBe('draft')
    expect(run(fen({ metadata: { ...fen().metadata, game: 'wordquest', category: 'vocabulary' } })).lane).toBe('draft')
    const inactive = run(fen({ isActive: false }))
    expect(inactive.lane).toBe('draft')
    expect(inactive.notes.join(' ')).toContain('soru pasif')
  })

  it('tabanda kalan tarama ERROR\'u 215 hattini bloklamaz, not olur; iki onayli yolda bloklar', () => {
    const cur = fen({ content: { ...fen().content, solution: 'Cozum: kisi basina bir olcum.' } })
    const lane = run(cur)
    expect(lane).toEqual(expect.objectContaining({ status: 'ready', lane: 'turkish_restoration' }))
    expect(lane.notes.join(' ')).toContain('tabanda da var, ayri oneriyle ele alin')
    const draft = run(cur, { ...restore, solution: 'Çözüm: kisi başına bir ölçüm yapılır.' })
    expect(draft.lane).toBe('draft')
    expect(draft.status).toBe('blocked')
  })
})
