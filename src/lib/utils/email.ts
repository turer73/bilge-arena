/**
 * Email dogrulama — kullanicinin elle girdigi email'i magic link
 * gondermeden once kontrol eder. Minimal ama pratik: bos, format,
 * uzunluk kontrolu yapar. Supabase zaten sunucu tarafinda ek
 * kontroller yapar (domain gecersiz vs.), bu client-side katmanin
 * amaci hizli feedback vermek.
 *
 * Genisletme noktalari (istege bagli):
 * - Turkce karakter reddi: /[ıİşŞğĞüÜöÖçÇ]/ match → 'invalid'
 * - Yazim onerisi (typo): gmial.com → gmail.com (didYouMean)
 * - Disposable blacklist: mailinator, tempmail, throwaway email domains
 * - Kurumsal email tesvik: bilgearena.com kendi domaini olan kullaniciyi flag'le
 */

const MAX_EMAIL_LENGTH = 254 // RFC 5321 uyumlu
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EmailValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: EmailValidationError }

export type EmailValidationError = 'empty' | 'invalid' | 'too_long'

/**
 * Email dogrulama. Basariliysa trim + lowercase normalize edilmis email doner.
 */
export function validateEmail(raw: string): EmailValidationResult {
  const normalized = raw.trim().toLowerCase()

  if (!normalized) {
    return { ok: false, reason: 'empty' }
  }

  if (normalized.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: 'too_long' }
  }

  if (!BASIC_EMAIL_REGEX.test(normalized)) {
    return { ok: false, reason: 'invalid' }
  }

  return { ok: true, normalized }
}

/**
 * UI icin kullanici dostu Turkce hata mesaji.
 */
export function getEmailErrorMessage(reason: EmailValidationError): string {
  switch (reason) {
    case 'empty':
      return 'Email adresi bos birakilamaz.'
    case 'invalid':
      return 'Gecerli bir email adresi gir (ornek: ad@domain.com).'
    case 'too_long':
      return 'Email adresi cok uzun.'
  }
}
