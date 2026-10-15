import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LGS_OPTION_COUNT = 4

// Shared pure preflight. Never truncate options or coerce an answer.
export function validateLgsContent(content, { questionMinLength = 1, solutionMinLength = 1 } = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return 'content nesne değil'
  if (typeof content.question !== 'string' || content.question.trim().length < questionMinLength) return 'soru çok kısa'
  if (!Array.isArray(content.options) || content.options.length !== LGS_OPTION_COUNT) return 'LGS için tam 4 seçenek gerekli'
  if (content.options.some(o => typeof o !== 'string' || !o.trim())) return 'seçenekler boş olmayan metin olmalı'
  // Case is significant in Turkish spelling and genetics questions.
  if (new Set(content.options.map(o => o.trim())).size !== LGS_OPTION_COUNT) return 'birebir aynı seçenek'
  if (!Number.isInteger(content.answer) || content.answer < 0 || content.answer >= LGS_OPTION_COUNT) return 'answer 0-3 arası tamsayı olmalı'
  if (typeof content.solution !== 'string' || content.solution.trim().length < solutionMinLength) return 'solution eksik'
  return null
}

const ROW_KEYS = new Set(['game', 'category', 'subcategory', 'topic', 'difficulty', 'content', 'source', 'exam_ref', 'is_active'])

// Check the ENTIRE batch before connecting/inserting. Existing questions must
// use immutable revisions; this importer creates new inactive questions only.
export function validateLgsBatch(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ['paket boş olmayan bir dizi olmalı']
  const errors = []
  for (const [index, row] of rows.entries()) {
    const add = message => errors.push(`rows[${index}]: ${message}`)
    if (!row || typeof row !== 'object' || Array.isArray(row)) { add('satır nesne değil'); continue }
    if (Object.keys(row).some(key => !ROW_KEYS.has(key))) add('izin verilmeyen satır alanı; mevcut soru için revizyon akışını kullanın')
    if (typeof row.exam_ref !== 'string' || row.exam_ref.trim().toUpperCase() !== 'LGS') add('exam_ref LGS olmalı')
    for (const key of ['game', 'category', 'source']) {
      if (typeof row[key] !== 'string' || !row[key].trim()) add(`${key} gerekli`)
    }
    if (!Number.isInteger(row.difficulty) || row.difficulty < 1 || row.difficulty > 5) add('difficulty 1-5 arası tamsayı olmalı')
    if (row.is_active !== undefined && row.is_active !== false) add('yalnız is_active=false ile içe aktarılabilir')
    const contentError = validateLgsContent(row.content)
    if (contentError) add(contentError)
  }
  return errors
}

export function isMainModule(moduleUrl, entry = process.argv[1]) {
  return Boolean(entry) && resolve(entry) === fileURLToPath(moduleUrl)
}
