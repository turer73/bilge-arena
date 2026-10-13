/** Escape HTML script delimiters while preserving valid JSON-LD. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
