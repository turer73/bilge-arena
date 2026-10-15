import assert from 'node:assert/strict'
import { buildCanonicalCatalogPlan, bindCanonicalCatalogPlan, canonicalIdentity } from '../canonical-curriculum.mjs'

const { describe, it } = process.env.VITEST ? await import('vitest') : await import('node:test')
const hash = 'a'.repeat(64), packageHash = 'b'.repeat(64)
const oldId = `meb2019-turkce@${hash}:grade8:LGS:T.8.3.25`
function fixture() {
  const shared = { program: 'meb2019-turkce', programVersion: `meb2019-turkce@${hash}`,
    grade: 8, examRef: 'LGS', titleIsOfficial: true,
    source: { responseSha256: hash, pageTextSha256: hash, pdfPage: 40,
      url: 'https://example.org/program.pdf', extractor: 'pypdf', extractorVersion: '6.10.0' } }
  const root = { ...shared, canonicalId: 'course', parentId: null, nodeType: 'course', title: 'Türkçe', officialCode: null }
  const skill = { ...shared, canonicalId: 'skill', parentId: 'course', nodeType: 'language_skill', title: 'Okuma', officialCode: null }
  const outcome = { ...shared, canonicalId: oldId, parentId: 'skill', nodeType: 'outcome', officialCode: 'T.8.3.25', title: 'Örnek kazanım.' }
  const aliases = ['dil_bilgisi', 'paragraf'].map((category, index) => ({ code: `ALIAS-${index}`,
    canonicalOutcomeId: oldId, officialCode: outcome.officialCode, title: outcome.title,
    game: 'turkce', category, examRef: 'LGS', program: shared.program, taxonomyVersion: 'fixture@1',
    nodeCode: `NODE-${index}`, isInternalAlias: true, isAccepted: false }))
  return {
    packageSha256: packageHash,
    programEditions: { 'meb2019-turkce': { programKey: 'meb-turkce', edition: '2019' } },
    catalog: { version: 'lgs-catalog-candidates@2', candidateOnly: true, publicationAuthorized: false,
      catalogAcceptance: false, taxonomyVersion: 'fixture@1',
      nodes: [root, skill, structuredClone(outcome)], outcomes: [outcome] },
    projection: { version: 'lgs-catalog-storage-projection@1', candidateOnly: true,
      publicationAuthorized: false, catalogAcceptance: false, importAuthorized: false,
      requiresCanonicalConsumerBeforeImport: true, taxonomyVersion: 'fixture@1', outcomes: aliases,
      nodes: aliases.map(a => ({ code: a.nodeCode, nodeType: 'outcome', canonicalId: oldId,
        game: a.game, category: a.category, examRef: a.examRef, taxonomyVersion: a.taxonomyVersion })) },
  }
}
const make = () => buildCanonicalCatalogPlan(fixture())
const bindingRows = plan => plan.aliasBindings.map((a, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  code: a.outcomeCode, game: a.game, category: a.category, exam_ref: a.examRef, taxonomy_version: a.taxonomyVersion,
  title: plan.canonicalOutcomes.find(c => c.canonical_id === a.canonicalId).title }))

