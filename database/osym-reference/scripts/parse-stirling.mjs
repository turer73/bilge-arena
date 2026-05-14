/**
 * Stirling PDF çıktısından TYT sorularını parse eder.
 * Çıktı: extracted/tyt_2021_questions.json
 *
 * Stirling format özellikleri:
 *  - Section header: "2021-TYT/Bölüm BÖLÜM TESTİ" tek satırda
 *  - Soru marker: "\nN.\n" (N=1..40/25/20)
 *  - Seçenekler: markerin ÖNÜNDE; "A) B) C) D) E)" sadece placeholder
 *  - Roman seçenekler: "Yalnız I Yalnız II Yalnız III\nI ve II I, II ve III"
 *  - Numeric seçenekler: tek satırda "0,1 0,2 1 2 10"
 *
 * Kullanım: node scripts/parse-stirling.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const EXTRACTED = resolve(__dir, '..', 'extracted')
if (!existsSync(EXTRACTED)) mkdirSync(EXTRACTED, { recursive: true })

const raw = readFileSync(resolve(EXTRACTED, 'tyt_2021_stirling.txt'), 'utf8')

// ─── Cevap anahtarı ───────────────────────────────────────────────────────────
const ANSWERS = {
  turkce:    parseAnswerSection('TÜRKÇE TESTİ', 40),
  sosyal:    parseAnswerSection('SOSYAL BİLİMLER TESTİ', 25),
  matematik: parseAnswerSection('TEMEL MATEMATİK TESTİ', 40),
  fen:       parseAnswerSection('FEN BİLİMLERİ TESTİ', 20),
}

function parseAnswerSection(header, total) {
  const keyStart = raw.lastIndexOf(header)
  if (keyStart === -1) return []
  const section = raw.slice(keyStart, keyStart + 500)
  const answers = []
  const re = /(\d+)\.\s+([A-E])/g
  let m
  while ((m = re.exec(section)) !== null) {
    answers[parseInt(m[1]) - 1] = m[2]
  }
  return answers
}

// ─── Temizleme ────────────────────────────────────────────────────────────────
function cleanBlock(text) {
  return text
    .replace(/Diğer sayfaya geçiniz\.\s*\d*/g, '')
    .replace(/\d{4}-TYT\/[^\n]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, match => match.includes('\n') ? '\n' : '')
    .trim()
}

// ─── Bölüm çıkar ──────────────────────────────────────────────────────────────
function extractSection(startPat, endPat) {
  const si = raw.indexOf(startPat)
  if (si === -1) return ''
  const ei = endPat ? raw.indexOf(endPat, si) : raw.length
  return raw.slice(si, ei !== -1 ? ei : raw.length)
}

// ─── Seçenek tipi belirle ────────────────────────────────────────────────────
function classifyOptions(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean)

  // Roman numeral / Yalnız I II III pattern
  const romanLine = lines.find(l => /Yalnız\s+[IVX]+/.test(l))
  if (romanLine) {
    // Genellikle iki satır: "Yalnız I  Yalnız II  Yalnız III" ve "I ve II  I, II ve III"
    const opts = []
    for (const l of lines) {
      if (/Yalnız\s+[IVX]+/.test(l) || /[IVX]+\s+ve\s+[IVX]+/.test(l)) {
        const parts = l.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
        opts.push(...parts)
      }
    }
    return { type: 'roman', options: opts.slice(0, 5) }
  }

  // Son satırda 5 boşlukla ayrılmış değer → numeric
  const lastLine = lines[lines.length - 1] || ''
  const numParts = lastLine.split(/\s+/).filter(Boolean)
  if (numParts.length === 5 && numParts.every(p => /^[\d,./]+$/.test(p))) {
    return { type: 'numeric', options: numParts }
  }
  // İki satırda 3+2 veya 2+3
  if (lines.length >= 2) {
    const last2 = lines.slice(-2).join(' ')
    const parts2 = last2.split(/\s{2,}/).filter(Boolean)
    if (parts2.length === 5 && parts2.every(p => /^[\d,./();\s]+$/.test(p))) {
      return { type: 'numeric', options: parts2 }
    }
  }

  // Her satır nokta/virgülle biten uzun cümle → text
  const longLines = lines.filter(l => l.length > 15)
  if (longLines.length >= 5) {
    // Son 5 uzun satır seçenek, öncesi soru
    const optStart = lines.length - 5
    const candidates = lines.slice(optStart)
    // Seçenek satırları: soru satırından farklı – genellikle cümle/ifade
    return { type: 'text', options: candidates, questionLines: lines.slice(0, optStart) }
  }

  // Tablet / pair options (X / Y tablosu, iki sütunlu)
  const pairedLine = lines.find(l => /^\s*[A-Z]\w*\s{3,}[A-Z]\w*/.test(l))
  if (pairedLine) {
    return { type: 'paired', options: lines.slice(-5) }
  }

  return { type: 'unknown', options: [] }
}

