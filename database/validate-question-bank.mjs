#!/usr/bin/env node
/**
 * Soru Bankası Kalite Validatörü
 * ============================================================================
 * data/soru-bankasi/ altındaki TÜM soru dosyalarını (TYT + WordQuest, düz +
 * nested cloze/dialogue + full 3-seviye) tarar ve kalite anomalilerini yakalar.
 *
 * Eski database/audit-validate.mjs'in yerini alır (o: hardcoded tek-dosya girdi,
 * casefold-dup FALSE-POSITIVE, test/CI entegrasyonu yok).
 *
 * KRITIK KONTROL — solution↔answer tutarlılığı:
 *   Sayısal sorularda `solution` alanındaki nihai değer, işaretli şık
 *   `options[answer]` ile eşleşmeli. Denetimde bulunan hata sınıfı: solution
 *   doğru sonucu yazıyor ama `answer` indeksi yanlış şıka işaret ediyor
 *   (örn. fen_f024: solution "420.000" ama answer→"210.000").
 *
 * FP-GÜVENLİĞİ:
 *   - dup-option EXACT (case-sensitive, trim). casefold KULLANILMAZ — yazım/
 *     büyük-harf (tr_y001) ve genotip (fen_b009 "TT×tt" vs "tt×tt") soruları
 *     tam da bu farkı test eder; casefold onları yanlış "dup" sanar.
 *   - solution-answer kontrolü yalnız SAYISAL sorularda + tek-eşleşmede ERROR.
 *
 * Kullanım:
 *   node database/validate-question-bank.mjs            # rapor + exit-code
 *   node database/validate-question-bank.mjs --json     # sadece JSON rapor
 * Vitest: import { validateQuestionBank } from '.../validate-question-bank.mjs'
 *
 * Çıkış kodu: ERROR varsa 1, yoksa 0.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '..', 'data', 'soru-bankasi')

const MOJIBAKE = ['Ã¼', 'Ã§', 'Ã¶', 'ÅŸ', 'ÄŸ', 'Ä±', 'Ã‡', 'Ã–', 'Ãœ', 'Åž', 'Ä°', 'â€™', 'â€œ', 'â€“', 'â€”', 'Ã¢', 'Ã©', 'ï¿½']

// ── Sayı/oran/yüzde token çıkarımı (Türkçe format: 420.000 / 67,5 / %20 / 5:1)
// Normalizasyon: iç boşluk sil, unicode-minus'u ASCII'ye çevir.
function normNum(s) {
  return String(s).replace(/−/g, '-').replace(/\s+/g, '').trim()
}
// Bir string sayısal-token mı (yüzde/oran/ondalık dahil)?
const NUM_TOKEN = /^%?-?\d[\d.,]*(?::-?\d[\d.,]*)?%?$/
export function isNumericOption(o) {
  return NUM_TOKEN.test(normNum(o))
}
// solution metninden nihai cevap token'ını çıkar: nihai cevap NEREDEYSE HER ZAMAN
// çözümdeki SON sayı-token'ıdır ("... = 61", "→ 60 cm", "2 mol CO₂"). İlk-sayı
// almak FP üretir (ara-adım): fen_k079 "1 mol → 2 mol" nihai=2, ilk=1 (yanlış).
// Bu heuristik yine de FP üretebilir (cevap türetilmiş/farklı-birim) -> bu yüzden
// solution_answer_mismatch WARN'dır, ERROR/auto-fix DEĞİL.
const NUM_G = /%?-?\d[\d.,]*(?::-?\d[\d.,]*)?%?/g
export function extractSolutionValue(sol) {
  if (!sol) return null
  const s = normNum(sol)
  const all = s.match(NUM_G)
  if (!all || !all.length) return null
  // Son token = nihai cevap. Sondaki cümle-noktalamasını (. , :) temizle, % koru.
  return all[all.length - 1].replace(/[.,:]+$/, '')
}

function checkEncoding(s) {
  const out = []
  for (const m of MOJIBAKE) if (s.includes(m)) out.push(`mojibake:${m}`)
  if (s.includes('�')) out.push('replacement_char')
  for (const ch of s) {
    const code = ch.codePointAt(0)
    if (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r') { out.push(`ctrl:U+${code.toString(16)}`); break }
  }
  return out
}

// Tüm dosyalardan normalize edilmiş soru kaydı üret.
function* iterRecords(dir) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'soru-deposu-schema.json') continue
    const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    yield* walk(d, f, '')
  }
}
function* walk(node, file, prefix) {
  if (Array.isArray(node)) {
    for (const q of node) {
      if (!q || typeof q !== 'object') continue
      const id = q.id ?? q.number ?? '?'
      const loc = `${file}:${prefix}:${id}`
      // nested passage/dialogue: passage/dialogue + questions[]
      if (Array.isArray(q.questions)) {
        for (const sub of q.questions) {
          yield {
            file, section: prefix, id: `${id}#${sub.number ?? '?'}`, loc: `${loc}#${sub.number ?? '?'}`,
            text: '[NESTED]', options: sub.options ?? [], answer: sub.answer, solution: '', raw: sub, nested: true,
          }
        }
        continue
      }
      yield {
        file, section: prefix, id, loc,
        text: q.question ?? q.sentence ?? (Array.isArray(q.dialogue) ? '[DIALOGUE]' : ''),
        options: q.options ?? [], answer: q.answer, solution: q.solution ?? '', raw: q, nested: false,
      }
    }
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'meta' || k === '_meta') continue
      yield* walk(v, file, prefix ? `${prefix}/${k}` : k)
    }
  }
}

export function validateQuestionBank(dir = DEFAULT_DIR) {
  const errors = []
  const warnings = []
  const stats = { total: 0, files: {}, byCheck: {} }
  const seenIds = new Map()

  const addErr = (check, loc, msg, extra) => {
    errors.push({ check, loc, msg, ...extra })
    stats.byCheck[check] = (stats.byCheck[check] || 0) + 1
  }
  const addWarn = (check, loc, msg, extra) => {
    warnings.push({ check, loc, msg, ...extra })
    stats.byCheck[`W:${check}`] = (stats.byCheck[`W:${check}`] || 0) + 1
  }

  for (const r of iterRecords(dir)) {
    stats.total++
    stats.files[r.file] = (stats.files[r.file] || 0) + 1
    const opts = Array.isArray(r.options) ? r.options : null

    // cross-file dup id (redundancy — WARN)
    if (r.raw?.id) {
      if (seenIds.has(r.raw.id)) addWarn('dup_id', r.loc, `id tekrar (ilk: ${seenIds.get(r.loc) ?? seenIds.get(r.raw.id)})`)
      else seenIds.set(r.raw.id, r.loc)
    }

    // boş metin (nested/dialogue muaf)
    if (!r.nested && r.text !== '[DIALOGUE]' && (!r.text || !String(r.text).trim())) {
      addErr('empty_text', r.loc, 'soru metni boş')
    }

    if (!opts) { addErr('options_not_array', r.loc, `options dizi değil: ${typeof r.options}`); continue }

    // seçenek sayısı
    if (opts.length !== 5) addErr('option_count', r.loc, `${opts.length} seçenek (5 beklenir)`)
    // boş seçenek
    opts.forEach((o, i) => { if (!String(o).trim()) addErr('empty_option', r.loc, `boş şık idx${i}`) })
    // EXACT dup (case-sensitive, FP-güvenli)
    const trimmed = opts.map((o) => String(o).trim())
    const dup = trimmed.filter((o, i) => trimmed.indexOf(o) !== i)
    if (dup.length) addErr('dup_option_exact', r.loc, `birebir aynı şık: ${JSON.stringify([...new Set(dup)])}`)

    // answer index
    if (!Number.isInteger(r.answer)) addErr('bad_answer', r.loc, `answer tam sayı değil: ${JSON.stringify(r.answer)}`)
    else if (r.answer < 0 || r.answer >= opts.length) addErr('answer_oor', r.loc, `answer=${r.answer} / ${opts.length} şık`)

    // encoding
    const blob = [r.text, ...opts, r.solution, r.raw?.meaning_tr ?? ''].map(String).join(' ')
    const enc = checkEncoding(blob)
    if (enc.length) addErr('encoding', r.loc, enc.join(','))

    // ── KRITIK: solution ↔ answer sayısal tutarlılık ──────────────────────
    // Yalnız SAYISAL soru (şıkların çoğu sayı) + solution'da parse edilebilir
    // nihai değer varsa uygula. FP'den kaçınmak için tek-eşleşme şartı.
    if (Number.isInteger(r.answer) && r.answer >= 0 && r.answer < opts.length && r.solution) {
      const numericCount = opts.filter(isNumericOption).length
      if (numericCount >= 3) {
        const solVal = extractSolutionValue(r.solution)
        if (solVal) {
          const matches = []
          opts.forEach((o, i) => { if (normNum(o) === solVal) matches.push(i) })
          if (matches.length === 1) {
            if (matches[0] !== r.answer) {
              // WARN (ERROR/CI-block DEĞİL): heuristik FP üretebilir — solution'ın
              // son-sayısı bazen ara-adım/farklı-birim (fen_k031 "He hariç 2"),
              // ya da answer doğru solution-metni yanlış (fen_f076). Her aday
              // LLM/insan onayı ister; suggested_answer KÖRLEMESİNE uygulanmaz.
              addWarn('solution_answer_mismatch', r.loc,
                `solution "${solVal}" -> şık idx${matches[0]} ("${opts[matches[0]]}") ama answer=${r.answer} ("${opts[r.answer]}")`,
                { suggested_answer: matches[0] })
            }
          } else if (matches.length === 0) {
            // solution'ın nihai değeri HİÇBİR şıkta yok -> bozuk soru şüphesi
            addWarn('solution_value_not_in_options', r.loc,
              `solution değeri "${solVal}" şıklarda yok (bozuk soru? doğru cevap eksik?)`)
          }
        }
      }
    }
  }

  return { errors, warnings, stats }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const jsonOnly = process.argv.includes('--json')
  const { errors, warnings, stats } = validateQuestionBank()
  if (jsonOnly) {
    console.log(JSON.stringify({ stats, errors, warnings }, null, 2))
  } else {
    console.log(`Soru bankası: ${stats.total} kayıt, ${Object.keys(stats.files).length} dosya`)
    for (const [f, n] of Object.entries(stats.files)) console.log(`  ${f.padEnd(34)} ${n}`)
    console.log(`\nERROR: ${errors.length} | WARN: ${warnings.length}`)
    console.log('\nKontrol dağılımı:')
    for (const [k, v] of Object.entries(stats.byCheck).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${v}`)
    if (errors.length) {
      console.log('\n── ERRORS ──')
      for (const e of errors) console.log(`  [${e.check}] ${e.loc}\n     ${e.msg}`)
    }
    if (warnings.length) {
      console.log('\n── WARNINGS (ilk 20) ──')
      for (const w of warnings.slice(0, 20)) console.log(`  [${w.check}] ${w.loc}: ${w.msg}`)
      if (warnings.length > 20) console.log(`  ... +${warnings.length - 20} daha`)
    }
  }
  process.exit(errors.length > 0 ? 1 : 0)
}
