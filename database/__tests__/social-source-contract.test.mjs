import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTytSocialQuestion } from '../osym-reference/lib/tyt-social-exam-roles.mjs'

const databaseRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const parserSql = readFileSync(join(databaseRoot, 'osym-reference', 'scripts', 'parse-stirling.mjs'), 'utf8')
const genericParserSql = readFileSync(join(databaseRoot, 'osym-reference', 'scripts', 'parse-tyt.mjs'), 'utf8')
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
    expect(genericParserSql).toContain('classifyTytSocialQuestion')
    expect(genericParserSql).toContain('question.exam_role = classification.examRole')
    expect(genericParserSql).toContain('question.subcategory = classification.category')
    expect(parserSql).not.toMatch(/16:\s*'din'/)
    expect(genericParserSql).not.toMatch(/16:\s*'din'/)
  })

  it('classifies every official 25-position Social booklet without gaps or aliases', () => {
    const classified = Array.from({ length: 25 }, (_, index) =>
      classifyTytSocialQuestion(index + 1))
    expect(classified.every(Boolean)).toBe(true)
    expect(classified.map((entry) => entry?.examRole)).toEqual([
      ...Array(5).fill('common_history'),
      ...Array(5).fill('common_geography'),
      ...Array(5).fill('common_philosophy'),
      ...Array(5).fill('standard_religion'),
      ...Array(5).fill('alternate_philosophy'),
    ])
    expect(classified.filter((entry) => entry?.category === 'din_kulturu')).toHaveLength(5)
    expect(classified.some((entry) => entry?.category === 'din')).toBe(false)
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
