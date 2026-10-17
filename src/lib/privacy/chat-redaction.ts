// Sohbet metni sağlayıcıya gitmeden önce yaygın kimlik/iletişim bilgileri
// maskelenir. Desenler bilerek dar tutulur: soru metinleri sayı dizileri ve
// işlemlerle doludur. Eski sürüm her rakam arasına `[\s().-]*` kabul ettiği için
// `425 - 3 - 2 - 1 - 7 - 6 - 5 - 4` gibi işlemleri telefon sanıyordu. Burada
// rakam grupları sabit uzunlukta, ayırıcılar en fazla bir karakter.

const WORD_CHAR = '\\p{L}\\p{M}\\p{N}'
const LOCAL_PART = `(?<![${WORD_CHAR}._%+-])[${WORD_CHAR}._%+-]+`
const DOMAIN_LABEL = `[\\p{L}\\p{N}][${WORD_CHAR}-]*`
const TOP_LEVEL = `[${WORD_CHAR}-]{2,}(?![${WORD_CHAR}-])`
const BRACKETED = (words: string) => `\\s*[(\\[{<]\\s*(?:${words})\\s*[)\\]}>]\\s*`

// `ayse@gmail.com`, `ayse @ gmail.com`, `ayse(at)gmail(dot)com`, `ayse[et]gmail.com`
const EMAIL = new RegExp(
  `${LOCAL_PART}(?:\\s?[@＠]\\s?|${BRACKETED('at|et')})`
  + `(?:${DOMAIN_LABEL}(?:\\.|${BRACKETED('dot|nokta')}))+${TOP_LEVEL}`,
  'giu',
)
// `ayse at gmail dot com`: düz kelimeli yazım yalnız bilinen bir posta
// sağlayıcısıyla eşleşir; aksi halde "look at example.com" da maskelenirdi.
const MAIL_PROVIDERS = 'gmail|googlemail|hotmail|outlook|yahoo|ymail|icloud|yandex|protonmail|proton|windowslive|msn|aol|gmx|mynet|superonline|ttmail'
const SPELLED_EMAIL = new RegExp(
  `${LOCAL_PART}\\s+(?:at|et)\\s+(?:${MAIL_PROVIDERS})`
  + `(?:\\.|\\s+(?:dot|nokta)\\s+|${BRACKETED('dot|nokta')})${TOP_LEVEL}`,
  'giu',
)

const IBAN_HEAD = /(?<![\p{L}\p{N}])[a-z]{2}\d{2}/giu
// SWIFT IBAN kaydındaki ülke uzunlukları. Uzunluk + mod-97 birlikte aranır;
// yalnız mod-97 her yüz rastgele adaydan birini kabul ederdi.
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22,
  MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
}

// Kart: bitişik 13-19 hane, 4'lü gruplar ya da Amex/Diners 4-6-5/4-6-4. Daha
// uzun bir sayı dizisinin parçası olan grup koşusu (`4125 4250 4375 4500 4625`) aday değildir.
const CARD_CANDIDATE = /(?<!\d)(?<!\d[.,])(?<!\d[ -])(?:\d{13,19}|\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,3})?|\d{4}[ -]\d{6}[ -]\d{4,5})(?![\d.,]?\d)(?![ -]\d)/g
// Kart ağı önekleri (IIN): Visa, Mastercard 51-55 ve 2221-2720, Amex, Diners,
// JCB, Discover, UnionPay, Troy. 20xx yıl dizileri bu öneklere girmez.
const CARD_NETWORK_PREFIX = /^(?:4|5[1-5]|2(?:22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)|3[47]|3(?:0[0-5]|[68])|35(?:2[89]|[3-8]\d)|6(?:011|4[4-9]|5|2)|9792)/

const TURKISH_ID_CANDIDATE = /(?<!\d)(?<!\d[.,])(?:[1-9]\d{10}|[1-9]\d{2}([ .-])\d{3}\1\d{3}\1\d{2})(?![\d.,]?\d)/g

// Abone numarası: 3 + 2 + 2 ya da 3 + 4 hane.
const subscriber = (sep: string) => `\\d{3}${sep}(?:\\d{2}${sep}\\d{2}|\\d{4})`
// Öneksiz yazımda tek karakterlik ayırıcı; `0532 - 123 - 45 - 67` gibi boşluklu
// ayırıcılar yalnız 0/+90 önekli numarada kabul edilir (işlemde öncü sıfır olmaz).
const BARE_SEP = '[ .-]?'
const PREFIXED_SEP = '(?:\\s?[./-]\\s?|\\s)?'
const MOBILE_AREA = '5[0-6]\\d'
const ANY_AREA = '(?:5[0-6]\\d|[2-4][1-9]\\d|8[05]0)'
// Coğrafi alan kodları. Öneksiz sabit hat yalnız bu listeyle eşleşir; `425 312 45 67`
// gibi gerçek olmayan kodlar işlem olarak kalır.
const LANDLINE_AREA = '(?:21[26]|22[2468]|23[26]|24[268]|25[268]|26[246]|27[246]|28[2468]'
  + '|31[28]|32[2468]|33[28]|34[2468]|35[2468]|36[2468]|37[02468]|38[02468]'
  + '|41[246]|42[2468]|43[2468]|44[26]|45[2468]|46[246]|47[2468]|48[2468])'

