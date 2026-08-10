import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const sql = read('database/migrations/109_canonical_category_remap.sql')
/** Yorumlar eski kategori adlarini aciklama amaçli iceriyor; kontrol koda bakmali. */
const code = sql.replace(/--[^\n]*/g, '')
const games = read('src/lib/constants/games.ts')

describe('109 kanonik kategori yeniden esleme', () => {
  it('guncellemeden once eski kategorileri yedekler', () => {
    const backup = code.indexOf('INSERT INTO public._backup_questions_taxonomy_109_20260810')
    const firstUpdate = code.indexOf('UPDATE public.questions')
    expect(backup).toBeGreaterThan(-1)
    expect(firstUpdate).toBeGreaterThan(backup)
  })

  it('yedek tablosunu istemci rollerine acmaz', () => {
    expect(code).toMatch(/REVOKE ALL ON public\._backup_questions_taxonomy_109_20260810 FROM PUBLIC, anon, authenticated;/)
  })

  it('cebiri sinav bazinda ayirir: AYT fonksiyonlar, LGS konu bazli', () => {
    expect(code).toMatch(/SET category = 'fonksiyonlar'[\s\S]*?exam_ref IN \('AYT-SAY', 'AYT-EA'\)/)
    expect(code).toMatch(/SET category = 'problemler'[\s\S]*?'Oran ve Orantı Problemleri', 'Yüzde, Faiz ve Kar-Zarar'/)
    expect(code).toMatch(/SET category = 'denklemler'[\s\S]*?'Denklemler ve Eşitsizlikler', 'İki Bilinmeyenli Denklem', 'Örüntü ve Denklem'/)
  })

  it('veri, inkılap_tarihi ve vatandaşlık kanonik karsiliklarina katlanir', () => {
    expect(code).toMatch(/SET category = 'olasilik'\s+WHERE game = 'matematik' AND category = 'veri';/)
    expect(code).toMatch(/SET category = 'tarih'\s+WHERE game = 'sosyal' AND category = 'inkılap_tarihi';/)
    expect(code).toMatch(/SET category = 'sosyoloji'\s+WHERE game = 'sosyal' AND category = 'vatandaşlık';/)
  })

  it('din_kulturu satirlarina DOKUNMAZ (kanonik listeye eklendi)', () => {
    expect(code).not.toMatch(/UPDATE[\s\S]*?category = 'din_kulturu'\s*;/)
    expect(code).not.toMatch(/SET category = '[a-z_]+'[\s\S]*?category = 'din_kulturu'/)
  })

  it('kanonik-disi satir kalirsa migration geri alinir', () => {
    expect(code).toMatch(/RAISE EXCEPTION 'Migration 109/)
    expect(code).toMatch(/category NOT IN\s*\n?\s*\('sayilar','problemler','geometri','denklemler','fonksiyonlar','olasilik'\)/)
  })

  it('guard listesi games.ts kanonik listesiyle ortusur', () => {
    // Migration'in kabul ettigi sosyal kategoriler ile uygulamanin listesi
    // ayrisirsa yine erisilemez soru dogar - kesif #1515'in kok nedeni buydu.
    const sosyal = games.match(/slug: 'sosyal'[\s\S]*?categories: \[([^\]]+)\]/)
    expect(sosyal).not.toBeNull()
    const appCats = [...sosyal[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(appCats).toContain('din_kulturu')

    const guard = code.match(/game = 'sosyal' AND category NOT IN\s*\n?\s*\(([^)]+)\)/)
    expect(guard).not.toBeNull()
    const sqlCats = [...guard[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    expect([...sqlCats].sort()).toEqual([...appCats].sort())
  })
})
