/**
 * ÖSYM PDF'lerini indir
 * Kullanım: node scripts/download.mjs [tyt|ydt|all]
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import http from 'node:http'
import { OSYM_PDFS } from './urls.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const PDF_DIR = resolve(__dir, '..', 'pdfs')
if (!existsSync(PDF_DIR)) mkdirSync(PDF_DIR, { recursive: true })

const filter = process.argv[2] || 'all'

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (existsSync(dest) && statSync(dest).size > 1000) {
      console.log(`  ✓ zaten var: ${dest.split('/').pop()}`)
      return resolve()
    }
    const proto = url.startsWith('https') ? https : http
    const file = createWriteStream(dest)
    proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        return download(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', err => { file.close(); reject(err) })
  })
}

const targets = filter === 'all' ? OSYM_PDFS
  : filter === 'tyt' ? OSYM_PDFS.filter(p => p.exam === 'TYT')
  : filter === 'ydt' ? OSYM_PDFS.filter(p => p.exam === 'YDT')
  : OSYM_PDFS

console.log(`İndirilecek: ${targets.length} PDF (filtre: ${filter})`)
for (const pdf of targets) {
  const dest = `${PDF_DIR}/${pdf.filename}`
  process.stdout.write(`  ${pdf.year} ${pdf.exam} ${pdf.lang === 'en' ? '🇬🇧' : '🇹🇷'} ... `)
  try {
    await download(pdf.url, dest)
    console.log('✓')
  } catch {
    console.log('✗ indirme başarısız')
  }
}
console.log('Bitti.')
