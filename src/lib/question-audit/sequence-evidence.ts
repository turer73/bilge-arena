import { createHash } from 'node:crypto'

/** One allowlisted grammar, NOT a general Turkish/DNA question solver. */
export const SEQUENCE_EVIDENCE_VERSION = 'dna-position@1' as const
const grammar = /^DNA'nın aynı zincir bölümüne ait iki dizi aynı yönde yazılmıştır: önce ([ACGT]{1,128}), sonra ([ACGT]{1,128})\. Yerleri soldan 1 ile numaralandırırsak, farklı harfin bulunduğu yer kaçtır\? Ekleme veya silme olmadığı belirtilmiştir\.$/u

export interface SequenceInput {
  questionText: string
  passage: string | null
}

export interface SequenceEvidence {
  version: typeof SEQUENCE_EVIDENCE_VERSION
  /** Local input hash, NOT the database revision hash. No author/key input. */
  inputSha256: string
  scope: 'same-direction-equal-length-single-substitution-left-one-based'
  before: string
  after: string
  positions: Array<{ position: number; before: string; after: string; equal: boolean }>
  changedPosition: number
}

export function sequenceEvidence(input: SequenceInput): SequenceEvidence | null {
  // Do not ignore a passage which could change direction/numbering assumptions.
  if (input.passage !== null) return null
  const match = grammar.exec(input.questionText)
  // JS $ accepts a terminal newline: the allowlist deliberately does not.
  if (!match || match[0] !== input.questionText) return null
  const [, before, after] = match
  if (before.length !== after.length) return null
  const positions = [...before].map((letter, index) => ({
    position: index + 1, before: letter, after: after[index], equal: letter === after[index],
  }))
  const changed = positions.filter((p) => !p.equal)
  if (changed.length !== 1) return null
  return {
    version: SEQUENCE_EVIDENCE_VERSION,
    inputSha256: createHash('sha256').update(JSON.stringify({
      questionText: input.questionText, passage: input.passage,
    })).digest('hex'),
    scope: 'same-direction-equal-length-single-substitution-left-one-based',
    before, after, positions, changedPosition: changed[0].position,
  }
}

/** For replay/sidecars: reject changed input, hash, counts or unknown fields. */
export function verifySequenceEvidence(input: SequenceInput, evidence: unknown): boolean {
  const expected = sequenceEvidence(input)
  if (!expected || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return false
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  return canonical(evidence) === canonical(expected)
}