// ─── Soru bloğunu parse et ───────────────────────────────────────────────────
function parseQuestionBlock(rawBlock, num, answer) {
  const block = cleanBlock(rawBlock)
  if (!block || block.length < 20) return null

  const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
  const classified = classifyOptions(block)

  let questionText = ''
  let options = classified.options

  if (classified.type === 'text') {
    questionText = classified.questionLines.join(' ').trim()
    options = classified.options
  } else if (classified.type === 'roman') {
    // Soru gövdesi: "hangileri doğrudur?" veya "hangileri yanlıştır?" satırına kadar
    const qEndIdx = lines.findLastIndex(l => /\?/.test(l) && !/Yalnız|ve III|ve II/.test(l))
    questionText = qEndIdx >= 0 ? lines.slice(0, qEndIdx + 1).join(' ').trim() : lines.slice(0, -2).join(' ').trim()
  } else if (classified.type === 'numeric') {
    // Son numeric satırı seçenek, geri kalanı soru
    const lastLine = lines[lines.length - 1]
    if (options.length === 5 && block.includes(lastLine)) {
      questionText = lines.slice(0, -1).join(' ').trim()
    } else {
      questionText = lines.slice(0, -2).join(' ').trim()
    }
  } else {
    questionText = block
  }

  // Görsel bağımlı mı?
  const imageDependent = options.length === 0

  const answerIdx = answer ? ['A','B','C','D','E'].indexOf(answer) : -1

  return {
    num,
    question: questionText.replace(/\s+/g, ' ').trim(),
    options,
    answer_letter: answer || null,
    answer: answerIdx,
    type: classified.type,
    imageDependent,
    complete: !imageDependent && questionText.length > 30,
  }
}

// ─── Bölüm soru listesi ──────────────────────────────────────────────────────
function parseSection(sectionText, answers, totalQ) {
  // Soru markerlarını bul
  const markers = []
  const re = /\n(\d+)\.\n/g
  let m
  while ((m = re.exec(sectionText)) !== null) {
    const n = parseInt(m[1])
    if (n >= 1 && n <= totalQ) {
      markers.push({ num: n, pos: m.index, end: m.index + m[0].length })
    }
  }
  markers.sort((a, b) => a.pos - b.pos)

  const questions = []

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i]
    const prev = i > 0 ? markers[i - 1] : null

    // Block: prev marker'ın "A) B) C) D) E)" kısmından cur marker'a kadar
    let blockStart = 0
    if (prev) {
      // prev marker'dan sonraki placeholder region bitişini bul
      const afterPrev = sectionText.slice(prev.end)
      const bubbleEnd = skipBubbles(afterPrev)
      blockStart = prev.end + bubbleEnd
    }

    const rawBlock = sectionText.slice(blockStart, cur.pos)
    const q = parseQuestionBlock(rawBlock, cur.num, answers[cur.num - 1])
    if (q) questions.push(q)
  }

  return questions
}

