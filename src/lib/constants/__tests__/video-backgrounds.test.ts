import { describe, it, expect } from 'vitest'
import {
  availableResolutions,
  resolveVariantUrl,
  rowToStoreItem,
  type BackgroundAssetRow,
} from '../video-backgrounds'

describe('availableResolutions', () => {
  it('boş/undefined variants → []', () => {
    expect(availableResolutions({})).toEqual([])
    expect(availableResolutions(undefined)).toEqual([])
  })

  it('yalnız dolu varyantları sıralı döner (hd<k2<k4)', () => {
    expect(availableResolutions({ k4: 'u4', hd: 'u1' })).toEqual(['hd', 'k4'])
  })

  it('boş string varyant sayılmaz', () => {
    expect(availableResolutions({ hd: '', k2: 'u2' })).toEqual(['k2'])
  })
})

describe('resolveVariantUrl', () => {
  const v = { hd: 'uHD', k2: 'u2K', k4: 'u4K' }

  it('tam eşleşme döner', () => {
    expect(resolveVariantUrl(v, 'k2')).toBe('u2K')
  })

  it('istenen yoksa en yakın düşük çözünürlüğe iner', () => {
    expect(resolveVariantUrl({ hd: 'uHD' }, 'k4')).toBe('uHD')
  })

  it('daha düşük yoksa mevcut en yükseği verir', () => {
    expect(resolveVariantUrl({ k4: 'u4K' }, 'hd')).toBe('u4K')
  })

  it('hiç varyant yoksa null', () => {
    expect(resolveVariantUrl({}, 'k2')).toBeNull()
    expect(resolveVariantUrl(undefined, 'k2')).toBeNull()
  })
})

describe('rowToStoreItem', () => {
  it('snake_case satırı mağaza item\'ına çevirir (id=slug, kind=video)', () => {
    const row: BackgroundAssetRow = {
      id: 'uuid-1',
      slug: 'orman-yagmuru',
      name: 'Orman Yağmuru',
      description: null,
      category: 'video',
      rarity: 'epic',
      coin_cost: 900,
      variants: { hd: 'u1' },
      poster_url: null,
      is_published: true,
      created_at: '2026-06-13',
    }
    expect(rowToStoreItem(row)).toMatchObject({
      id: 'orman-yagmuru',
      name: 'Orman Yağmuru',
      description: '',
      kind: 'video',
      coinCost: 900,
      variants: { hd: 'u1' },
      posterUrl: undefined,
    })
  })
})
