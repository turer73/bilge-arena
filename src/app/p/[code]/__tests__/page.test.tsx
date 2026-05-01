/**
 * Bilge Arena Oda: /p/[code] public share route tests
 * Sprint 2C Task 8 PR3 + Codex P1 fix
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SharePage, { generateMetadata } from '../page'

describe('/p/[code] public share route', () => {
  test('1) generateMetadata default: og_title fallback "Bilge Arena Oda"', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ code: 'ABC123' }),
      searchParams: Promise.resolve({}),
    })
    expect(meta.title).toBe('Bilge Arena Oda — Bilge Arena')
    expect(meta.openGraph?.images).toBeDefined()
    const images = meta.openGraph?.images as Array<{ url: string }>
    expect(images[0].url).toContain('/api/og/result/ABC123')
    expect(images[0].url).toContain('title=Bilge+Arena+Oda')
  })

  test('2) generateMetadata querystring: og_title + og_score + og_category', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ code: 'XYZ' }),
      searchParams: Promise.resolve({
        og_title: 'Test Oda',
        og_score: '850',
        og_category: 'matematik',
      }),
    })
    expect(meta.title).toBe('Test Oda — Bilge Arena')
    const images = meta.openGraph?.images as Array<{ url: string }>
    const url = images[0].url
    expect(url).toContain('/api/og/result/XYZ')
    expect(url).toContain('title=Test+Oda')
    expect(url).toContain('score=850')
    expect(url).toContain('category=matematik')
    // Twitter card summary_large_image (TS type discriminated union)
    expect((meta.twitter as { card?: string })?.card).toBe(
      'summary_large_image',
    )
  })

  test('3) generateMetadata description: kategori varsa slugToLabel', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ code: 'X' }),
      searchParams: Promise.resolve({ og_category: 'genel-kultur' }),
    })
    expect(meta.description).toMatch(/Genel Kültür kategorisinde/i)
  })

  test('4) Page render: title + score + category + Bu Odaya Katil CTA', async () => {
    const ui = await SharePage({
      params: Promise.resolve({ code: 'ABC123' }),
      searchParams: Promise.resolve({
        og_title: 'Test Oda',
        og_score: '850',
        og_category: 'matematik',
      }),
    })
    render(ui as React.ReactElement)
    expect(screen.getByText('Test Oda')).toBeInTheDocument()
    expect(screen.getByText('850')).toBeInTheDocument()
    expect(screen.getByText(/Kategori: Matematik/i)).toBeInTheDocument()
    const cta = screen.getByText(/Bu Odaya Katıl/i)
    expect(cta.closest('a')?.getAttribute('href')).toBe('/oda/ABC123')
  })

  test('5) Page render: og_score yoksa skor bolumu gizli', async () => {
    const ui = await SharePage({
      params: Promise.resolve({ code: 'X' }),
      searchParams: Promise.resolve({ og_title: 'Sadece Title' }),
    })
    render(ui as React.ReactElement)
    expect(screen.getByText('Sadece Title')).toBeInTheDocument()
    expect(screen.queryByText(/Skor:/i)).not.toBeInTheDocument()
  })

  test('6) Codex P1 fix: auth YOK (proxy.ts middleware /admin only)', async () => {
    // Sayfa import'u + render auth fetch yapmaz (createClient YOK)
    // Sosyal medya crawler oturumsuz hit edebilir
    const ui = await SharePage({
      params: Promise.resolve({ code: 'PUBLIC1' }),
      searchParams: Promise.resolve({}),
    })
    expect(ui).toBeDefined()
    // Hata atmadi, redirect throw etmedi
  })
})
