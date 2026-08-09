import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

describe('TYT exam scope integrity', () => {
  it.each([
    'database/seed-tyt.js',
    'database/generate-kimya-biyoloji.mjs',
    'database/generate-fizik-roman.mjs',
    'database/generate-fizik-roman2.mjs',
    'database/generate-matematik-tyt.mjs',
  ])('%s stamps inserted questions as TYT', (path) => {
    expect(read(path)).toMatch(/exam_ref:\s*['"]TYT['"]/)
  })

  it('backfills only the explicitly TYT source and enforces future writes', () => {
    const sql = read('database/migrations/107_tyt_exam_scope_integrity.sql')

    expect(sql).toMatch(/WHERE exam_ref IS NULL\s+AND source = 'ai_gemini_tyt'/)
    expect(sql).toMatch(/source IS DISTINCT FROM 'ai_gemini_tyt'\s+OR exam_ref IS NOT DISTINCT FROM 'TYT'/)
    expect(sql).not.toMatch(/WHERE exam_ref IS NULL\s*;/)
  })
})
