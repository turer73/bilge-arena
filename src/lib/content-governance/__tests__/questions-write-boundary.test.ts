import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tarama ~1350 dosyayi okur; suresi mantiga degil disk/antivirus cekismesine baglidir.
// Onceki senkron surum pre-push'ta (tam paket + paralel build) 18,8 sn, surec baslatma
// firtinasinda 48 sn olculdu. Okumalar paralel; bekleme kosulu olmadigi icin uzun sinir
// yalniz G/C cekismesini karsilar, gercek bir ihlali gecikmeden raporlar.
const SCAN_TIMEOUT_MS = 60_000

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.tsx', '.js', '.mjs'].includes(extname(entry.name)) ? [path] : []
  }))
  return nested.flat()
}

describe('questions write boundary', () => {
  it('keeps application code off direct PostgREST mutations', async () => {
    const root = join(process.cwd(), 'src')
    const directMutation = /\.from\(\s*['"]questions['"]\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/
    const files = await sourceFiles(root)
    const offenders = (await Promise.all(files.map(async (path) => (
      directMutation.test(await readFile(path, 'utf8')) ? [relative(root, path)] : []
    )))).flat()

    expect(files.length).toBeGreaterThan(1000)
    expect(offenders).toEqual([])
  }, SCAN_TIMEOUT_MS)
})
