import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from '../serialize-json-ld'

describe('serializeJsonLd', () => {
  it('keeps structured data parseable without an HTML script terminator', () => {
    const value = {
      '@context': 'https://schema.org',
      name: '</script><script>alert(1)</script>',
      description: 'A < B & C > D',
    }

    const serialized = serializeJsonLd(value)

    expect(serialized).not.toContain('<')
    expect(serialized).toContain('\\u003c/script>')
    expect(JSON.parse(serialized)).toEqual(value)
  })
})
