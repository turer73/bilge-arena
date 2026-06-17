import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderRichText, stripRichText } from '../rich-text'

describe('renderRichText', () => {
  it('markup yoksa metni oldugu gibi dondurur', () => {
    expect(renderRichText('Merhaba dünya')).toBe('Merhaba dünya')
  })

  it('null/undefined icin bos string', () => {
    expect(renderRichText(null)).toBe('')
    expect(renderRichText(undefined)).toBe('')
  })

  it('<u>...</u> markup\'ini altcizili <u> elementi olarak render eder', () => {
    const { container } = render(<p>{renderRichText("'Onun her sözü aklımda <u>kazınıp</u> kaldı.'")}</p>)
    const u = container.querySelector('u')
    expect(u).not.toBeNull()
    expect(u?.textContent).toBe('kazınıp')
    // Gorunur metin etiketsiz, dogru
    expect(container.textContent).toBe("'Onun her sözü aklımda kazınıp kaldı.'")
  })

  it('coklu <u> span destekler', () => {
    const { container } = render(<p>{renderRichText('<u>basit</u> ve <u>karmaşık</u>')}</p>)
    expect(container.querySelectorAll('u')).toHaveLength(2)
  })

  it('XSS-safe: <u> disindaki HTML element olarak DEGIL metin olarak basilir', () => {
    const { container } = render(<p>{renderRichText('<u>x</u> <img src=z onerror=alert(1)>')}</p>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=z onerror=alert(1)>')
  })
})

describe('stripRichText', () => {
  it('<u> etiketlerini cikarir (AI baglami / admin liste icin)', () => {
    expect(stripRichText('<u>kazınıp</u> kaldı')).toBe('kazınıp kaldı')
  })

  it('null/undefined/markup-suz', () => {
    expect(stripRichText(null)).toBe('')
    expect(stripRichText(undefined)).toBe('')
    expect(stripRichText('düz metin')).toBe('düz metin')
  })
})
