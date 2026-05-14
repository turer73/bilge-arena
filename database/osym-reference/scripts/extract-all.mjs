/**
 * Tüm ÖSYM PDF'lerinden:
 * 1. Cevap anahtarını parse eder
 * 2. Bölüm metinlerini temizlenmiş hâlde çıkarır
 * 3. Bireysel sorular (iyi bulunabilenler) için best-effort extraction
 *
 * Çıktı:
 *   extracted/tyt_YYYY.json  — TYT bölüm metinleri + cevap anahtarı
 *   extracted/ydt_en_YYYY.json — YDT İngilizce sorular + cevap anahtarı
 *
 * Kullanım: node scripts/extract-all.mjs
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

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
function cleanText(text) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, ' ')
    .replace(/\d{4}-(?:TYT|YDT)\/[^\n]+\n/g, '')
    .replace(/Diğer sayfaya geçiniz\.\t?\n?/g, '')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Cevap Anahtarı Parser ────────────────────────────────────────────────────
function parseAnswerKey(text, examType) {
  const keyStart = text.lastIndexOf(
    examType === 'TYT' ? 'TEMEL YETERLİLİK TESTİ (TYT)' : 'YABANCI DİL TESTİ (YDT)'
  )
  if (keyStart === -1) return null
  const keySection = text.slice(keyStart)

  const sectionMarkers = examType === 'TYT'
    ? [
        { key: 'turkce', pats: ['TÜRKÇE TESTİ'] },
        { key: 'matematik', pats: ['TEMEL MATEMATİK TESTİ', 'MATEMATİK TESTİ'] },
        { key: 'fen', pats: ['FEN BİLİMLERİ TESTİ'] },
        { key: 'sosyal', pats: ['SOSYAL BİLİMLER TESTİ'] },
      ]
    : [
        { key: 'english', pats: ['İNGİLİZCE TESTİ', 'İNGİLİZCE'] },
      ]

  const result = {}
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
    result[key] = answers.map(a => a.answer)
  }
  return result
}

// ─── Marker Pozisyonları ──────────────────────────────────────────────────────
function findMarkers(text, total) {
  const markers = []
  for (let n = 1; n <= total; n++) {
    const patterns = [`\n${n}.\nA)`, `\n${n}.\nA) `, `${n}.\nA)`, `${n}.\nA) `]
    let found = false
    for (const pat of patterns) {
      const idx = text.indexOf(pat)
      if (idx !== -1) {
        // E) nerede? En yakın 200 karakter içinde
        const eIdx = text.indexOf('E)', idx + pat.length - 3)
        if (eIdx !== -1 && eIdx - idx < 250) {
          const eEnd = text.indexOf('\n', eIdx)
          markers.push({
            num: n,
            start: idx + (pat.startsWith('\n') ? 1 : 0), // "\n" atla
            end: eEnd !== -1 ? eEnd + 1 : eIdx + 3,
          })
          found = true
          break
        }
      }
    }
    if (!found) markers.push({ num: n, start: -1, end: -1 })
  }
  return markers
}

// ─── TYT Bölüm Metni Çıkar ────────────────────────────────────────────────────
function extractTYTSections(text) {
  const defs = [
    { key: 'turkce', start: 'TÜRKÇE TESTİ\n1. Bu testte', end: 'TEMEL MATEMATİK TESTİNE GEÇİNİZ' },
    { key: 'matematik', start: 'TEMEL MATEMATİK TESTİ\n1. Bu testte', end: 'FEN BİLİMLERİ TESTİNE GEÇİNİZ' },
    { key: 'fen', start: 'FEN BİLİMLERİ TESTİ\n1. Bu testte', end: 'SOSYAL BİLİMLER TESTİNE GEÇİNİZ' },
    { key: 'sosyal', start: 'SOSYAL BİLİMLER TESTİ\n1. Bu testte', end: 'TEST BİTTİ' },
  ]
  const result = {}
  for (const d of defs) {
    const si = text.indexOf(d.start)
    if (si === -1) continue
    const ei = text.indexOf(d.end, si)
    result[d.key] = cleanText(ei !== -1 ? text.slice(si, ei) : text.slice(si, si + 50000))
  }
  return result
}

// ─── YDT Soru Extraction ──────────────────────────────────────────────────────
/**
 * YDT İngilizce'de sorular genellikle gruplar hâlinde gelir (3-4 soru/sayfa kolonu).
 * Her soru: [question_stem][\n][5 options in 2+2+1 or 1+1+1+1+1 format]
 *
 * Approach: cevap sayısına göre marker'ları bul, her marker bloğunu extract et.
 * Sonra bloğu içinde birden fazla soru varsa hepsini ayır.
 */
