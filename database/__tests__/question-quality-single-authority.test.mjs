import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const legacyJudge = fileURLToPath(new URL('../audit-llm-judge.mjs', import.meta.url))
const legacyImporter = fileURLToPath(new URL('../import-json-to-db.mjs', import.meta.url))

describe('question quality single authority', () => {
  it('exposes only the calibrated audit and benchmark commands', () => {
    expect(packageJson.scripts['audit:calibrate']).toBe('node database/run-question-audit.mjs')
    expect(packageJson.scripts['audit:benchmark']).toBe('node database/run-question-benchmark.mjs')
    expect(packageJson.scripts['audit:judge']).toBeUndefined()
    expect(packageJson.scripts['audit:judge:eval']).toBeUndefined()
  })

  it.each([
    ['legacy LLM judge', legacyJudge],
    ['direct JSON importer', legacyImporter],
  ])('%s fails closed without network or database work', (_label, script) => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 5_000 })
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/DEPRECATED/)
  })
})
