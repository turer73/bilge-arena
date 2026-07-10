/**
 * llm-client unit tests — parseJsonArray wrapper-unwrap (Codex#266-P2 regresyon kilidi).
 * Çalıştırma: npx vitest --config vitest.database.config.ts database/__tests__/llm-client.test.mjs
 */

import { describe, it, expect } from 'vitest'

const { parseJsonArray } = await import('../llm-client.mjs')

describe('parseJsonArray', () => {
  it('düz dizi → aynen döner', () => {
    const r = parseJsonArray(JSON.stringify([{ soru: 'a' }, { soru: 'b' }]))
    expect(Array.isArray(r)).toBe(true)
    expect(r).toHaveLength(2)
  })

  it('wrapper obje {"questions":[...]} → içteki dizi çıkarılır (P2 fix)', () => {
    const r = parseJsonArray(JSON.stringify({ questions: [{ soru: 'a' }] }))
    expect(Array.isArray(r)).toBe(true)
    expect(r[0].soru).toBe('a')
  })

  it('wrapper obje {"sorular":[...]} (farklı anahtar) → dizi çıkarılır', () => {
    const r = parseJsonArray(JSON.stringify({ sorular: [{ x: 1 }, { x: 2 }] }))
    expect(Array.isArray(r)).toBe(true)
    expect(r).toHaveLength(2)
  })

  it('markdown-sarılı dizi → regex-fallback ile çıkarılır', () => {
    const r = parseJsonArray('```json\n[{"a":1}]\n```')
    expect(Array.isArray(r)).toBe(true)
    expect(r[0].a).toBe(1)
  })

  it('dizi içermeyen obje → null (yanlış-array döndürme)', () => {
    const r = parseJsonArray(JSON.stringify({ foo: 'bar', n: 3 }))
    expect(r).toBe(null)
  })

  it('boş/çöp girdi → null', () => {
    expect(parseJsonArray('')).toBe(null)
    expect(parseJsonArray('not json')).toBe(null)
  })

  it('trailing-comma toleransı (regex-fallback)', () => {
    const r = parseJsonArray('[{"a":1},]')
    expect(Array.isArray(r)).toBe(true)
    expect(r).toHaveLength(1)
  })
})