function extractYDTQuestions(text, answers) {
  const cleaned = cleanText(text)
  const total = answers.length
  const markers = findMarkers(cleaned, total)

  const questions = []

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i]
    if (cur.start === -1) continue

    // Body: bu marker'dan önceki içerik (prev marker end → this marker start)
    const prevEnd = i > 0 && markers[i - 1].end !== -1 ? markers[i - 1].end : 0
    const body = cleaned.slice(prevEnd, cur.start).trim()

    // Marker'dan sonraki içerik (next group - body'nin SONRASI da olabilir)
    // YDT'de bazen body marker'dan ÖNCE, bazen SONRA gelir
    const nextStart = cur.end
    const nextMarkerStart = i + 1 < markers.length && markers[i + 1].start !== -1
      ? markers[i + 1].start : cleaned.length
    const bodyAfter = cleaned.slice(nextStart, nextMarkerStart).trim()

    // Hangisi gerçek içerik? Daha uzun olan.
    const actualBody = body.length > bodyAfter.length ? body : bodyAfter

    if (actualBody.length < 20) continue

    // Seçenekler ayrı satırlarda mı, tab'lı mı?
    const lines = actualBody.split('\n').filter(l => l.trim())

    // Tab-separated options (vocabulary/cloze): 3 satır, 2+2+1 veya 1+1+1+1+1
    const tabLines = lines.filter(l => l.includes('\t') || /^[a-z]+ {2,}[a-z]+$/i.test(l))
    const hasTabOpts = tabLines.length >= 2

    // Uzun cümle options (sentence completion, grammar):
    // 5 satır, her biri tam cümle gibi
    const longLines = lines.filter(l => l.trim().length > 20)

    // Option detection: son 2-3 satırda tab-separated = vocabulary
    const lastLines = lines.slice(-3)
    const isVocab = lastLines.some(l => l.includes('\t'))

    // Option extraction
    let questionText = actualBody
    let options = []

    if (isVocab || hasTabOpts) {
      // Tab-separated: son 3 satır options, geri kalanı question
      const optLines = []
      const qLines = []
      let inOpts = false
      for (let li = lines.length - 1; li >= 0; li--) {
        const l = lines[li]
        if (!inOpts && (l.includes('\t') || optLines.length > 0 && optLines.length < 3)) {
          optLines.unshift(l)
          if (optLines.length >= 3) inOpts = true
        } else {
          qLines.unshift(l)
        }
      }
      questionText = qLines.join(' ').trim()
      // Tab-split options
      const flatOpts = optLines.flatMap(l => l.split('\t').map(s => s.trim())).filter(Boolean)
      options = flatOpts.slice(0, 5)
    } else if (longLines.length >= 5) {
      // Uzun satırlar = muhtemelen şıklar
      // Son 5+ satır options, öncesi soru
      const cutIdx = Math.max(0, lines.length - 5)
      questionText = lines.slice(0, cutIdx).join(' ').trim()
      options = lines.slice(cutIdx).map(l => l.trim()).filter(Boolean).slice(0, 5)
    }

    const q = {
      num: cur.num,
      question: questionText.replace(/\s+/g, ' ').trim(),
      options,
      answer: answers[cur.num - 1] || null,
      imageDependent: options.length === 0,
    }

    if (q.question.length > 15) questions.push(q)
  }

  return questions
}

// ─── YDT Bölüm Metni Çıkar ────────────────────────────────────────────────────
function extractYDTSectionText(text) {
  const start = text.indexOf('İNGİLİZCE TESTİ\nBu testte')
    || text.indexOf('Bu testte 80 soru')
  if (start === -1) return cleanText(text)
  const endCevap = text.lastIndexOf('YABANCI DİL TESTİ (YDT)')
  return cleanText(endCevap !== -1 ? text.slice(start, endCevap) : text.slice(start))
}

// ─── Ana ─────────────────────────────────────────────────────────────────────
for (const pdf of OSYM_PDFS) {
  const filePath = `${PDF_DIR}/${pdf.filename}`
  if (!existsSync(filePath)) {
    console.log(`✗ ${pdf.year} ${pdf.exam} — dosya yok`)
    continue
  }

  // Boş dosyayı atla
  const stats = readFileSync(filePath)
  if (stats.length < 1000) {
    console.log(`✗ ${pdf.year} ${pdf.exam} — boş dosya`)
    continue
  }

  console.log(`\nProcessing: ${pdf.year} ${pdf.exam} ${pdf.lang.toUpperCase()} — ${pdf.filename}`)

  const parser = new PDFParse({ data: new Uint8Array(stats) })
  let result
  try {
    result = await parser.getText()
  } catch (e) {
    console.log(`  ✗ PDF parse hatası: ${e.message}`)
    await parser.destroy()
    continue
  }
  await parser.destroy()

  const text = result.text

  if (pdf.exam === 'TYT') {
    const answerKey = parseAnswerKey(text, 'TYT')
    if (!answerKey) { console.log('  ✗ Cevap anahtarı bulunamadı'); continue }

    const sections = extractTYTSections(text)

    const output = {
      year: pdf.year,
      exam: 'TYT',
      source: pdf.url,
      note: 'section_text = ham bölüm metni (soru + şıklar + cevap anahtarı hariç)',
      answerKey,
      sections: {},
    }

    for (const [key, sectionText] of Object.entries(sections)) {
      const answers = answerKey[key] || []
      output.sections[key] = {
        total: answers.length,
        rawText: sectionText,
      }
      console.log(`  ${key}: ${answers.length} soru, metin: ${sectionText.length} karakter`)
    }

    const outPath = `${OUT_DIR}/tyt_${pdf.year}.json`
    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
    console.log(`  ✓ Kaydedildi: ${outPath}`)

  } else if (pdf.exam === 'YDT' && pdf.lang === 'en') {
    const answerKey = parseAnswerKey(text, 'YDT')
    if (!answerKey) { console.log('  ✗ Cevap anahtarı bulunamadı'); continue }

    const answers = answerKey.english || []
    const sectionText = extractYDTSectionText(text)
    const questions = extractYDTQuestions(sectionText, answers)

    const complete = questions.filter(q => !q.imageDependent && q.question.length > 30 && q.options.length >= 5)
    console.log(`  Sorular: ${answers.length} cevap, ${questions.length} extract, ${complete.length} text-complete`)

    const output = {
      year: pdf.year,
      exam: 'YDT',
      lang: 'en',
      source: pdf.url,
      answerKey: answers,
      totalQuestions: answers.length,
      questions,
    }

    const outPath = `${OUT_DIR}/ydt_en_${pdf.year}.json`
    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
    console.log(`  ✓ Kaydedildi: ${outPath}`)
  }
}

console.log('\nTamamlandı.')
