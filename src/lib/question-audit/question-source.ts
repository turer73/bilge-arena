/**
 * DB satiri -> QuestionDraft donusumu + LLM ONCESI deterministik kapi.
 *
 * NEDEN KAPI BURADA:
 *   Gecersiz bir satiri uc ajana gondermek hem para yakar hem kalibrasyon
 *   verisini kirletir: cevap indeksi bozuk bir soruda "kor cozucu anahtarla
 *   uyusmadi" sonucu cikar ve bu, MODEL hatasi gibi gorunur. Yapisal kusurlar
 *   olculmeden ONCE ayiklanmali.
 *
 * NEDEN GOVERNANCE'A BAGLI DEGIL:
 *   QuestionDraft `revisionId` ve `contentSha256` istiyor. Migration 106 bunlari
 *   uretiyor AMA content governance'in canlida acik olup olmadigi dogrulanmadi
 *   (13 Agustos canli denetiminde ozellik matrisinde yok). Kalibrasyon kosusunu
 *   o belirsizlige baglamamak icin hash BURADA hesaplaniyor ve revisionId yoksa
 *   questionId'ye dusuyor. Governance acildiginda gercek revisionId gecirilir;
 *   sozlesme degismez.
 */

import { createHash } from 'node:crypto'
import type { QuestionDraft } from './types'

/** `questions` tablosundan okunan ham satir (ilgili alanlar). */
export interface QuestionRow {
  id: string
  game: string
  category: string
  subcategory?: string | null
  topic?: string | null
  exam_ref?: string | null
  difficulty?: number | null
  content: Record<string, unknown> | null
  published_revision_id?: string | null
  /** Governance revizyonundaki Postgres-kanonik hash; varsa yeniden hesaplanmaz. */
  content_sha256?: string | null
}

/**
 * Sik metnini sayiya cevirir; cevrilemezse null.
 *
 * NEDEN VAR: birebir metin karsilastirmasi "1/5" ile "4/20"yi farkli gorur, ama
 * ogrenci icin ikisi de DOGRU cevaptir. Canli bankada bu 6 soruda vardi ve
 * dordunde esdeger sikkin biri isaretli anahtardi — yani sorunun IKI dogru
 * cevabi vardi ve esdeger kesri isaretleyen ogrenci haksiz yere yanlis
 * sayiliyordu. Iki tam banka LLM kosusu (22135 + 22088 cagri, iki FARKLI
 * saglayici) bunlarin hicbirini bulamadi; bu kontrol sifir maliyetle buluyor.
 *
 * BILINCLI OLARAK DAR: yanlis-pozitif saglam bir soruyu denetim disi birakir,
 * o yuzden supheli her bicim null doner:
 *   - virgul iceren        -> koordinat/ikili: "(-3,-7)"
 *   - iki rakam arasi tire -> aralik/dizilim: "1914-1918", "2-8-8-1"
 *   - harf iceren          -> birimli deger: "5 mol"
 * Turkce binlik ayraci ozel ele alinir: "100.000" JS ondaligi olarak 100 okunur
 * ve "100" sikkiyla sahte esitlik uretirdi (ilk canli taramada tam bu oldu).
 */
