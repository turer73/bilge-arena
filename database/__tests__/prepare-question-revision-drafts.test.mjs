/**
 * Taslak revizyon paketi — mantik testi (DB'siz).
 *
 * RPC sozlesmesi (content_governance_validate_payload, migration 106) aynasi,
 * degisiklik turu kurallari, tarama kapisi, deterministik istek kimligi ve
 * inceleme sayfasi burada kilitlenir. Gercek RPC kabulu
 * question-content-governance-postgres.integration.test.mjs icinde.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROPOSALS_SCHEMA,
  buildBatch,
  buildRevisionPayload,
  currentFromRevisionDetail,
  dbLookupIds,
  diffContent,
  draftRequestId,
  parseProposals,
  renderReviewSheet,
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
