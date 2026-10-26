import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * --focus dolgu, cerceve ve odak halkasi icindir; metin rengi --focus-text'tir.
 * Koyu temada --focus (#2563EB) koyu kartta 3,2–3,75 kontrast veriyordu
 * (genel tarama 2026-10-26, disc #2952). Bu test metin olarak --focus'u yasaklar.
 */
const ROOT = join(process.cwd(), 'src')
const FORBIDDEN = /(^|[\s"'`:])text-\[var\(--focus\)\]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path)
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('--focus metin rengi olarak kullanılmaz', () => {
  it('kaynak kodda text-[var(--focus)] yok; metin için text-[var(--focus-text)] kullanılır', () => {
    const offenders = sourceFiles(ROOT).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => (FORBIDDEN.test(line) ? `${relative(process.cwd(), file)}:${index + 1}` : null))
        .filter((hit): hit is string => hit !== null),
    )
    expect(offenders).toEqual([])
  })
})
