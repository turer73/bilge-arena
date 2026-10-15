/**
 * Yeni, pasif LGS sorularının paket doğrulaması ve açık onaylı içe aktarımı.
 * Varsayılan kuru çalışma, ortam anahtarı veya ağ bağlantısı gerektirmez:
 *   node database/import-lgs-batch.mjs <dosya.json>
 *   node --env-file=.env.local database/import-lgs-batch.mjs <dosya.json> --apply
 * Mevcut sorular için kullanmayın: değişmez revizyon akışını kullanın.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { isMainModule, validateLgsBatch } from './lib/lgs-question-contract.mjs'

export async function importLgsBatch(questions, { apply = false, env = process.env, clientFactory = createClient } = {}) {
  const errors = validateLgsBatch(questions)
  if (errors.length) throw new Error(`Paket reddedildi; hiçbir kayıt gönderilmedi:\n${errors.join('\n')}`)
  if (!apply) return { dryRun: true, questions: questions.length, inserted: 0 }

  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('ENV eksik')
  const rows = questions.map(q => ({ ...q, exam_ref: 'LGS', is_active: false }))
  const client = clientFactory(url, key)
  // One insert for the fully validated batch, never a partial per-row loop.
  const { data, error } = await client.from('questions').insert(rows).select('id')
  if (error) throw new Error(`DB hata: ${error.message}`)
  if (!Array.isArray(data) || data.length !== rows.length) throw new Error('İçe aktarım geri okuması beklenen sayıda değil; körlemesine tekrar çalıştırmayın')
  return { dryRun: false, questions: rows.length, inserted: data.length, ids: data.map(q => q.id) }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const paths = argv.filter(a => !a.startsWith('--'))
  if (paths.length !== 1 || argv.some(a => a.startsWith('--') && a !== '--apply')) {
    throw new Error('Kullanım: node database/import-lgs-batch.mjs <dosya.json> [--apply]')
  }
  const questions = JSON.parse(readFileSync(resolve(paths[0]), 'utf8'))
  const result = await importLgsBatch(questions, { ...deps, apply: argv.includes('--apply') })
  console.log(JSON.stringify(result, null, 2))
  return result
}

if (isMainModule(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
