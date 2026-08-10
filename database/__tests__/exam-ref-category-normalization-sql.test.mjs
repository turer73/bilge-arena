import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const sql = read('database/migrations/108_exam_ref_and_category_normalization.sql')
/** Yorum satirlari ertelenmis kategorilerin adini icerir; kapsam kontrolu koda bakmali. */
const code = sql.replace(/--[^\n]*/g, '')

describe('108 exam_ref ve kategori normalizasyonu', () => {
  it('yalnizca YKS-TYT degerini TYT yapar, kor NULL backfill yapmaz', () => {
    expect(code).toMatch(/UPDATE public\.questions\s+SET exam_ref = 'TYT'\s+WHERE exam_ref = 'YKS-TYT';/)
    expect(code).not.toMatch(/WHERE exam_ref IS NULL/)
  })

  it('diakritikli kategori duzeltmesini sosyal oyunuyla sinirlar', () => {
    expect(code).toMatch(/SET category = 'cografya'\s+WHERE game = 'sosyal' AND category = 'coğrafya';/)
  })

  it('guncellemeden once eski degerleri yedekler', () => {
    const backup = code.indexOf('INSERT INTO public._backup_questions_taxonomy_20260810')
    const firstUpdate = code.indexOf('UPDATE public.questions')
    expect(backup).toBeGreaterThan(-1)
    expect(firstUpdate).toBeGreaterThan(backup)
  })

  it('yedek tablosunu istemci rollerine acmaz', () => {
    expect(code).toMatch(/REVOKE ALL ON public\._backup_questions_taxonomy_20260810 FROM PUBLIC, anon, authenticated;/)
  })

  it('taksonomi kararina baglı kategorilere dokunmaz', () => {
    for (const deferred of ['cebir', 'veri', 'din_kulturu', 'inkılap_tarihi', 'vatandaşlık']) {
      expect(code).not.toContain(`'${deferred}'`)
    }
  })

  it('gecerli exam_ref kumesini kisitla zorlar ve wordquest NULL yolunu korur', () => {
    expect(code).toMatch(/CONSTRAINT questions_exam_ref_allowed_check/)
    expect(code).toMatch(/exam_ref IS NULL\s+OR exam_ref IN \('TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT'\)/)
    expect(code).toMatch(/VALIDATE CONSTRAINT questions_exam_ref_allowed_check/)
  })

  it('kisit listesi uygulama sozlesmesindeki sinavlarla ortusur', () => {
    const contract = read('src/lib/paper-mode/server-contract.ts')
    const enumLine = contract.match(/examRefSchema = z\.enum\(\[([^\]]+)\]\)/)
    expect(enumLine).not.toBeNull()
    const appExams = [...enumLine[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(appExams.length).toBeGreaterThan(0)
    for (const exam of appExams) expect(code).toContain(`'${exam}'`)
  })

  it('kisit sonrasi PostgREST sema onbellegini tazeler', () => {
    expect(code).toMatch(/NOTIFY pgrst, 'reload schema';/)
  })
})
