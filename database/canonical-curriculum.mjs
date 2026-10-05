// Pure adapter: no filesystem, database, network, or acceptance writes.
// Reviewed v2 IDs are retained as provenance; raw PDF hashes are NOT stable identity.
import { isDeepStrictEqual } from 'node:util'

const HASH = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const OFFICIAL_CODE = /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]+$/
const INNER_TYPES = new Set(['unit', 'topic', 'learning_area', 'language_skill'])

function assert(condition, message) {
  if (!condition) throw new Error(`Canonical curriculum: ${message}`)
}
function text(value, max, label) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `invalid ${label}`)
  return value
}
function uniqueMap(rows, field) {
  assert(Array.isArray(rows) && rows.length > 0, `empty ${field} collection`)
  const map = new Map()
  for (const row of rows) {
    text(row[field], 300, field)
    assert(!map.has(row[field]), `duplicate ${field}: ${row[field]}`)
    map.set(row[field], row)
  }
  return map
}

export function canonicalIdentity({ programKey, edition, grade, examRef, officialCode }) {
  assert(typeof programKey === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(programKey), 'invalid program key')
  for (const [label, value, max] of [['edition', edition, 40], ['exam', examRef, 20], ['official code', officialCode, 80]]) {
    text(value, max, label)
    assert((label === 'official code' ? OFFICIAL_CODE : TOKEN).test(value), `invalid ${label}`)
  }
  assert(/^[A-Za-z0-9_-]+$/.test(examRef), 'invalid exam')
  assert(Number.isInteger(grade) && grade >= 1 && grade <= 12, 'invalid grade')
  return `${programKey}@${edition}:grade${grade}:${examRef}:${officialCode}`
}

function sourceReceipt(node, packageSha256) {
  const s = node.source
  assert(s && HASH.test(s.responseSha256) && HASH.test(s.pageTextSha256), 'missing source hashes')
  assert(node.programVersion === `${node.program}@${s.responseSha256}`, 'source/version mismatch')
  assert(Number.isInteger(s.pdfPage) && s.pdfPage > 0, 'invalid source page')
  const url = new URL(text(s.url, 2000, 'source URL'))
  assert(url.protocol === 'https:' && !url.username && !url.password, 'invalid source URL')
  return {
    reviewedCanonicalId: node.canonicalId, url: s.url,
    responseSha256: s.responseSha256, pageTextSha256: s.pageTextSha256,
    pdfPage: s.pdfPage, extractor: text(s.extractor, 80, 'extractor'),
    extractorVersion: text(s.extractorVersion, 80, 'extractor version'), packageSha256,
  }
}

function officialPath(outcome, nodes, packageSha256) {
  const reverse = []
  const visited = new Set()
  let current = nodes.get(outcome.canonicalId)
  while (current) {
    assert(!visited.has(current.canonicalId), 'cyclic canonical path')
    visited.add(current.canonicalId)
    assert(visited.size <= 8, 'canonical path too deep')
    for (const key of ['program', 'programVersion', 'grade', 'examRef']) {
      assert(current[key] === outcome[key], `path ${key} mismatch`)
    }
    assert(current.titleIsOfficial === true && current.isInternalBridge !== true, 'non-official canonical path')
    sourceReceipt(current, packageSha256)
    reverse.push({ nodeType: current.nodeType, officialCode: current.officialCode ?? null,
      title: text(current.title, 400, 'path title') })
    if (current.parentId === null) break
    assert(nodes.has(current.parentId), 'missing canonical parent')
    current = nodes.get(current.parentId)
  }
  const path = reverse.reverse()
  assert(path.length >= 2 && path[0].nodeType === 'course'
    && path.at(-1).nodeType === 'outcome', 'invalid canonical path endpoints')
  assert(path.slice(1, -1).every(n => INNER_TYPES.has(n.nodeType)), 'invalid canonical path type')
  return path
}

