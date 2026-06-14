/**
 * Bilge Arena: AvatarDecoration — avatar etrafı süsü (emoji+CSS). none/bilinmeyen
 * → sadece children; geçerli süs → aria-hidden overlay. Katalog bütünlüğü.
 */

import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AvatarDecoration } from '../avatar-decoration'
import { AVATAR_DECORATIONS, getDecorationById } from '@/lib/constants/avatar-decorations'

describe('AvatarDecoration', () => {
  test('none → yalnız children, süs katmanı yok', () => {
    const { container, getByTestId } = render(
      <AvatarDecoration decorationId="none" size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(getByTestId('av')).toBeTruthy()
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  test('kanat → children + süs overlay (aria-hidden) render olur', () => {
    const { container, getByTestId } = render(
      <AvatarDecoration decorationId="kanat" size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(getByTestId('av')).toBeTruthy()
    expect(container.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(0)
  })

  test('tüm katalog süsleri render olur (none hariç aria-hidden overlay)', () => {
    for (const d of AVATAR_DECORATIONS) {
      const { container, unmount } = render(
        <AvatarDecoration decorationId={d.id} size={48}>
          <div data-testid="av" />
        </AvatarDecoration>,
      )
      if (d.id !== 'none') {
        expect(container.querySelector('[aria-hidden]')).toBeTruthy()
      }
      unmount()
    }
  })

  test('bilinmeyen id → güvenli fallback (yalnız children)', () => {
    const { container } = render(
      <AvatarDecoration decorationId="zzz-yok" size={48}>
        <div data-testid="av" />
      </AvatarDecoration>,
    )
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })
})

describe('AVATAR_DECORATIONS kataloğu', () => {
  test('id benzersiz; none ücretsiz; ücretliler pozitif fiyatlı', () => {
    const ids = AVATAR_DECORATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getDecorationById('none').coinCost).toBeUndefined()
    for (const d of AVATAR_DECORATIONS) {
      if (d.coinCost !== undefined) expect(d.coinCost).toBeGreaterThan(0)
    }
  })

  test('getDecorationById bilinmeyen → none fallback', () => {
    expect(getDecorationById('yok').id).toBe('none')
  })
})