const TURKISH_PREFIXED_PHONE = new RegExp(
  `(?<![\\p{N}+])(?<!\\d[.,])\\(?(?:\\+\\s?90|0090|90|0)\\)?${PREFIXED_SEP}\\(?${ANY_AREA}\\)?${PREFIXED_SEP}${subscriber(PREFIXED_SEP)}(?![\\d.,]?\\d)`,
  'gu',
)
const LABELLED_BARE_MOBILE = new RegExp(
  `(?<![\\d\\p{L}])(tel(?:efon)?|gsm|cep|numaram|numara)(${MOBILE_AREA}${BARE_SEP}${subscriber(BARE_SEP)})(?![\\d.,]?\\d)`,
  'giu',
)
const TURKISH_BARE_MOBILE = new RegExp(
  `(?<![\\d\\p{L}])(?<!\\d[.,])\\(?${MOBILE_AREA}\\)?${BARE_SEP}${subscriber(BARE_SEP)}(?![\\d.,]?\\d)`,
  'gu',
)
// Bitişik 2/3/4 önekli sayı sıradan bir değer olabilir; en az bir ayırıcı gerekir.
const TURKISH_FORMATTED_LANDLINE = new RegExp(
  `(?<![\\d\\p{L}])(?<!\\d[.,])\\(?${LANDLINE_AREA}\\)?[ .-]${subscriber(BARE_SEP)}(?![\\d.,]?\\d)`,
  'gu',
)
// Yabancı numara yalnız `+`/`00` önekiyle tanınır. Gruplar boşluk ya da tireyle
// ayrılır (nokta binlik ayracıyla karışır); ilkinden sonra her grup en az iki hane,
// toplam en az 10 hane. `+3 4 5 6` ya da `+12 345 678` gibi diziler eşleşmez.
const INTERNATIONAL_PHONE = /(?<![\p{L}\p{N})\]])(?<!\d[.,])(?:\+|00)[1-9]\d{0,2}(?:(?:[ -]?\(\d{1,4}\))?(?:[ -]\d{1,5})?(?:[ -]\d{2,10}){1,6}|\d{7,14})(?![\d.,]?\d)/gu

function isTurkishIdentityNumber(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '').split('').map(Number)
  if (digits.length !== 11 || digits[0] === 0) return false
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!
  return ((odd * 7 - even) % 10 + 10) % 10 === digits[9]
    && digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10 === digits[10]
}

function passesLuhn(digits: string): boolean {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function isPaymentCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '')
  return digits.length >= 13 && digits.length <= 19 && CARD_NETWORK_PREFIX.test(digits) && passesLuhn(digits)
}

function hasValidIbanChecksum(iban: string): boolean {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const char of rearranged) {
    const value = char >= 'A' ? char.charCodeAt(0) - 55 : Number(char)
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97
  }
  return remainder === 1
}

/** Başlangıçtan itibaren tek ayırıcılı alfanümerik IBAN gövdesini okur; geçerliyse bitiş indeksini döner. */
function ibanEnd(text: string, start: number): number {
  const country = text.slice(start, start + 2).toUpperCase()
  const length = IBAN_LENGTHS[country]
  if (!length) return -1
  let compact = ''
  let index = start
  while (index < text.length && compact.length < length) {
    const char = text[index]!
    if (/[a-z0-9]/i.test(char)) {
      compact += char.toUpperCase()
      index += 1
    } else if (compact.length >= 4 && (char === ' ' || char === '-') && /[a-z0-9]/i.test(text[index + 1] ?? '')) {
      index += 1
    } else {
      break
    }
  }
  // Uzunluk dolduktan sonra gövde bitişik harf/rakamla sürüyorsa bu bir IBAN değildir.
  if (compact.length !== length || /[\p{L}\p{N}]/u.test(text[index] ?? '')) return -1
  return hasValidIbanChecksum(compact) ? index : -1
}

function redactIbans(text: string): string {
  let output = ''
  let copiedUntil = 0
  for (const match of text.matchAll(IBAN_HEAD)) {
    if (match.index < copiedUntil) continue
    const end = ibanEnd(text, match.index)
    if (end < 0) continue
    output += `${text.slice(copiedUntil, match.index)}[IBAN]`
    copiedUntil = end
  }
  return output + text.slice(copiedUntil)
}

function maskInternationalPhone(candidate: string): string {
  const digits = candidate.replace(/\D/g, '').replace(/^00/, '')
  return digits.length >= 10 && digits.length <= 15 ? '[TELEFON]' : candidate
}

/** Best-effort redaction of common identifiers before sending chat text to a provider. */
export function redactChatPersonalData(text: string): string {
  return redactIbans(
    text.normalize('NFC')
      .replace(EMAIL, '[E-POSTA]')
      .replace(SPELLED_EMAIL, '[E-POSTA]'),
  )
    .replace(CARD_CANDIDATE, (candidate) => (isPaymentCardNumber(candidate) ? '[KART]' : candidate))
    .replace(TURKISH_ID_CANDIDATE, (candidate) => (
      isTurkishIdentityNumber(candidate) ? '[TC-KIMLIK]' : candidate
    ))
    .replace(TURKISH_PREFIXED_PHONE, '[TELEFON]')
    .replace(LABELLED_BARE_MOBILE, (_match, label: string) => `${label}[TELEFON]`)
    .replace(TURKISH_BARE_MOBILE, '[TELEFON]')
    .replace(TURKISH_FORMATTED_LANDLINE, '[TELEFON]')
    .replace(INTERNATIONAL_PHONE, maskInternationalPhone)
}