export function buildCanonicalCatalogPlan({ catalog, projection, programEditions, packageSha256 }) {
  assert(HASH.test(packageSha256), 'invalid package hash')
  assert(catalog?.version === 'lgs-catalog-candidates@2'
    && projection?.version === 'lgs-catalog-storage-projection@1', 'unsupported package version')
  for (const input of [catalog, projection]) {
    assert(input.candidateOnly === true && input.publicationAuthorized === false
      && input.catalogAcceptance === false, 'not an unaccepted candidate package')
  }
  assert(projection.importAuthorized === false && projection.requiresCanonicalConsumerBeforeImport === true,
    'storage import boundary missing')
  assert(catalog.taxonomyVersion === projection.taxonomyVersion, 'taxonomy mismatch')
  text(catalog.taxonomyVersion, 80, 'taxonomy')
  const nodes = uniqueMap(catalog.nodes, 'canonicalId')
  const outcomes = uniqueMap(catalog.outcomes, 'canonicalId')
  const aliases = uniqueMap(projection.outcomes, 'code')
  const projectionNodes = uniqueMap(projection.nodes, 'code')
  const rows = []
  const bindings = []
  const stableIds = new Set()
  const usedAliases = new Set()
  for (const outcome of outcomes.values()) {
    const node = nodes.get(outcome.canonicalId)
    assert(node && node.nodeType === 'outcome', 'missing canonical outcome node')
    for (const field of ['program', 'programVersion', 'grade', 'examRef', 'officialCode', 'title', 'parentId', 'source']) {
      assert(isDeepStrictEqual(node[field], outcome[field]), `outcome/node ${field} mismatch`)
    }
    const edition = programEditions?.[outcome.program]
    assert(edition, `explicit program edition required for ${outcome.program}`)
    const id = canonicalIdentity({ ...edition, grade: outcome.grade,
      examRef: outcome.examRef, officialCode: outcome.officialCode })
    assert(!stableIds.has(id), 'duplicate edition-based identity')
    stableIds.add(id)
    const group = [...aliases.values()].filter(a => a.canonicalOutcomeId === outcome.canonicalId)
    assert(group.length > 0, 'canonical outcome has no alias')
    const game = text(group[0].game, 20, 'game')
    for (const alias of group) {
      const leaf = projectionNodes.get(alias.nodeCode)
      assert(alias.isAccepted === false && alias.isInternalAlias === true, 'invalid alias acceptance boundary')
      assert(alias.game === game && alias.examRef === outcome.examRef && alias.program === outcome.program
        && alias.taxonomyVersion === catalog.taxonomyVersion && alias.title === outcome.title
        && alias.officialCode === outcome.officialCode, 'alias scope/content mismatch')
      assert(leaf && leaf.nodeType === 'outcome' && leaf.canonicalId === outcome.canonicalId
        && leaf.game === game && leaf.examRef === outcome.examRef && leaf.category === alias.category
        && leaf.taxonomyVersion === catalog.taxonomyVersion && leaf.isInternalBridge !== true,
      'projection leaf mismatch')
      text(alias.category, 30, 'category')
      text(alias.code, 40, 'alias code')
      usedAliases.add(alias.code)
      bindings.push({ outcomeCode: alias.code, canonicalId: id, game,
        category: alias.category, examRef: outcome.examRef,
        taxonomyVersion: catalog.taxonomyVersion, packageSha256 })
    }
    rows.push({ canonical_id: id, program_key: edition.programKey, program_edition: edition.edition,
      grade: outcome.grade, exam_ref: outcome.examRef, game, official_code: outcome.officialCode,
      title: text(outcome.title, 400, 'title'), official_path: officialPath(outcome, nodes, packageSha256),
      source_receipt: sourceReceipt(outcome, packageSha256) })
  }
  assert(usedAliases.size === aliases.size, 'alias targets an unknown canonical outcome')
  assert([...nodes.values()].filter(n => n.nodeType === 'outcome').length === outcomes.size, 'unlisted outcome node')
  return {
    version: 'canonical-curriculum-plan@1', candidateOnly: true, importAuthorized: false,
    publicationAuthorized: false, curriculumAcceptance: false, learnerReady: false, databaseWrites: 0,
    taxonomyVersion: catalog.taxonomyVersion, packageSha256,
    canonicalOutcomes: rows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id, 'en')),
    aliasBindings: bindings.sort((a, b) => a.outcomeCode.localeCompare(b.outcomeCode, 'en')),
  }
}

// Binding is explicit and all-or-nothing; never infer a match from similar titles/codes.
// Call only with freshly read, complete legacy rows. This still does not authorize import.
export function bindCanonicalCatalogPlan(plan, legacyRows) {
  assert(plan?.version === 'canonical-curriculum-plan@1' && plan.importAuthorized === false, 'invalid plan')
  const legacy = uniqueMap(legacyRows, 'code')
  const canonical = uniqueMap(plan.canonicalOutcomes, 'canonical_id')
  const ids = new Set()
  assert(legacy.size === plan.aliasBindings.length, 'legacy alias count mismatch')
  return plan.aliasBindings.map(binding => {
    const row = legacy.get(binding.outcomeCode)
    const target = canonical.get(binding.canonicalId)
    assert(row && UUID.test(row.id), `unresolved alias ${binding.outcomeCode}`)
    assert(!ids.has(row.id), 'duplicate legacy UUID')
    ids.add(row.id)
    assert(target && row.title === target.title && target.game === binding.game && target.exam_ref === binding.examRef,
      'legacy binding definition mismatch')
    assert(row.game === binding.game && row.category === binding.category
      && row.exam_ref === binding.examRef && row.taxonomy_version === binding.taxonomyVersion,
    'legacy binding scope mismatch')
    return { outcome_id: row.id, canonical_id: binding.canonicalId,
      taxonomy_version: binding.taxonomyVersion, package_sha256: binding.packageSha256 }
  })
}
