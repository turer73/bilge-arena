/**
 * LGS JSON batch dosyalarını DB'ye import eder.
 * Kullanım: node --env-file=.env.local database/import-lgs-batch.mjs <dosya.json>
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !SB_KEY) { console.error('ENV eksik'); process.exit(1) }

const supabase = createClient(SB_URL, SB_KEY)

const filePath = process.argv[2]
if (!filePath) { console.error('Kullanım: node import-lgs-batch.mjs <dosya.json>'); process.exit(1) }

const questions = JSON.parse(readFileSync(resolve(filePath), 'utf8'))
console.log(`Dosya: ${filePath}`)
console.log(`Soru sayısı: ${questions.length}`)

// Türkçe karakter kontrolü
const turkishChars = /[çğıöşüÇĞİÖŞÜ]/
const withTurkish = questions.filter(q =>
  turkishChars.test(q.content.question) ||
  q.content.options.some(o => turkishChars.test(o)) ||
  turkishChars.test(q.content.solution || '')
)
console.log(`Türkçe karakter içeren: ${withTurkish.length}/${questions.length} ✓`)

// Örnek göster
console.log('\n── İlk soru önizleme ──')
const first = questions[0]
console.log(`Konu: ${first.topic}`)
console.log(`Soru: ${first.content.question}`)
console.log(`Seçenekler: ${first.content.options.join(' | ')}`)
console.log(`Cevap: ${first.content.options[first.content.answer]} (index: ${first.content.answer})`)
console.log(`Açıklama: ${first.content.solution}`)
console.log(`exam_ref: ${first.exam_ref}, difficulty: ${first.difficulty}`)

// DB'ye ekle
const { data, error } = await supabase.from('questions').insert(questions).select('id')
if (error) {
  console.error('\n✗ DB hata:', error.message)
  process.exit(1)
}
console.log(`\n✓ Eklendi: ${data.length} soru (is_active=false, exam_ref=${first.exam_ref ?? 'null'})`)
console.log('IDs:', data.map(d => d.id).join(', '))
