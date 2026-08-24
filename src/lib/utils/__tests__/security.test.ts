import { describe, it, expect } from 'vitest'
import {
  escapeForLike,
  escapeHtml,
  isPngBuffer,
  detectVideoMime,
  detectImageMime,
} from '../security'

describe('escapeForLike', () => {
  it('escapes % wildcard', () => {
    expect(escapeForLike('100%')).toBe('100\\%')
  })

  it('escapes _ wildcard', () => {
    expect(escapeForLike('user_name')).toBe('user\\_name')
  })

  it('escapes both wildcards', () => {
    expect(escapeForLike('%_test_%')).toBe('\\%\\_test\\_\\%')
  })

  it('returns string unchanged if no wildcards', () => {
    expect(escapeForLike('normal text')).toBe('normal text')
  })

  it('escapes the escape character before wildcards', () => {
    expect(escapeForLike('path\\100%_done')).toBe('path\\\\100\\%\\_done')
  })

  it('handles empty string', () => {
    expect(escapeForLike('')).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes quotes', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#39;world&#39;')
  })

  it('escapes a full XSS payload', () => {
    const input = '<img onerror="alert(1)" src=x>'
    expect(input).not.toBe(escapeHtml(input))
    expect(escapeHtml(input)).not.toContain('<')
    expect(escapeHtml(input)).not.toContain('>')
    expect(escapeHtml(input)).not.toContain('"')
  })

  it('returns string unchanged if no special chars', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

describe('isPngBuffer', () => {
  it('returns true for valid PNG header', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).buffer
    expect(isPngBuffer(buf)).toBe(true)
  })

  it('returns false for JPEG header', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer
    expect(isPngBuffer(buf)).toBe(false)
  })

  it('returns false for empty buffer', () => {
    const buf = new ArrayBuffer(0)
    expect(isPngBuffer(buf)).toBe(false)
  })

  it('returns false for short buffer', () => {
    const buf = new Uint8Array([0x89, 0x50]).buffer
    expect(isPngBuffer(buf)).toBe(false)
  })
})

describe('detectVideoMime', () => {
  it('MP4 algılar (ftyp @ offset 4)', () => {
    const buf = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]).buffer
    expect(detectVideoMime(buf)).toBe('video/mp4')
  })

  it('WebM algılar (EBML header)', () => {
    const buf = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]).buffer
    expect(detectVideoMime(buf)).toBe('video/webm')
  })

  it('PNG → null (video değil)', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer
    expect(detectVideoMime(buf)).toBeNull()
  })

  it('kısa buffer → null', () => {
    expect(detectVideoMime(new Uint8Array([0x66, 0x74]).buffer)).toBeNull()
  })
})

describe('detectImageMime', () => {
  it('PNG algılar', () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer)).toBe('image/png')
  })

  it('JPEG algılar', () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer)).toBe('image/jpeg')
  })

  it('WebP algılar (RIFF....WEBP)', () => {
    const buf = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer
    expect(detectImageMime(buf)).toBe('image/webp')
  })

  it('MP4 → null (görsel değil)', () => {
    const buf = new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]).buffer
    expect(detectImageMime(buf)).toBeNull()
  })
})
