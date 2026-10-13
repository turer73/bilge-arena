const EMAIL = /(?<![\p{L}\p{M}\p{N}._%+-])[\p{L}\p{M}\p{N}._%+-]+@(?:[\p{L}\p{N}][\p{L}\p{M}\p{N}-]*\.)+[\p{L}\p{M}\p{N}-]{2,}(?![\p{L}\p{M}\p{N}-])/gu
const TURKISH_ID_CANDIDATE = /(?<!\d)[1-9](?:[\s.-]*\d){10}(?!\d)/g
// A full trunk/country prefix remains recognizable after labels like tel0532…
const TURKISH_PREFIXED_PHONE = /(?<!\d)(?:\+90|0090|90|0)[\s().-]*(?:5\d{2}|[234]\d{2})(?:[\s().-]*\d){7}(?!\d)/g
const LABELLED_BARE_MOBILE = /(?<![\d\p{L}])(tel(?:efon)?|gsm|cep|numaram|numara)(5\d{2}(?:[\s().-]*\d){7})(?!\d)/giu
const TURKISH_BARE_MOBILE = /(?<![\d\p{L}])5\d{2}(?:[\s().-]*\d){7}(?!\d)/gu
// A bare unformatted 2/3/4-prefixed number can be an ordinary math value.
const TURKISH_FORMATTED_LANDLINE = /(?<![\d\p{L}])[234]\d{2}[\s().-]+(?:[\s().-]*\d){7}(?!\d)/gu

function isTurkishIdentityNumber(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '').split('').map(Number)
  if (digits.length !== 11 || digits[0] === 0) return false
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!
  return ((odd * 7 - even) % 10 + 10) % 10 === digits[9]
    && digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10 === digits[10]
}

/** Best-effort redaction of common identifiers before sending chat text to a provider. */
export function redactChatPersonalData(text: string): string {
  return text.normalize('NFC')
    .replace(EMAIL, '[E-POSTA]')
    .replace(TURKISH_ID_CANDIDATE, (candidate) => (
      isTurkishIdentityNumber(candidate) ? '[TC-KIMLIK]' : candidate
    ))
    .replace(TURKISH_PREFIXED_PHONE, '[TELEFON]')
    .replace(LABELLED_BARE_MOBILE, (_match, label: string) => `${label}[TELEFON]`)
    .replace(TURKISH_BARE_MOBILE, '[TELEFON]')
    .replace(TURKISH_FORMATTED_LANDLINE, '[TELEFON]')
}
