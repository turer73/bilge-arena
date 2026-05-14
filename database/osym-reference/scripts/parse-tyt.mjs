/**
 * TYT PDF'lerini parse eder.
 * Her yıl için: soru metni + şıklar + cevap anahtarı → JSON
 *
 * Kullanım: node scripts/parse-tyt.mjs [year]
 *   year: 2018 | 2019 | 2021 (2020 indirilemedi)
 *
 * Çıktı: extracted/tyt_YYYY.json
 */

import { PDFParse } from 'pdf-parse'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OSYM_PDFS } from './urls.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const PDF_DIR = resolve(__dir, '..', 'pdfs')
const OUT_DIR = resolve(__dir, '..', 'extracted')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const yearArg = process.argv[2] ? Number(process.argv[2]) : null

const targets = OSYM_PDFS
  .filter(p => p.exam === 'TYT')
  .filter(p => !yearArg || p.year === yearArg)
  .filter(p => existsSync(`${PDF_DIR}/${p.filename}`))

// ─── Sayfa ayrıcılarını temizle ───────────────────────────────────────────────
function cleanText(text) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '')  // -- N of M --
    .replace(/\d{4}-TYT\/[^\n]+\n/g, '')         // "2019-TYT/Türkçe" başlıkları
    .replace(/Diğer sayfaya geçiniz\.\t?\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Cevap anahtarı parser ───────────────────────────────────────────────────
function parseAnswerKey(text) {
  // Son kısım cevap anahtarı bölümünü içerir
  const keyStart = text.lastIndexOf('TEMEL YETERLİLİK TESTİ (TYT)')
  if (keyStart === -1) return null
  const keySection = text.slice(keyStart)

  const sections = { turkce: [], matematik: [], fen: [], sosyal: [] }

  const sectionMarkers = [
    { key: 'turkce', pats: ['TÜRKÇE TESTİ'] },
    { key: 'matematik', pats: ['TEMEL MATEMATİK TESTİ', 'MATEMATİK TESTİ'] },
    { key: 'fen', pats: ['FEN BİLİMLERİ TESTİ', 'FEN TESTİ'] },
    { key: 'sosyal', pats: ['SOSYAL BİLİMLER TESTİ', 'SOSYAL TESTİ'] },
  ]

  const positions = []
  for (const sm of sectionMarkers) {
    for (const pat of sm.pats) {
      const idx = keySection.indexOf(pat)
      if (idx !== -1) { positions.push({ key: sm.key, idx }); break }
    }
  }
  positions.sort((a, b) => a.idx - b.idx)

  for (let i = 0; i < positions.length; i++) {
    const { key, idx } = positions[i]
    const nextIdx = i + 1 < positions.length ? positions[i + 1].idx : keySection.length
    const sectionText = keySection.slice(idx, nextIdx)
    const answerPat = /^\s*(\d+)\.\s+([A-E]|İPTAL)\s*$/gm
    const answers = []
    let m
    while ((m = answerPat.exec(sectionText)) !== null) {
      answers.push({ num: parseInt(m[1]), answer: m[2] })
    }
    answers.sort((a, b) => a.num - b.num)
    sections[key] = answers.map(a => a.answer)
  }
  return sections
}

// ─── Bölüm sınırlarını bul ────────────────────────────────────────────────────
function extractSectionText(fullText, startPat, endPat) {
  const si = fullText.indexOf(startPat)
  if (si === -1) return null
  const ei = endPat ? fullText.indexOf(endPat, si + startPat.length) : -1
  return ei !== -1 ? fullText.slice(si, ei) : fullText.slice(si)
}

// ─── Soru marker pozisyonlarını bul ──────────────────────────────────────────
/**
 * Soru numarası marker'larını bul.
 * Format: "\nN.\nA) ..." (N = soru no, ardından A) şık indikatörleri)
 *
 * Farklı formlar:
 *   "1.\nA) B) C) D) E)\n"       — tek satır (görsel veya Roma rakamı)
 *   "1.\nA) B)\nC) D)\nE)\n"     — 2x2 grid (görsel)
 *   "1.\nA) B) C)\nD) E)\n"      — 3+2 (görsel)
 *   "1.\nA)\nB)\nC)\nD)\nE)\n"   — her şık ayrı satırda
 */
function findQuestionMarkers(sectionText, totalQuestions) {
  const markers = []

  for (let n = 1; n <= totalQuestions; n++) {
    // "N.\nA)" pattern - n sonrası \n, ardından A)
    const searchStr = `\n${n}.\nA)`
    const idx = sectionText.indexOf(searchStr)
    if (idx === -1) {
      // Alternatif: bazı yıllarda "N.\nA) B)" veya "N.\n A)"
      const altStr = `${n}.\nA)`
      const altIdx = sectionText.indexOf(altStr)
      if (altIdx !== -1) markers.push({ num: n, idx: altIdx, len: altStr.length })
      continue
    }

    // Marker sonunu bul: E)'dan sonra \n
    const markerStart = idx + 1 // "\n" yi atla
    // E) sonrasını bul
    const afterNum = sectionText.indexOf('\n', markerStart + `${n}.\n`.length)
    if (afterNum === -1) continue

    // E) nerede?
    const eIdx = sectionText.indexOf('E)', markerStart)
    if (eIdx === -1 || eIdx > markerStart + 200) continue // çok uzakta ise geçersiz
    const eEnd = sectionText.indexOf('\n', eIdx) + 1

    markers.push({
      num: n,
      idx: markerStart,
      markerEnd: eEnd > 0 ? eEnd : eIdx + 3,
    })
  }

  markers.sort((a, b) => a.idx - b.idx)
  return markers
}

// ─── Bir soru bloğunu parse et ────────────────────────────────────────────────
function parseQuestionBlock(body, num, answer) {
  if (!body || body.trim().length < 10) return null

  const trimmed = body.trim()

  // Şık formatını belirle:
  // 1. "A)\ntext\nB)\ntext\n..." — şık metinleri var
  // 2. "A) B) C)\tD) E)" — tek satır/tab (görsel veya Roma rakamı)
  // 3. "Yalnız I\tYalnız II\t..." — Roma rakamı varyantları

  // Şık metni var mı? Son 3 paragraf "A)" ile başlıyorsa
  const lines = trimmed.split('\n')
  const optionStartIdxs = []
  for (let i = 0; i < lines.length; i++) {
    if (/^[A-E]\)\s*$/.test(lines[i]) || /^[A-E]\)\s+\S/.test(lines[i])) {
      optionStartIdxs.push(i)
    }
  }

  // Eğer A-E şık satırları varsa metin-tabanlı soru
  if (optionStartIdxs.length >= 5) {
    // Soru gövdesi: A)'ya kadar olan kısım
    const firstOptLine = optionStartIdxs[0]
    const questionText = lines.slice(0, firstOptLine).join('\n').trim()
    const optionLines = lines.slice(firstOptLine)

    const options = []
    let cur = null
    for (const line of optionLines) {
      if (/^[A-E]\)/.test(line)) {
        if (cur) options.push(cur)
        cur = { letter: line[0], text: line.slice(2).trim() }
      } else if (cur) {
        cur.text += (cur.text ? ' ' : '') + line.trim()
      }
    }
    if (cur) options.push(cur)

    return {
      num,
      question: questionText,
      options: options.map(o => o.text).filter(Boolean),
      answer,
      imageDependent: false,
      complete: options.length === 5 && questionText.length > 20,
    }
  }

  // Roma rakamı seçenekler (Yalnız I, I ve II, vs.)
  const romanOptLine = lines.find(l => /Yalnız\s+[IVX]+/.test(l) || /^\s*I\s+II\s+III/.test(l))
  if (romanOptLine) {
    const opts = romanOptLine.split(/\t+/).map(s => s.trim()).filter(Boolean)
    // Soru gövdesi: roman opt satırına kadar
    const roIdx = lines.indexOf(romanOptLine)
    const questionText = lines.slice(0, roIdx).join('\n').trim()
    return {
      num,
      question: questionText,
      options: opts,
      answer,
      imageDependent: false,
      complete: opts.length >= 5 && questionText.length > 20,
    }
  }

  // Görsel bağımlı (seçenek metni yok)
  return {
    num,
    question: trimmed,
    options: [],
    answer,
    imageDependent: true,
    complete: false,
  }
}

