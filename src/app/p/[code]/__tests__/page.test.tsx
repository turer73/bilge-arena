/**
 * Bilge Arena Oda: /p/[code] public share route tests
 *
 * disc #2950: başlık, skor ve kategori yalnız sunucunun imzaladığı
 * bağlantıdan gelir; imzasız istekte URL'deki metin hiçbir yere basılmaz.
 */

import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import SharePage, { generateMetadata } from '../page'
import { signShareClaims } from '@/lib/rooms/share-link'

const SECRET = 'test-share-secret-0123456789abcdef0123456789'
const CODE = 'BLZGE2'

function props(code: string, searchParams: Record<string, string> = {}) {
  return { params: Promise.resolve({ code }), searchParams: Promise.resolve(searchParams) }
}

async function signedParams() {
  const params = await signShareClaims({ code: CODE, title: 'Genel Kültür Gecesi', score: 850, category: 'matematik' }, SECRET)
  return Object.fromEntries(params!.entries())
}

beforeEach(() => vi.stubEnv('SHARE_LINK_SECRET', SECRET))
afterEach(() => vi.unstubAllEnvs())

describe('/p/[code] public share route', () => {
  test('imzasız bağlantıda URL metni hiçbir yere basılmaz, genel kart çizilir', async () => {
    const spoof = { og_title: 'SAHTE-BASLIK', og_score: '999', og_category: 'matematik' }
    const meta = await generateMetadata(props(CODE, spoof))
    expect(meta.title).toBe('Bilge Arena oyun sonucu')
    expect(JSON.stringify(meta)).not.toContain('SAHTE-BASLIK')
    expect(JSON.stringify(meta)).not.toContain('999')
    const images = meta.openGraph?.images as Array<{ url: string }>
    expect(images[0].url).toBe(`/api/og/result/${CODE}`)

    const html = renderToStaticMarkup(await SharePage(props(CODE, spoof)))
    expect(html).not.toContain('SAHTE-BASLIK')
    expect(html).not.toContain('999')
    expect(html).toContain('Bilge Arena oyun sonucu')
  })

  test('imzalı bağlantı oda başlığını, skoru ve kategoriyi gösterir', async () => {
    const query = await signedParams()
    const meta = await generateMetadata(props(CODE, query))
    // Kök layout '%s | Bilge Arena' ekler; sayfa markayı tekrar etmez.
    expect(meta.title).toBe('Genel Kültür Gecesi')
    expect(meta.description).toMatch(/Matematik kategorisinde/i)
    const url = (meta.openGraph?.images as Array<{ url: string }>)[0].url
    expect(url).toContain(`/api/og/result/${CODE}?`)
    expect(url).toContain(`og_sig=${encodeURIComponent(query.og_sig)}`)
    expect((meta.twitter as { card?: string })?.card).toBe('summary_large_image')

    render(await SharePage(props(CODE, query)))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Genel Kültür Gecesi')
    expect(screen.getByText('850')).toBeInTheDocument()
    expect(screen.getByText(/Kategori: Matematik/i)).toBeInTheDocument()
    expect(screen.getByText(/Bu Odaya Katıl/i).closest('a')?.getAttribute('href')).toBe(`/oda/${CODE}`)
  })

  test('imzalı değerlerden biri değiştirilirse genel karta düşer', async () => {
    const query = { ...(await signedParams()), og_score: '9999' }
    const meta = await generateMetadata(props(CODE, query))
    expect(meta.title).toBe('Bilge Arena oyun sonucu')
    expect((meta.openGraph?.images as Array<{ url: string }>)[0].url).toBe(`/api/og/result/${CODE}`)
  })

  test('sır tanımsızsa imzalı bağlantı da genel karta düşer', async () => {
    const query = await signedParams()
    vi.stubEnv('SHARE_LINK_SECRET', '')
    expect((await generateMetadata(props(CODE, query))).title).toBe('Bilge Arena oyun sonucu')
  })

  test('oda kodu biçimine uymayan yol 404 verir', async () => {
    for (const code of ['ABC123', 'X', 'blzge2', 'BLZGE2X']) {
      await expect(SharePage(props(code)), code).rejects.toThrow()
      await expect(generateMetadata(props(code)), code).rejects.toThrow()
    }
  })

  test('paylaşım sayfası indekslenmez ama bağlantıları izlenir', async () => {
    const meta = await generateMetadata(props(CODE))
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  test('auth gerektirmez: oturumsuz tarayıcı için hata atmadan çizilir', async () => {
    const ui = await SharePage(props(CODE))
    expect(ui).toBeDefined()
  })
})
