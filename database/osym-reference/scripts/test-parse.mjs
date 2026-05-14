/**
 * Tüm ÖSYM PDF'lerinin text-based olup olmadığını test eder
 * pdf-parse v2 API (PDFParse class)
 */
import { PDFParse } from 'pdf-parse'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OSYM_PDFS } from './urls.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const PDF_DIR = resolve(__dir, '..', 'pdfs')

const targetFile = process.argv[2] // optional: test single file

const targets = targetFile
  ? OSYM_PDFS.filter(p => p.filename === targetFile)
  : OSYM_PDFS

for (const pdf of targets) {
  const filePath = `${PDF_DIR}/${pdf.filename}`
  if (!existsSync(filePath)) {
    console.log(`✗ ${pdf.year} ${pdf.exam} ${pdf.lang} — dosya yok: ${pdf.filename}`)
    continue
  }
  try {
    const buf = readFileSync(filePath)
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const result = await parser.getText()
    const textLen = result.text.trim().length
    const textBased = textLen > 500
    const hasCevapAnahtari = result.text.includes('CEVAP') ||
      /\d+\.\s+[A-E]\n/.test(result.text)
    console.log(`${textBased ? '✓' : '✗'} ${pdf.year} ${pdf.exam} ${pdf.lang.toUpperCase()} — ${pdf.filename}`)
    console.log(`   Sayfa: ${result.total}, Metin: ${textLen} karakter, Text-based: ${textBased ? 'EVET' : 'HAYIR'}, Cevap anahtarı: ${hasCevapAnahtari ? 'VAR' : 'YOK'}`)
    await parser.destroy()
  } catch (e) {
    console.log(`✗ ${pdf.year} ${pdf.exam} ${pdf.lang} — HATA: ${e.message}`)
  }
}

// Detaylı önizleme: sadece tek dosya modunda
if (targetFile && targets.length === 1) {
  const pdf = targets[0]
  const filePath = `${PDF_DIR}/${pdf.filename}`
  if (existsSync(filePath)) {
    const buf = readFileSync(filePath)
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const result = await parser.getText()
    console.log('\n--- İlk 2000 karakter ---')
    console.log(result.text.slice(0, 2000))
    console.log('\n--- Son 1500 karakter ---')
    console.log(result.text.slice(-1500))
    await parser.destroy()
  }
}
