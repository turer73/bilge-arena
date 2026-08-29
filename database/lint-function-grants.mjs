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
    const openParen = sql.indexOf('(', match.index)
    const closeParen = matchingParen(sql, openParen)
    const signature = canonicalSignature(match[1], sql.slice(openParen + 1, closeParen))
    return [{
      name: match[1].toLowerCase(),
      signature,
      fixedSearchPath: /\bSET\s+search_path\s*=\s*pg_catalog\b/i.test(definition),
    }]
  })
}

function matchingParen(sql, openParen) {
  let depth = 0
  for (let index = openParen; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1
    else if (sql[index] === ')' && --depth === 0) return index
  }
  return sql.length
}

function splitParameters(parameters) {
  const parts = []
  let start = 0
  let depth = 0
  for (let index = 0; index < parameters.length; index += 1) {
    if (parameters[index] === '(') depth += 1
    else if (parameters[index] === ')') depth -= 1
    else if (parameters[index] === ',' && depth === 0) {
      parts.push(parameters.slice(start, index))
      start = index + 1
    }
  }
  parts.push(parameters.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

const TYPE_LEAD = /^(?:uuid|text|boolean|bool|integer|int|int2|int4|int8|smallint|bigint|numeric|decimal|real|double|timestamp|timestamptz|date|time|interval|json|jsonb|bytea|character|varchar|citext|regclass|regprocedure|record|trigger|void|public\.|pg_catalog\.)/i

function canonicalParameterType(parameter) {
  let value = parameter
    .replace(/^(?:INOUT|IN|OUT|VARIADIC)\s+/i, '')
    .replace(/\s+(?:DEFAULT\s+|=)[\s\S]*$/i, '')
    .trim()
  const named = /^([a-zA-Z_][\w$]*)\s+([\s\S]+)$/.exec(value)
  if (named && !TYPE_LEAD.test(named[1])) value = named[2]
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),\[\]])\s*/g, '$1')
}

function canonicalSignature(name, parameters) {
  const types = splitParameters(parameters).map(canonicalParameterType)
  return `${name.toLowerCase()}(${types.join(',')})`
}

export function revokedFunctionSignatures(sql) {
  const signatures = new Set()
  for (const block of sql.matchAll(/\bREVOKE\s+ALL\s+ON\s+FUNCTION\s+([\s\S]*?)\s+FROM\s+[\s\S]*?;/gi)) {
    const body = block[1]
    for (const match of body.matchAll(/public\.([a-zA-Z_][\w]*)\s*\(/gi)) {
      const openParen = body.indexOf('(', match.index)
      const closeParen = matchingParen(body, openParen)
      signatures.add(canonicalSignature(match[1], body.slice(openParen + 1, closeParen)))
    }
  }
  return signatures
}

export function lintFunctionGrantHygiene(dir = migrationsDir) {
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
  const sqlByFile = files.map((file) => ({ file, sql: readFileSync(join(dir, file), 'utf8') }))
  const revoked = revokedFunctionSignatures(sqlByFile.map(({ sql }) => sql).join('\n'))
  const violations = []
  for (const { file, sql } of sqlByFile) {
    const fileOrdinal = ordinal(file)
    if (!Number.isFinite(fileOrdinal) || fileOrdinal < minimumOrdinal) continue
    for (const fn of securityDefinerFunctions(sql)) {
      if (!fn.fixedSearchPath) violations.push({ file, name: fn.name, rule: 'mutable-search-path' })
      if (!revoked.has(fn.signature)) {
        violations.push({ file, name: fn.signature, rule: 'public-execute-not-revoked' })
      }
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