function optionNumericValue(raw: string): number | null {
  const text = raw.trim()
  if (!text || text.length > 40) return null
  if (text.includes(',')) return null
  if (/\d\s*[-–]\s*\d/.test(text)) return null
  if (/[a-zA-Z]/.test(text.replace(/sqrt|pi/gi, ''))) return null
  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''))

  let e = text.replace(/\s+/g, '').replace(/√/g, 'sqrt').replace(/π/g, '(pi)')
  if (!/^-?[0-9+*/().sqrtpi^]+$/.test(e)) return null
  if (!/\d/.test(e)) return null
  // ARA BELIRTEC SART: dogrudan 'Math.sqrt(' yazmak ikinci gecisin kendi
  // ciktisini yeniden yakalamasina yol acar ('Math.sqrt(' icinde 'sqrt(' vardir)
  // ve 'Math.Math.sqrt(' uretir. Once notasyonu tekillestir, en sonda cevir.
  e = e.replace(/sqrt\(/g, 'SQRT(').replace(/sqrt(\d+(?:\.\d+)?)/g, 'SQRT($1)')
  e = e.replace(/(\d)\(/g, '$1*(').replace(/\)(\d)/g, ')*$1')
  e = e.replace(/(\d)SQRT/g, '$1*SQRT').replace(/\)SQRT/g, ')*SQRT')
  e = e.replace(/SQRT/g, 'Math.sqrt')
  e = e.replace(/\(pi\)/g, 'Math.PI').replace(/\^/g, '**')
  try {
    const v = Function('"use strict";return(' + e + ')')() as unknown
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/**
 * DENETLENEMEZ kusurlar. Bunlar LLM'e gonderilmez: cevap indeksi bozuk bir
 * soruda "kor cozucu anahtarla uyusmadi" cikar ve MODEL hatasi gibi gorunur.
 */
export type RejectReason =
  | 'content_missing'
  | 'question_text_missing'
  | 'options_not_array'
  | 'option_count_invalid'
  | 'option_empty'
  | 'option_duplicate'
  | 'option_value_equivalent'
  | 'answer_not_integer'
  | 'answer_out_of_range'
  | 'option_count_exam_mismatch'

/**
 * METADATA kusurlari — soru pekala denetlenebilir, kusur iceriginde degil
 * etiketinde. Reddetmek yanlis olur: canli DB'de exam_ref='LGS' etiketli 105
 * soru 5 sikli (LGS 4 siklidir). Bunlari elemek bankanin ~%10'unu olcum disi
 * birakirdi; oysa sorunun kendisi cozulebilir durumda. Rapora yazilir, denetim
 * devam eder.
 */
export type DraftWarning = 'option_count_exam_mismatch'

export interface RejectedRow {
  ok: false
  questionId: string
  reason: RejectReason
  detail: string
}

export type DraftResult =
  | { ok: true; draft: QuestionDraft; warnings: Array<{ code: DraftWarning; detail: string }> }
  | RejectedRow

/**
 * Sinav referansindan beklenen sik sayisi. Bilinmiyorsa null.
 * Canli DB'de gorulen degerler: TYT, LGS, AYT-SAY, AYT-EA, AYT-SOZ, NULL.
 */
export function expectedOptionCount(examRef: string | null | undefined): number | null {
  if (!examRef) return null
  const ref = examRef.trim().toUpperCase()
  if (ref === 'LGS') return 4
  if (ref === 'TYT' || ref === 'YKS' || ref === 'AYT' || ref.startsWith('AYT-')) return 5
  return null
}

/**
 * Anahtar sirasi sabitlenmis JSON. Hash'in tekrarlanabilir olmasi icin sart:
 * JSON.stringify anahtar sirasini nesne olusum sirasindan alir, ayni icerik
 * farkli sirayla gelirse farkli hash cikar ve seed/permutasyon degisir.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k])
    return out
  }
  return value
}

export function contentHash(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex')
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export function toDraft(row: QuestionRow, policy: { strictExamOptionCount?: boolean } = {}): DraftResult {
  const reject = (reason: RejectReason, detail: string): RejectedRow => ({
    ok: false,
    questionId: row.id,
    reason,
    detail,
  })

  const c = row.content
  if (!c || typeof c !== 'object') return reject('content_missing', 'content bos veya nesne degil')

  // wordquest sorulari soru kokunu `sentence` alaninda tutuyor.
  const questionText = asString(c.question ?? c.sentence).trim()
  if (!questionText) return reject('question_text_missing', 'question/sentence bos')

  if (!Array.isArray(c.options)) return reject('options_not_array', `options tipi: ${typeof c.options}`)
  const options = c.options.map(asString)

  if (options.length < 2 || options.length > 5) {
    return reject('option_count_invalid', `${options.length} secenek`)
  }
  const emptyAt = options.findIndex((o) => !o.trim())
  if (emptyAt >= 0) return reject('option_empty', `idx${emptyAt} bos`)

  // EXACT dup (case-sensitive). casefold KULLANILMAZ: yazim/buyuk-harf ve
  // genotip ("TT x tt" vs "tt x tt") sorulari tam bu farki test eder —
  // mevcut validator'da da bu karar boyle (validate-question-bank.mjs).
  const trimmed = options.map((o) => o.trim())
  const dupIndex = trimmed.findIndex((o, i) => trimmed.indexOf(o) !== i)
  if (dupIndex >= 0) return reject('option_duplicate', `birebir ayni sik: ${trimmed[dupIndex]}`)

  // Metni farkli ama DEGERI ayni siklar (or. "1/5" ve "4/20", ya da
  // 21/(2√5) ve 21√5/10). Yukaridaki EXACT kontrol bunlari goremez.
  const values = trimmed.map(optionNumericValue)
  for (let i = 0; i < values.length; i++) {
    const vi = values[i]
    if (vi === null) continue
    for (let j = 0; j < i; j++) {
      const vj = values[j]
      if (vj === null) continue
      const scale = Math.max(Math.abs(vi), Math.abs(vj), 1e-9)
      if (Math.abs(vi - vj) / scale < 1e-9) {
        return reject(
          'option_value_equivalent',
          `idx${j} "${trimmed[j]}" ile idx${i} "${trimmed[i]}" ayni deger (${vi})`,
        )
      }
    }
  }

  const answer = c.answer ?? c.correct
  if (!Number.isInteger(answer)) return reject('answer_not_integer', `answer=${JSON.stringify(answer)}`)
  const markedAnswerIndex = answer as number
  if (markedAnswerIndex < 0 || markedAnswerIndex >= options.length) {
    return reject('answer_out_of_range', `answer=${markedAnswerIndex} / ${options.length} sik`)
  }

  // Sinav-sik uyumu UYARIDIR, red degil. exam_ref bilinmiyorsa hic bakilmaz —
  // uydurma bir varsayimla dogru soruyu isaretlemekten iyidir.
  const warnings: Array<{ code: DraftWarning; detail: string }> = []
  const expected = expectedOptionCount(row.exam_ref)
  if (expected !== null && options.length !== expected) {
    if (policy.strictExamOptionCount) {
      return reject('option_count_exam_mismatch', `${row.exam_ref}: ${options.length} sik, ${expected} beklenir`)
    }
    warnings.push({
      code: 'option_count_exam_mismatch',
      detail: `${row.exam_ref}: ${options.length} sik, ${expected} beklenir`,
    })
  }

  const solution = asString(c.solution ?? c.explanation).trim()
  const passage = asString(c.passage).trim()

  return {
    ok: true,
    warnings,
    draft: {
      questionId: row.id,
      revisionId: row.published_revision_id ?? row.id,
      contentSha256: row.content_sha256 ?? contentHash(c),
      examRef: row.exam_ref?.trim() || inferExamRef(row.game),
      subject: row.category || row.game,
      topic: row.topic ?? row.subcategory ?? null,
      questionText,
      passage: passage || null,
      options,
      markedAnswerIndex,
      solutionText: solution || null,
    },
  }
}

/** exam_ref bos olan eski kayitlar icin makul varsayilan. */
function inferExamRef(game: string): string {
  return game === 'wordquest' ? 'YKS' : 'TYT'
}

export interface PartitionResult {
  drafts: QuestionDraft[]
  rejected: RejectedRow[]
  byReason: Record<string, number>
  /** Denetime GIREN ama metadata kusuru tasiyan sorular. */
  warned: Array<{ questionId: string; code: DraftWarning; detail: string }>
  byWarning: Record<string, number>
}

/** Satir kumesini denetlenebilir draft'lar ve denetlenemez satirlar olarak ayirir. */
export function partitionRows(
  rows: readonly QuestionRow[],
  policy: { strictExamOptionCount?: boolean } = {},
): PartitionResult {
  const drafts: QuestionDraft[] = []
  const rejected: RejectedRow[] = []
  const byReason: Record<string, number> = {}
  const warned: PartitionResult['warned'] = []
  const byWarning: Record<string, number> = {}
  for (const row of rows) {
    const r = toDraft(row, policy)
    if (r.ok) {
      drafts.push(r.draft)
      for (const w of r.warnings) {
        warned.push({ questionId: r.draft.questionId, code: w.code, detail: w.detail })
        byWarning[w.code] = (byWarning[w.code] ?? 0) + 1
      }
    } else {
      rejected.push(r)
      byReason[r.reason] = (byReason[r.reason] ?? 0) + 1
    }
  }
  return { drafts, rejected, byReason, warned, byWarning }
}
