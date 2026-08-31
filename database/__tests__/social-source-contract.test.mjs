import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTytSocialQuestion } from '../osym-reference/lib/tyt-social-exam-roles.mjs'

const databaseRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const parserSql = readFileSync(join(databaseRoot, 'osym-reference', 'scripts', 'parse-stirling.mjs'), 'utf8')
const generatorSql = readFileSync(join(databaseRoot, 'run-generation.mjs'), 'utf8')
const templateSql = readFileSync(join(databaseRoot, 'osym-reference', 'scripts', 'build-all-templates.mjs'), 'utf8')
const legacyTemplateSql = readFileSync(join(databaseRoot, 'osym-reference', 'scripts', 'build-templates.mjs'), 'utf8')

describe('TYT Social source contracts', () => {
  it('separates content taxonomy from the two candidate-dependent booklet branches', () => {
    expect(classifyTytSocialQuestion(1)).toEqual({ category: 'tarih', examRole: 'common_history' })
    expect(classifyTytSocialQuestion(6)).toEqual({ category: 'cografya', examRole: 'common_geography' })
    expect(classifyTytSocialQuestion(11)).toEqual({ category: 'felsefe', examRole: 'common_philosophy' })
    expect(classifyTytSocialQuestion(16)).toEqual({ category: 'din_kulturu', examRole: 'standard_religion' })
    expect(classifyTytSocialQuestion(20)).toEqual({ category: 'din_kulturu', examRole: 'standard_religion' })
    expect(classifyTytSocialQuestion(21)).toEqual({ category: 'felsefe', examRole: 'alternate_philosophy' })
    expect(classifyTytSocialQuestion(25)).toEqual({ category: 'felsefe', examRole: 'alternate_philosophy' })
    expect(classifyTytSocialQuestion(0)).toBeNull()
    expect(classifyTytSocialQuestion(26)).toBeNull()
    expect(parserSql).toContain('classifyTytSocialQuestion')
    expect(parserSql).not.toMatch(/16:\s*'din'/)
  })

  it('keeps CLI and admin generation coverage aligned for din_kulturu', () => {
    expect(generatorSql).toMatch(/sosyal:\s*\{[\s\S]*din_kulturu:\s*\[/)
    expect(generatorSql).toMatch(/din_kulturu:\s*'Din Kültürü ve Ahlak Bilgisi'/)
    expect(generatorSql).toContain('Ahlak ve Değerler')
    expect(generatorSql).toContain('Vahiy ve Akıl')
  })

  it('marks the reference template as partial and never emits the din alias', () => {
    expect(templateSql).toContain('tarih|cografya|felsefe|sosyoloji|din_kulturu')
    expect(templateSql).not.toContain('tarih|cografya|felsefe|sosyoloji|din\'')
    for (const sql of [templateSql, legacyTemplateSql]) {
      expect(sql).toMatch(/verified_example_categories:\s*\['tarih', 'felsefe'\]/)
      expect(sql).toMatch(/missing_verified_example_categories:\s*\['cografya', 'sosyoloji', 'din_kulturu'\]/)
    }
  })
})
