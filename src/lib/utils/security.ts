/**
 * Güvenlik utility fonksiyonları.
 * LIKE escape, HTML escape, input sanitization.
 */

/**
 * SQL LIKE sorgularında wildcard karakterleri escape eder.
 * `%` ve `_` karakterleri literal olarak aranır.
 *
 * @example escapeForLike("test%user") → "test\\%user"
 */
export function escapeForLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * HTML özel karakterlerini escape eder.
 * Email template'lerde XSS önlemek için kullanılır.
 *
 * @example escapeHtml("<script>alert('xss')</script>") → "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
 */
export function escapeHtml(input: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return input.replace(/[&<>"']/g, (char) => map[char] || char)
}

/**
 * PNG dosyasının magic bytes'ını doğrular.
 * Client MIME type'ına güvenmek yerine dosya başlığını kontrol eder.
 *
 * PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
 */
export function isPngBuffer(buffer: ArrayBuffer): boolean {
  const header = new Uint8Array(buffer).slice(0, 8)
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return PNG_MAGIC.every((byte, i) => header[i] === byte)
}

/**
 * Video dosyasının magic bytes'ını doğrular (uzantı/MIME'a güvenme).
 * MP4: offset 4-7 'ftyp' (0x66 0x74 0x79 0x70)
 * WebM: EBML başlığı 0x1A 0x45 0xDF 0xA3
 *
 * @returns tespit edilen MIME, eşleşme yoksa null
 */
export function detectVideoMime(buffer: ArrayBuffer): 'video/mp4' | 'video/webm' | null {
  const b = new Uint8Array(buffer)
  if (b.length < 12) return null
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4'
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm'
  return null
}

/**
 * Görsel (poster) dosyasının magic bytes'ını doğrular.
 * PNG: 89 50 4E 47 · JPEG: FF D8 FF · WebP: RIFF....WEBP
 *
 * @returns tespit edilen MIME, eşleşme yoksa null
 */
export function detectImageMime(
  buffer: ArrayBuffer,
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const b = new Uint8Array(buffer)
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp'
  return null
}
