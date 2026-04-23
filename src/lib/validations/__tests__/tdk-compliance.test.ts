import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { TDK_RULES, forbiddenAsciiTokensAll } from '../tdk-rules.fixture'

/**
 * TDK Uyum Testi — GENERATIF
 *
 * Bu test tdk-rules.fixture.ts'teki forbiddenAsciiTokens listesini dolaşarak
 * src/ altinda KULLANICIYA GORUNEN her dosyada (UI bilesenleri, app route'lari,
 * store'lar, public manifest) ASCII ornegin string literal icinde yer almadigini
 * dogrular.
 *
 * YENI KURAL EKLEMEK:
 *   tdk-rules.fixture.ts icinde diacritics.forbiddenAsciiTokens'a satir ekle.
 *   Yeni it.each test parametresi olarak otomatik cikar.
 *
 * FALSE POSITIVE:
 *   - Kod yorumlari strip edilir (// ve /* ... *\/)
 *   - server-side API route'lari dahil edilmez (USER_FACING_GLOBS)
 *   - Test dosyalari dahil edilmez
 *   - Eger bir ASCII kelime URL slug gibi mesru kullanilacaksa,
 *     forbiddenAsciiTokens'tan kaldir veya allowedContexts'e ekle.
 */

// Project root (bu test src/lib/validations/__tests__/ icinde)
const PROJECT_ROOT = resolve(__dirname, '../../../..')
const SRC = join(PROJECT_ROOT, 'src')
const PUBLIC = join(PROJECT_ROOT, 'public')

/**
 * Kullaniciya gorunen metin iceren dizinler.
 * API route'lari server-side oldugu icin genelde dahil edilmez, ancak
 * email template ve metadata onlarda da olabilir — tek tek incelenir.
 */
const USER_FACING_DIRS = [
  join(SRC, 'components'),
  join(SRC, 'app'),
  join(SRC, 'stores'),
  join(SRC, 'lib', 'constants'),
]

const USER_FACING_FILES = [
  join(PUBLIC, 'manifest.json'),
]

const EXTENSIONS = new Set(['.ts', '.tsx', '.json'])

const EXCLUDE_PATTERNS = [
  /__tests__/,
  /\.test\./,
  /\.spec\./,
  /node_modules/,
  /\.next/,
  /tdk-rules\.fixture\.ts$/,
]

const USER_FACING_API_SAFELIST = [
  // Email template ve weekly-digest gibi kullaniciya metin uretilen
  // API route'lari istege bagli dahil edilebilir. Varsayilan: dahil.
  join(SRC, 'app', 'api', 'cron', 'weekly-digest'),
]

function walkDir(dir: string): string[] {
  if (!safeExists(dir)) return []
  const result: string[] = []

  function walk(current: string): void {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(current, entry)

      if (EXCLUDE_PATTERNS.some(p => p.test(full))) continue

      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(full)
      } else if (stat.isFile()) {
        if (EXTENSIONS.has(extname(full))) {
          result.push(full)
        }
      }
    }
  }

  walk(dir)
  return result
}

function safeExists(p: string): boolean {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

/**
 * Bir TypeScript/TSX icerigi yorumlardan arindir. Basit — string icindeki
 * // veya /* isaretleriyle yanilabilir, ancak TDK ASCII tokenlar genelde
 * ozel string karakterleri icermez.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */
    .replace(/\/\/[^\n]*/g, '')         // //
}

/**
 * Bir ASCII tokenin string literal icinde gecip gecmedigini kontrol eder.
 * String literal = '...', "...", `...`
 */
function hasInStringLiteral(source: string, ascii: string): boolean {
  const escaped = ascii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // String literal icinde tam kelime olarak, bosluk/kelime sinirinda
  const pattern = new RegExp(
    `['"\`][^'"\`\\n]*\\b${escaped}\\b[^'"\`\\n]*['"\`]`,
    'g',
  )
  return pattern.test(source)
}

// ═══════════════════════════════════════════════════════════════════════
// TEST COLLECTION
// ═══════════════════════════════════════════════════════════════════════