describe('canonical catalog candidate adapter', () => {
  it('deduplicates aliases without authorizing acceptance, publication, or learners', () => {
    const p = make()
    assert.equal(p.canonicalOutcomes.length, 1)
    assert.equal(p.aliasBindings.length, 2)
    assert.equal(new Set(p.aliasBindings.map(a => a.canonicalId)).size, 1)
    for (const flag of ['importAuthorized', 'publicationAuthorized', 'curriculumAcceptance', 'learnerReady']) assert.equal(p[flag], false)
    assert.equal(p.databaseWrites, 0)
  })
  it('retains the program path, not storage bridge titles', () => {
    const f = fixture()
    f.projection.nodes.push({ code: 'BRIDGE', title: 'depolama bağlantısı', isInternalBridge: true })
    const p = buildCanonicalCatalogPlan(f)
    assert.deepEqual(p.canonicalOutcomes[0].official_path.map(n => n.nodeType), ['course', 'language_skill', 'outcome'])
    assert.equal(JSON.stringify(p).includes('depolama bağlantısı'), false)
  })
  it('keeps identity stable across PDF byte changes, with separate provenance', () => {
    const f = fixture(), old = make()
    for (const n of [...f.catalog.nodes, ...f.catalog.outcomes]) {
      n.source.responseSha256 = 'c'.repeat(64)
      n.programVersion = `${n.program}@${'c'.repeat(64)}`
    }
    const changed = buildCanonicalCatalogPlan(f)
    assert.equal(changed.canonicalOutcomes[0].canonical_id, old.canonicalOutcomes[0].canonical_id)
    assert.notEqual(changed.canonicalOutcomes[0].source_receipt.responseSha256, old.canonicalOutcomes[0].source_receipt.responseSha256)
  })
  it('does not combine different program editions', () => {
    const f = fixture()
    f.programEditions['meb2019-turkce'].edition = '2019-corrected'
    assert.notEqual(buildCanonicalCatalogPlan(f).canonicalOutcomes[0].canonical_id, make().canonicalOutcomes[0].canonical_id)
  })
  it('never mutates the reviewed input', () => {
    const f = fixture(), before = structuredClone(f)
    buildCanonicalCatalogPlan(f)
    assert.deepEqual(f, before)
  })
  it('retains the old reviewed ID and package hash', () => {
    const receipt = make().canonicalOutcomes[0].source_receipt
    assert.equal(receipt.reviewedCanonicalId, oldId)
    assert.equal(receipt.packageSha256, packageHash)
  })
  const invalid = [
    ['missing edition', f => { f.programEditions = {} }],
    ['invalid package hash', f => { f.packageSha256 = 'wrong' }],
    ['wrong version', f => { f.catalog.version = 'unknown' }],
    ['publication permission', f => { f.projection.publicationAuthorized = true }],
    ['catalog acceptance', f => { f.catalog.catalogAcceptance = true }],
    ['import permission', f => { f.projection.importAuthorized = true }],
    ['taxonomy drift', f => { f.projection.taxonomyVersion = 'other' }],
    ['duplicate node', f => { f.catalog.nodes.push(structuredClone(f.catalog.nodes[0])) }],
    ['duplicate alias', f => { f.projection.outcomes.push(structuredClone(f.projection.outcomes[0])) }],
    ['orphan alias', f => { f.projection.outcomes[1].canonicalOutcomeId = 'unknown' }],
    ['missing parent', f => { f.catalog.nodes[1].parentId = 'unknown' }],
    ['cycle', f => { f.catalog.nodes[1].parentId = oldId }],
    ['hidden bridge in canonical graph', f => { f.catalog.nodes[1].isInternalBridge = true }],
    ['unofficial title', f => { f.catalog.nodes[1].titleIsOfficial = false }],
    ['wrong parent scope', f => { f.catalog.nodes[1].examRef = 'TYT' }],
    ['changed outcome title', f => { f.catalog.outcomes[0].title = 'Changed' }],
    ['wrong alias game', f => { f.projection.outcomes[1].game = 'sosyal' }],
    ['wrong leaf category', f => { f.projection.nodes[1].category = 'other' }],
    ['invalid source hash', f => { f.catalog.nodes[0].source.responseSha256 = null }],
    ['missing extraction version', f => { f.catalog.nodes[0].source.extractorVersion = '' }],
    ['missing source page', f => { f.catalog.nodes[0].source.pdfPage = 0 }],
  ]
  for (const [name, mutate] of invalid) it(`refuses ${name}`, () => {
    const f = fixture()
    mutate(f)
    assert.throws(() => buildCanonicalCatalogPlan(f))
  })
  it('binds fresh aliases explicitly, without writes', () => {
    const p = make(), legacy = bindingRows(p)
    const rows = bindCanonicalCatalogPlan(p, legacy)
    assert.deepEqual(rows.map(r => r.outcome_id), legacy.map(r => r.id))
    assert.equal(new Set(rows.map(r => r.canonical_id)).size, 1)
  })
  for (const [name, mutate] of [
    ['missing alias', rows => rows.pop()],
    ['duplicate UUID', rows => { rows[1].id = rows[0].id }],
    ['wrong category', rows => { rows[1].category = 'other' }],
    ['wrong exam', rows => { rows[1].exam_ref = 'TYT' }],
    ['wrong taxonomy', rows => { rows[1].taxonomy_version = 'old' }],
    ['changed definition', rows => { rows[1].title = 'Different outcome.' }],
    ['invented UUID', rows => { rows[1].id = 'fake' }],
  ]) it(`refuses binding with ${name}`, () => {
    const p = make(), rows = bindingRows(p)
    mutate(rows)
    assert.throws(() => bindCanonicalCatalogPlan(p, rows))
  })
  it('rejects identity delimiters and invalid grade', () => {
    const good = { programKey: 'meb-turkce', edition: '2019', grade: 8, examRef: 'LGS', officialCode: 'T.8.3.25' }
    for (const patch of [{ programKey: 'a:b' }, { edition: '2019@fake' }, { grade: 0 }, { grade: 8.2 }, { officialCode: '' }]) {
      assert.throws(() => canonicalIdentity({ ...good, ...patch }))
    }
  })
  it('preserves the official dotted Turkish İ in history codes', () => {
    assert.equal(canonicalIdentity({ programKey: 'meb-inkilap8', edition: '2018', grade: 8,
      examRef: 'LGS', officialCode: 'İTA.8.2.4' }), 'meb-inkilap8@2018:grade8:LGS:İTA.8.2.4')
  })
})
