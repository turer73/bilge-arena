import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const sql = read('database/migrations/109_canonical_category_remap.sql')
// Comments mention old taxonomy values by design; contract checks only executable SQL.
const code = sql.replace(/--[^\n]*/g, '')
const games = read('src/lib/constants/games.ts')

describe('109 canonical category remap', () => {
  it('backs up and locks the complete 108/109 repair scope before mutation', () => {
    const backup = code.indexOf('INSERT INTO public._backup_questions_taxonomy_109_20260810')
    const firstUpdate = code.indexOf('UPDATE public.questions')
    expect(backup).toBeGreaterThan(-1)
    expect(firstUpdate).toBeGreaterThan(backup)
    expect(code).toMatch(/LEFT JOIN public\._backup_questions_taxonomy_20260810 b108 ON b108\.id = q\.id/)
    expect(code).toMatch(/ORDER BY q\.id\s+FOR UPDATE OF q/)
  })

  it('keeps the backup table private even from service_role direct access', () => {
    expect(code).toMatch(/ALTER TABLE public\._backup_questions_taxonomy_109_20260810 ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(/REVOKE ALL ON public\._backup_questions_taxonomy_109_20260810\s+FROM PUBLIC, anon, authenticated, service_role;/)
  })

  it('uses the transaction-local governance guard for controlled metadata repair', () => {
    expect(code).toMatch(/set_config\('app\.content_governance_publish', 'on', true\)/)
  })

  it('splits algebra by exam and LGS topic', () => {
    expect(code).toMatch(/SET category = 'fonksiyonlar'[\s\S]*?exam_ref IN \('AYT-SAY', 'AYT-EA'\)/)
    expect(code).toMatch(/SET category = 'problemler'[\s\S]*?'Oran ve Orantı Problemleri', 'Yüzde, Faiz ve Kar-Zarar'/)
    expect(code).toMatch(/SET category = 'denklemler'[\s\S]*?'Denklemler ve Eşitsizlikler', 'İki Bilinmeyenli Denklem', 'Örüntü ve Denklem'/)
  })

  it('folds legacy taxonomy values into their canonical categories', () => {
    expect(code).toMatch(/SET category = 'olasilik'\s+WHERE game = 'matematik' AND category = 'veri';/)
    expect(code).toMatch(/SET category = 'tarih'\s+WHERE game = 'sosyal' AND category = 'inkılap_tarihi';/)
    expect(code).toMatch(/SET category = 'sosyoloji'\s+WHERE game = 'sosyal' AND category = 'vatandaşlık';/)
  })

  it('does not mutate din_kulturu questions', () => {
    const questionUpdates = [...code.matchAll(/UPDATE public\.questions(?:\s+q)?[\s\S]*?;/g)].map((match) => match[0])
    expect(questionUpdates.some((statement) => /category\s*=\s*'din_kulturu'/.test(statement))).toBe(false)
  })

  it('publishes immutable metadata revisions and carries their evidence', () => {
    expect(code).toMatch(/CREATE TEMP TABLE taxonomy_revision_targets ON COMMIT DROP AS/)
    expect(code).toMatch(/INSERT INTO public\.question_content_revisions[\s\S]*?r\.content,[\s\S]*?r\.content_sha256,[\s\S]*?'legacy_import'/)
    expect(code).toMatch(/INSERT INTO public\.question_revision_sources[\s\S]*?t\.new_revision_id/)
    expect(code).toMatch(/INSERT INTO public\.question_revision_outcomes[\s\S]*?t\.new_revision_id/)
    expect(code).toMatch(/UPDATE public\.question_content_revisions old_revision\s+SET status = 'superseded'/)
    expect(code).toMatch(/UPDATE public\.questions q\s+SET published_revision_id = t\.new_revision_id/)
    expect(code).toMatch(/INSERT INTO public\.question_governance_events/)
  })

  it('fails closed on noncanonical values or question/revision drift', () => {
    expect(code).toMatch(/category IS NULL OR category NOT IN\s+\('sayilar','problemler','geometri','denklemler','fonksiyonlar','olasilik'\)/)
    expect(code).toMatch(/questions ile yayımlanmış revision metadata uyumsuz/)
    expect(code).toMatch(/q\.game, q\.category, q\.subcategory, q\.topic, q\.difficulty,[\s\S]*?r\.game, r\.category, r\.subcategory, r\.topic, r\.difficulty/)
  })

  it('keeps the SQL social guard aligned with games.ts', () => {
    const sosyal = games.match(/slug: 'sosyal'[\s\S]*?categories: \[([^\]]+)\]/)
    expect(sosyal).not.toBeNull()
    const appCats = [...sosyal[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(appCats).toContain('din_kulturu')

    const guard = code.match(/game = 'sosyal' AND \(\s*category IS NULL OR category NOT IN\s*\(([^)]+)\)/)
    expect(guard).not.toBeNull()
    const sqlCats = [...guard[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect([...sqlCats].sort()).toEqual([...appCats].sort())
  })
})