const allFiles = [
  ...USER_FACING_DIRS.flatMap(walkDir),
  ...USER_FACING_API_SAFELIST.flatMap(walkDir),
  ...USER_FACING_FILES.filter(safeExists),
]

// Icerik cache — her dosya bir kere okunur, her token icin tekrar okunmaz
const fileContents = new Map<string, string>()
for (const file of allFiles) {
  try {
    const raw = readFileSync(file, 'utf-8')
    fileContents.set(file, stripComments(raw))
  } catch {
    // Okunamazsa atla
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('TDK Uyum — Diakritik Koruma', () => {
  it(`dogrulama: en az 1 dosya taranacak (bulunan: ${allFiles.length})`, () => {
    expect(allFiles.length).toBeGreaterThan(0)
  })

  // Her forbiddenAsciiToken icin bir test
  // Manuel (proje-ozel) + sozluk-kaynakli genis liste birlesimi
  it.each(forbiddenAsciiTokensAll)(
    'ASCII "%s" kullaniciya gorunen string literal icinde olmamali (dogru form: "%s")',
    (ascii, correct) => {
      // Aynı olan ciftleri (false positive kontrolu) atla
      if (ascii === correct) return

      const violations: string[] = []

      for (const [file, content] of fileContents) {
        if (hasInStringLiteral(content, ascii)) {
          const relative = file.replace(PROJECT_ROOT, '').replace(/\\/g, '/')
          violations.push(`  ${relative}`)
        }
      }

      if (violations.length > 0) {
        const message =
          `\nASCII "${ascii}" kullan: "${correct}"\n` +
          `Tespit edilen dosyalar (${violations.length}):\n` +
          violations.join('\n') +
          '\n\nCozum: Bu dosyalardaki string literal\'larda ' +
          `"${ascii}" yerine "${correct}" yaz.\n` +
          'Eger mesru kullanim ise (URL slug vb.), fixture\'dan kaldir.'
        expect(violations, message).toEqual([])
      }
    },
  )
})

describe('TDK Uyum — Kisaltma Formati', () => {
  // Buyuk harfli kurum kisaltmalarinda nokta yasak: "T.B.M.M." → "TBMM"
  it('buyuk harfli kurum kisaltmalari nokta iceremez', () => {
    const invalidPatterns = TDK_RULES.abbreviations.invalid.filter(s => /[A-Z]\.[A-Z]/.test(s))
    const violations: Array<{ file: string; token: string }> = []

    for (const [file, content] of fileContents) {
      for (const bad of invalidPatterns) {
        if (content.includes(bad)) {
          const relative = file.replace(PROJECT_ROOT, '').replace(/\\/g, '/')
          violations.push({ file: relative, token: bad })
        }
      }
    }

    expect(violations).toEqual([])
  })
})

describe('TDK Uyum — Tarih Formati', () => {
  // ISO tarihleri (2026-04-23) dogrudan kullaniciya gosterilmemeli;
  // formatla: 23.04.2026 veya 23 Nisan 2026. Bu test veri-yonetimi
  // icin bilgilendirici, zorunlu degil.
  it('fixture ile uyumlu Turkce ay adlari export ediyor', () => {
    expect(TDK_RULES.date.monthsTurkish).toContain('Nisan')
    expect(TDK_RULES.date.monthsTurkish).toContain('Ağustos')
    expect(TDK_RULES.date.monthsTurkish.length).toBe(12)
  })
})

describe('TDK Uyum — Fixture Sagligi', () => {
  it('forbiddenAsciiTokens bos degil', () => {
    expect(TDK_RULES.diacritics.forbiddenAsciiTokens.length).toBeGreaterThan(10)
  })

  it('properNouns.validBrand "Bilge Arena" icerir', () => {
    expect(TDK_RULES.properNouns.validBrand).toContain('Bilge Arena')
  })

  it('apostrophe.valid Bilge Arena ornegi icerir', () => {
    const hasBrandApostrophe = TDK_RULES.apostrophe.valid.some(v =>
      v.includes("Bilge Arena'"),
    )
    expect(hasBrandApostrophe).toBe(true)
  })
})
