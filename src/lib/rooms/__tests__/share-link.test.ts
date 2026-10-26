import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SHARE_TITLE_MAX,
  normalizeShareTitle,
  shareLinkSecret,
  signShareClaims,
  verifyShareParams,
} from '../share-link'

const SECRET = 'test-share-secret-0123456789abcdef0123456789'
const OTHER = 'other-share-secret-0123456789abcdef012345678'

afterEach(() => vi.unstubAllEnvs())

async function signed(overrides: Partial<{ code: string; title: string; score: number | null; category: string | null }> = {}) {
  const params = await signShareClaims({ code: 'BLZGE2', title: 'Genel Kültür Gecesi', score: 850, category: 'matematik', ...overrides }, SECRET)
  if (!params) throw new Error('imzalanamadı')
  return params
}

describe('share-link imzası', () => {
  it('imzalanan değerleri aynen doğrular', async () => {
    expect(await verifyShareParams('BLZGE2', await signed(), SECRET)).toEqual({
      code: 'BLZGE2', title: 'Genel Kültür Gecesi', score: 850, category: 'matematik',
    })
  })

  it('başlık, skor, kategori veya kod değişirse reddeder', async () => {
    const base = await signed()
    for (const [key, value] of [['og_title', 'Sahte Başlık'], ['og_score', '999'], ['og_category', 'fen']] as const) {
      const tampered = new URLSearchParams(base)
      tampered.set(key, value)
      expect(await verifyShareParams('BLZGE2', tampered, SECRET), key).toBeNull()
    }
    expect(await verifyShareParams('BLZGE3', base, SECRET)).toBeNull()
    const noScore = new URLSearchParams(base)
    noScore.delete('og_score')
    expect(await verifyShareParams('BLZGE2', noScore, SECRET)).toBeNull()
  })

  it('imzasız, bozuk imzalı veya başka sırla imzalı bağlantıyı reddeder', async () => {
    expect(await verifyShareParams('BLZGE2', { og_title: 'Uydurma', og_score: '999' }, SECRET)).toBeNull()
    const bad = new URLSearchParams(await signed())
    bad.set('og_sig', 'x'.repeat(43))
    expect(await verifyShareParams('BLZGE2', bad, SECRET)).toBeNull()
    expect(await verifyShareParams('BLZGE2', await signed(), OTHER)).toBeNull()
  })

  it('sır tanımsız ya da kısaysa imzalı paylaşım kapalıdır', async () => {
    vi.stubEnv('SHARE_LINK_SECRET', '')
    expect(shareLinkSecret()).toBeNull()
    expect(await verifyShareParams('BLZGE2', await signed())).toBeNull()
    vi.stubEnv('SHARE_LINK_SECRET', 'kisa')
    expect(shareLinkSecret()).toBeNull()
    vi.stubEnv('SHARE_LINK_SECRET', SECRET)
    expect(await verifyShareParams('BLZGE2', await signed())).not.toBeNull()
  })

  it('geçersiz oda kodu ve geçersiz kategori imzalanmaz ya da düşürülür', async () => {
    expect(await signShareClaims({ code: 'xyz', title: 'A' }, SECRET)).toBeNull()
    expect(await signShareClaims({ code: 'BLZGE2', title: '   ' }, SECRET)).toBeNull()
    const params = await signed({ category: 'olmayan-kategori', score: 0 })
    expect(params.has('og_category')).toBe(false)
    expect(params.has('og_score')).toBe(false)
  })

  it('başlıktaki kontrol karakterlerini temizler ve uzunluğu sınırlar', () => {
    expect(normalizeShareTitle('  Oda\n\tAdı\u0000 ')).toBe('Oda Adı')
    expect(Array.from(normalizeShareTitle('ç'.repeat(200)) ?? '')).toHaveLength(SHARE_TITLE_MAX)
  })

  it('normalize edilmemiş başlıkla gelen bağlantıyı kabul etmez', async () => {
    const params = new URLSearchParams(await signed({ title: 'Oda Adı' }))
    params.set('og_title', ' Oda Adı ')
    expect(await verifyShareParams('BLZGE2', params, SECRET)).toBeNull()
  })
})
