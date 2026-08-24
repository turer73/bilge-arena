#!/usr/bin/env node
// Regression gate for SECURITY DEFINER functions added from migration 136 on.
// PostgreSQL grants PUBLIC EXECUTE on new functions by default. Every privileged
// function must therefore have an explicit REVOKE and a fixed pg_catalog path.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, 'migrations')
const minimumOrdinal = 136

function ordinal(file) {
  return Number.parseInt(/^(\d+)/.exec(file)?.[1] ?? '', 10)
}

export function securityDefinerFunctions(sql) {
  const starts = [...sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z_][\w]*)\s*\(/gi)]
  return starts.flatMap((match, index) => {
    const end = starts[index + 1]?.index ?? sql.length
    const definition = sql.slice(match.index, end)
    if (!/\bSECURITY\s+DEFINER\b/i.test(definition)) return []
    return [{
      name: match[1].toLowerCase(),
      fixedSearchPath: /\bSET\s+search_path\s*=\s*pg_catalog\b/i.test(definition),
    }]
  })
}

export function revokedFunctionNames(sql) {
  const names = new Set()
  for (const block of sql.matchAll(/\bREVOKE\s+ALL\s+ON\s+FUNCTION\s+([\s\S]*?)\s+FROM\s+[\s\S]*?;/gi)) {
    for (const match of block[1].matchAll(/public\.([a-zA-Z_][\w]*)\s*\(/gi)) {
      names.add(match[1].toLowerCase())
    }
  }
  return names
}

export function lintFunctionGrantHygiene(dir = migrationsDir) {
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
  const sqlByFile = files.map((file) => ({ file, sql: readFileSync(join(dir, file), 'utf8') }))
  const revoked = revokedFunctionNames(sqlByFile.map(({ sql }) => sql).join('\n'))
  const violations = []
  for (const { file, sql } of sqlByFile) {
    const fileOrdinal = ordinal(file)
    if (!Number.isFinite(fileOrdinal) || fileOrdinal < minimumOrdinal) continue
    for (const fn of securityDefinerFunctions(sql)) {
      if (!fn.fixedSearchPath) violations.push({ file, name: fn.name, rule: 'mutable-search-path' })
      if (!revoked.has(fn.name)) violations.push({ file, name: fn.name, rule: 'public-execute-not-revoked' })
    }
  }
  return violations
}

function main() {
  const violations = lintFunctionGrantHygiene()
  if (!violations.length) {
    console.log('OK: migration 136+ SECURITY DEFINER grant ve search_path hijyeni doğrulandı.')
    return
  }
  console.error(`SECURITY DEFINER HIJYEN IHLALI: ${violations.length}`)
  for (const violation of violations) {
    console.error(`  ${violation.file}: ${violation.name} [${violation.rule}]`)
  }
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
