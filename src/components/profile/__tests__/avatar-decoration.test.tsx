/**
 * Bilge Arena: AvatarDecoration — ÇOKLU seçim (decorationIds dizisi). Boş/bilinmeyen
 * → yalnız children; geçerli süs(ler) → aria-hidden overlay'ler. Kanat artık SVG.
 * + katalog/helper bütünlüğü (parse/serialize, legacy tek-string, none-yok).
 */

import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AvatarDecoration } from '../avatar-decoration'
import {
  AVATAR_DECORATIONS,
  parseDecorationIds,
  serializeDecorationIds,
  getDecorationById,
} from '@/lib/constants/avatar-decorations'

describe('AvatarDecoration', () => {
  test('boş dizi → yalnız children, süs katmanı yok', () => {
    const { container, getByTestId } = render(
      <AvatarDecoration decorationIds={[]} size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(getByTestId('av')).toBeTruthy()
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  test('kanat → children + SVG süs overlay', () => {
    const { container, getByTestId } = render(
      <AvatarDecoration decorationIds={['kanat']} size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(getByTestId('av')).toBeTruthy()
    expect(container.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(0)
    expect(container.querySelector('svg')).toBeTruthy() // emoji değil, SVG kanat
  })

  test('ÇOKLU: kanat + crown + aura aynı anda render', () => {
    const { container } = render(
      <AvatarDecoration decorationIds={['kanat', 'crown', 'aura']} size={48}>
        <div />
      </AvatarDecoration>,
    )
    // aura (behind) + kanat/crown (front) → birden çok katman
    expect(container.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(1)
  })

  test('bilinmeyen id elenir → yalnız children', () => {
    const { container } = render(
      <AvatarDecoration decorationIds={['zzz-yok']} size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  test('tüm katalog tekil render olur (aria-hidden overlay)', () => {
    for (const d of AVATAR_DECORATIONS) {
      const { container, unmount } = render(
        <AvatarDecoration decorationIds={[d.id]} size={48}>
          <div />
        </AvatarDecoration>,
      )
      expect(container.querySelector('[aria-hidden]')).toBeTruthy()
      unmount()
    }
  })
})

describe('avatar-decoration katalog + helpers', () => {
  test('id benzersiz; none YOK; ücretliler pozitif', () => {
    const ids = AVATAR_DECORATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('none')
    for (const d of AVATAR_DECORATIONS) {
      if (d.coinCost !== undefined) expect(d.coinCost).toBeGreaterThan(0)
    }
  })

  test('parseDecorationIds: JSON dizi + eski tek-string + geçersiz/none eleme', () => {
    expect(parseDecorationIds(null)).toEqual([])
    expect(parseDecorationIds(JSON.stringify(['kanat', 'crown']))).toEqual(['kanat', 'crown'])
    expect(parseDecorationIds('kanat')).toEqual(['kanat']) // eski tek-string biçim
    expect(parseDecorationIds(JSON.stringify(['kanat', 'zzz', 'none']))).toEqual(['kanat'])
  })

  test('serialize → parse roundtrip', () => {
    expect(parseDecorationIds(serializeDecorationIds(['aura', 'kanat']))).toEqual(['aura', 'kanat'])
  })

  test('getDecorationById', () => {
    expect(getDecorationById('kanat')?.name).toBe('Melek Kanadı')
    expect(getDecorationById('yok')).toBeUndefined()
  })
})
