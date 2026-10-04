import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateLgsBatch, validateLgsContent } from '../lib/lgs-question-contract.mjs'
import { importLgsBatch, main } from '../import-lgs-batch.mjs'
import * as fen from '../generate-lgs-fen.mjs'
import * as math from '../generate-lgs-matematik.mjs'
import * as retry from '../generate-lgs-matematik-retry.mjs'

const content = () => ({ question: 'Bir sayının iki katı sekiz ise bu sayı kaçtır?', options: ['2', '3', '4', '5'], answer: 2, solution: 'Sayı sekizin yarısıdır, yani sonuç 4 olur.', type: 'regular' })
const row = () => ({ game: 'matematik', category: 'denklemler', source: 'ai_gemini_lgs', difficulty: 2, exam_ref: 'LGS', is_active: false, content: content() })
const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }

describe.each([['shared', { validate: validateLgsContent }], ['fen', fen], ['math', math], ['retry', retry]])('%s LGS preflight', (_name, generator) => {
  it.each([0, 1, 2, 3])('accepts four options and integer key %s', answer => {
    expect(generator.validate({ ...content(), answer })).toBeNull()
  })
  it.each([0, 1, 2, 3, 5, 6])('rejects %s options without truncating', count => {
    const q = { ...content(), options: Array.from({ length: count }, (_, i) => String(i)) }
    const before = structuredClone(q)
    expect(generator.validate(q)).toContain('4 seçenek')
    expect(q).toEqual(before)
  })
  it.each([-1, 4, 1.5, '2', null, undefined, NaN, Infinity])('rejects invalid key %s', answer => {
    expect(generator.validate({ ...content(), answer })).toContain('tamsayı')
  })
  it('rejects duplicate, blank, and non-string options', () => {
    for (const options of [['a', ' a ', 'b', 'c'], ['a', 'b', '', 'd'], ['a', 'b', 3, 'd']]) {
      expect(generator.validate({ ...content(), options })).not.toBeNull()
    }
  })
  it('preserves case-sensitive spelling differences', () => {
    expect(generator.validate({ ...content(), options: ['Ankara', 'ankara', 'ANKARA', 'AnkarA'] })).toBeNull()
  })
  it.each([null, [], undefined])('rejects malformed content %s without throwing', q => {
    expect(generator.validate(q)).toBeTypeOf('string')
  })
})

describe.each([['fen', fen], ['math', math], ['retry', retry]])('%s prompt', (_name, generator) => {
  it('requests A-D and gives a four-option JSON example', () => {
    expect(generator.SYSTEM_PROMPT).toContain('tam 4 seçenek')
    expect(generator.SYSTEM_PROMPT).not.toContain('A-E')
    expect(generator.SYSTEM_PROMPT).not.toContain('E seçenek')
    const jsonExample = generator.SYSTEM_PROMPT.match(/\[\{[\s\S]*?\}\]/)?.[0]
    expect(JSON.parse(jsonExample)[0].options).toHaveLength(4)
  })
})

describe('batch preflight and write boundary', () => {
  it('validates an inactive LGS batch without mutation', () => {
    const rows = [row()]
    const before = structuredClone(rows)
    expect(validateLgsBatch(rows)).toEqual([])
    expect(rows).toEqual(before)
  })
  it.each([null, {}, [], [null], [[]]])('rejects malformed batch %s', rows => {
    expect(validateLgsBatch(rows).length).toBeGreaterThan(0)
  })
  it('rejects activation, existing IDs, wrong exam and invalid difficulty', () => {
    for (const patch of [{ is_active: true }, { is_active: 'false' }, { id: 'existing-question' }, { published_revision_id: 'existing' }, { exam_ref: 'TYT' }, { difficulty: 1.5 }]) {
      expect(validateLgsBatch([{ ...row(), ...patch }]).length).toBeGreaterThan(0)
    }
  })
  it('checks every row before creating a client, even with apply', async () => {
    const clientFactory = vi.fn()
    const bad = row()
    bad.content.options.push('6')
    await expect(importLgsBatch([row(), bad], { apply: true, env, clientFactory })).rejects.toThrow('rows[1]')
    expect(clientFactory).not.toHaveBeenCalled()
  })
  it('dry run does not need credentials or create a client', async () => {
    const clientFactory = vi.fn()
    await expect(importLgsBatch([row()], { env: {}, clientFactory })).resolves.toEqual({ dryRun: true, questions: 1, inserted: 0 })
    expect(clientFactory).not.toHaveBeenCalled()
  })
  it('explicit apply sends one validated, inactive batch', async () => {
    const rows = [{ ...row(), exam_ref: ' lgs ', is_active: undefined }, row()]
    const before = structuredClone(rows)
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))
    const clientFactory = vi.fn(() => ({ from }))
    const result = await importLgsBatch(rows, { apply: true, env, clientFactory })
    expect(result).toEqual({ dryRun: false, questions: 2, inserted: 2, ids: ['a', 'b'] })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0].every(q => q.is_active === false && q.exam_ref === 'LGS')).toBe(true)
    expect(select).toHaveBeenCalledWith('id')
    expect(from).toHaveBeenCalledWith('questions')
    expect(rows).toEqual(before)
  })
  it('reports database errors instead of announcing success', async () => {
    const clientFactory = () => ({ from: () => ({ insert: () => ({ select: async () => ({ data: null, error: { message: 'denied' } }) }) }) })
    await expect(importLgsBatch([row()], { apply: true, env, clientFactory })).rejects.toThrow('DB hata: denied')
  })
  it('rejects an unknown command-line flag before reading a file', async () => {
    await expect(main(['does-not-exist.json', '--aply'])).rejects.toThrow('Kullanım')
  })
  it('all four entrypoints can be imported without credentials or network effects', () => {
    const files = ['generate-lgs-fen.mjs', 'generate-lgs-matematik.mjs', 'generate-lgs-matematik-retry.mjs', 'import-lgs-batch.mjs']
    const urls = files.map(name => new URL(`../${name}`, import.meta.url).href)
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch=()=>{throw new Error('Unexpected network')}; for (const url of ${JSON.stringify(urls)}) await import(url); console.log('IMPORT_SAFE')`], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, GOOGLE_GENERATIVE_AI_API_KEY: '', SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout.trim()).toBe('IMPORT_SAFE')
  })
})
