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
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_')
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
