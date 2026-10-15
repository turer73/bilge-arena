import { describe, expect, it } from 'vitest'
import { metadata } from '../page'

describe('kurum tanıtımının sosyal paylaşımı', () => {
  it('sayfa metadata’sı kök görselini ezdiğinde iki paylaşım kartını da görselsiz bırakmaz', () => {
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: expect.stringMatching(/\/og-image\.png$/), width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [expect.stringMatching(/\/og-image\.png$/)],
    })
  })
})