function skipBubbles(text) {
  // A) B) C) D) E) satırlarını atla
  const lines = text.split('\n')
  let charCount = 0
  let i = 0
  while (i < lines.length) {
    const l = lines[i].trim()
    if (/^[A-E]\)/.test(l) || l === '') {
      charCount += lines[i].length + 1
      i++
    } else {
      break
    }
  }
  return charCount
}

// ─── Bölüm sınırları (Stirling formatı) ──────────────────────────────────────
const SECTIONS = [
  {
    key: 'turkce',
    start: '2021-TYT/Türkçe TÜRKÇE TESTİ',
    end: 'TÜRKÇE TESTİ BİTTİ',
    total: 40,
    subcategories: ['anlama', 'dil_bilgisi'],
  },
  {
    key: 'sosyal',
    start: '2021-TYT/Sosyal Bilimler SOSYAL BİLİMLER TESTİ',
    end: 'SOSYAL BİLİMLER TESTİ BİTTİ',
    total: 25,
    subcategories: { 1: 'tarih', 6: 'cografya', 11: 'felsefe', 16: 'din' },
  },
  {
    key: 'matematik',
    start: '2021-TYT/Temel Matematik TEMEL MATEMATİK TESTİ',
    end: 'TEMEL MATEMATİK TESTİ BİTTİ',
    total: 40,
    subcategories: [],
  },
  {
    key: 'fen',
    start: '2021-TYT/Fen Bilimleri FEN BİLİMLERİ TESTİ',
    end: 'TEST BİTTİ',
    total: 20,
    subcategories: { 1: 'fizik', 8: 'kimya', 15: 'biyoloji' },
  },
]

// ─── Ana ─────────────────────────────────────────────────────────────────────
const output = { year: 2021, exam: 'TYT', source: 'Stirling PDF', sections: {} }

for (const sec of SECTIONS) {
  const sectionText = extractSection(sec.start, sec.end)
  if (!sectionText) {
    console.log(`✗ ${sec.key}: section bulunamadı`)
    continue
  }

  const answers = ANSWERS[sec.key] || []
  const questions = parseSection(sectionText, answers, sec.total)

  const complete = questions.filter(q => q.complete)
  const textBased = questions.filter(q => q.type === 'text' && q.complete)
  const romanBased = questions.filter(q => q.type === 'roman' && q.complete)
  const numericBased = questions.filter(q => q.type === 'numeric' && q.complete)

  console.log(`\n${sec.key.toUpperCase()}:`)
  console.log(`  Toplam marker: ${questions.length}, Tamamlanmış: ${complete.length}`)
  console.log(`  Text: ${textBased.length}, Roman: ${romanBased.length}, Numeric: ${numericBased.length}`)

  // Subcategory etiketle
  for (const q of questions) {
    if (typeof sec.subcategories === 'object' && !Array.isArray(sec.subcategories)) {
      const subKeys = Object.keys(sec.subcategories).map(Number).sort((a, b) => b - a)
      for (const startQ of subKeys) {
        if (q.num >= startQ) {
          q.subcategory = sec.subcategories[startQ]
          break
        }
      }
    }
  }

  output.sections[sec.key] = questions

  // İyi örnekleri bas
  const goodExamples = complete.slice(0, 5)
  for (const q of goodExamples) {
    console.log(`\n  Q${q.num} [${q.type}${q.subcategory ? '/' + q.subcategory : ''}] → ${q.answer_letter}`)
    console.log(`    Soru: ${q.question.slice(0, 120)}...`)
    console.log(`    Seçenekler: ${q.options.join(' | ')}`)
  }
}

const outPath = resolve(EXTRACTED, 'tyt_2021_questions.json')
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
console.log(`\n✓ Kaydedildi: ${outPath}`)