// ─── Bir bölümü tam parse et ──────────────────────────────────────────────────
function parseSection(sectionText, answers) {
  if (!sectionText) return { total: answers.length, parsed: 0, textComplete: 0, questions: [] }

  const cleaned = cleanText(sectionText)
  const total = answers.length
  const markers = findQuestionMarkers(cleaned, total)

  const questions = []

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const prevMarkerEnd = i > 0 ? markers[i - 1].markerEnd : 0
    const body = cleaned.slice(prevMarkerEnd, marker.idx).trim()
    const q = parseQuestionBlock(body, marker.num, answers[marker.num - 1] || null)
    if (q) questions.push(q)
  }

  const textComplete = questions.filter(q => q.complete)
  return {
    total,
    parsed: questions.length,
    textComplete: textComplete.length,
    questions,
  }
}

// ─── Ana işlem ────────────────────────────────────────────────────────────────
for (const pdf of targets) {
  const filePath = `${PDF_DIR}/${pdf.filename}`
  console.log(`\nParse ediliyor: ${pdf.year} TYT — ${pdf.filename}`)

  const buf = readFileSync(filePath)
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  const result = await parser.getText()
  const text = result.text
  await parser.destroy()

  const answerKey = parseAnswerKey(text)
  if (!answerKey) {
    console.log('  ✗ Cevap anahtarı bulunamadı!')
    continue
  }
  console.log(`  Cevap anahtarı: türkçe=${answerKey.turkce.length}, matematik=${answerKey.matematik.length}, fen=${answerKey.fen.length}, sosyal=${answerKey.sosyal.length}`)

  const sectionDefs = [
    { key: 'turkce', start: 'TÜRKÇE TESTİ\n1. Bu testte', end: 'TEMEL MATEMATİK TESTİNE GEÇİNİZ' },
    { key: 'matematik', start: 'TEMEL MATEMATİK TESTİ\n1. Bu testte', end: 'FEN BİLİMLERİ TESTİNE GEÇİNİZ' },
    { key: 'fen', start: 'FEN BİLİMLERİ TESTİ\n1. Bu testte', end: 'SOSYAL BİLİMLER TESTİNE GEÇİNİZ' },
    { key: 'sosyal', start: 'SOSYAL BİLİMLER TESTİ\n1. Bu testte', end: 'TEST BİTTİ' },
  ]

  const output = { year: pdf.year, exam: 'TYT', source: pdf.url, sections: {} }

  for (const def of sectionDefs) {
    const sectionText = extractSectionText(text, def.start, def.end)
    const answers = answerKey[def.key] || []
    const parsed = parseSection(sectionText, answers)
    output.sections[def.key] = parsed
    console.log(`  ${def.key}: ${answers.length} cevap, ${parsed.parsed} parse, ${parsed.textComplete} text-complete`)
  }

  const outPath = `${OUT_DIR}/tyt_${pdf.year}.json`
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
  console.log(`  ✓ Kaydedildi: ${outPath}`)
}

console.log('\nTamamlandı.')
