import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.tsx', '.js', '.mjs'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('questions write boundary', () => {
  it('keeps application code off direct PostgREST mutations', () => {
    const root = join(process.cwd(), 'src')
    const directMutation = /\.from\(\s*['"]questions['"]\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/
    const offenders = sourceFiles(root).flatMap((path) => (
      directMutation.test(readFileSync(path, 'utf8')) ? [relative(root, path)] : []
    ))

    expect(offenders).toEqual([])
  })
})
