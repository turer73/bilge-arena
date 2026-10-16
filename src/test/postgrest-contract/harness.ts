// Gercek PostgreSQL 16 + PostgREST 14 kontrat testlerinin ortak duzenegi.
//
// Route testleri servis-role istemcisini mock'lar ve `.returns<T>()` tip
// denetimini susturur; bu yuzden gomme (embed) ve FK sozlesmesi kirildiginda
// yesil kalirlar (/api/comments 17 Mayis'tan beri PGRST200 verdi). Bu duzenekte
// route kodu mock'suz supabase-js ile gercek PostgREST'e gider; sema
// base-schema.sql'den (uretim migration'larindan alinmis PK/FK) gelir ve
// assertFixtureMirrorsGeneratedSchema ile canli tip dosyasina baglanir.
//
// Opt-in: CI'daki "PostgREST contract" isi PostgreSQL ve PostgREST'i ayaga
// kaldirip asagidaki degiskenleri verir. Eksikse dosyalar atlanir; CI isi
// atlanan testi basarisiz sayar (scripts/security/verify-postgrest-contract-ci-result.mjs).
// Her dosya public semasini sifirlar: dosyalar sirayla kosmalidir.
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect } from 'vitest'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

/** Bir migration'daki `CREATE OR REPLACE FUNCTION <name>(` tanimini aynen dondurur. */
export function readMigrationFunction(migrationPath: string, functionName: string) {
  const sql = readRepoFile(migrationPath)
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`)
  const tag = start < 0 ? undefined : sql.slice(start).match(/\bAS\s+(\$[a-z_]*\$)/i)?.[1]
  if (start < 0 || !tag) throw new Error(`${functionName} not found in ${migrationPath}`)
  const bodyStart = sql.indexOf(tag, start) + tag.length
  const bodyEnd = sql.indexOf(tag, bodyStart) + tag.length
  return sql.slice(start, sql.indexOf(';', bodyEnd) + 1)
}

const databaseUrl = process.env.POSTGREST_CONTRACT_TEST_DATABASE_URL
const postgrestUrl = process.env.POSTGREST_CONTRACT_TEST_URL
const jwtSecret = process.env.POSTGREST_CONTRACT_TEST_JWT_SECRET
export const postgrestContractEnabled = Boolean(
  databaseUrl
  && postgrestUrl
  && jwtSecret
  && process.env.POSTGREST_CONTRACT_TEST_DATABASE_DISPOSABLE === '1',
)
if (databaseUrl && !/^bilge_postgrest_contract_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}

export const describePostgrest = postgrestContractEnabled ? describe : describe.skip

// pg'nin tip paketi yok; testlerin kullandigi yuzey kadar tip tanimi yeter.
export interface PgClient {
  connect(): Promise<void>
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>
  end(): Promise<void>
}
const { Client } = createRequire(import.meta.url)('pg') as {
  Client: new (config: { connectionString?: string }) => PgClient
}

export function signJwt(secret: string, claims: Record<string, unknown>) {
  const encode = (value: string) => Buffer.from(value).toString('base64url')
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = encode(JSON.stringify({
    iss: 'bilge-arena-postgrest-contract',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  }))
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

// supabase-js REST isteklerini `${url}/rest/v1` altina yollar; yalin PostgREST
// kokten servis eder. Bu vekil yalniz on eki kaldirir, govde ve basliklara dokunmaz.
export function startRestPrefixProxy(target: URL) {
  const server = createServer((req, res) => {
    const upstream = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: (req.url ?? '/').replace(/^\/rest\/v1(?=\/|$)/, '') || '/',
      method: req.method,
      headers: { ...req.headers, host: target.host },
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  return new Promise<Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const RESET_SQL = `
  DROP SCHEMA IF EXISTS auth CASCADE;
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA auth;
  CREATE SCHEMA public;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      GRANT anon, authenticated, service_role TO authenticator;
    END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`

const READY_MARKER_PREFIX = 'postgrest_contract_ready_'

export interface SessionUser { id: string }

export interface PostgrestContract {
  db: PgClient
  /** supabase-js'in URL'si: `${restOrigin}/rest/v1` vekil uzerinden PostgREST'e gider. */
  restOrigin: string
  serviceKey: string
  serviceClient(): SupabaseClient
  /**
   * `@/lib/supabase/server` yerine: oturum `currentUser`'dan okunur, sorgular
   * gercek PostgREST'e gider. Servis rolunu kullanir; RLS bu kontratin konusu
   * degildir (uretimde cerez istemcisi authenticated rolundedir).
   */
  cookieClient(currentUser: () => SessionUser | null): SupabaseClient
  close(): Promise<void>
}

/**
 * Semayi sifirlar, base-schema.sql'i ve verilen ek SQL'leri uygular, PostgREST
 * sema onbellegi bu kurulumu gorene kadar bekler ve servis-role ortamini
 * (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY) vekile yonlendirir. Route
 * modulleri bu cagridan SONRA import edilmelidir: service-role.ts URL'yi
 * modul yuklenirken okur.
 */
export async function startPostgrestContract(extraSql: string[] = []): Promise<PostgrestContract> {
  const db = new Client({ connectionString: databaseUrl })
  await db.connect()
  let proxy: Server | undefined
  try {
    await db.query(RESET_SQL)
    await db.query(readRepoFile('src/test/postgrest-contract/base-schema.sql'))
    for (const sql of extraSql) await db.query(sql)

    // Onceki dosyanin semasi onbellekte kalmis olabilir; yalniz bu kurulumla
    // gelen isaret tablosu gorundugunde onbellek bu DDL'i yuklemis demektir.
    const marker = `${READY_MARKER_PREFIX}${randomBytes(6).toString('hex')}`
    await db.query(`
      CREATE TABLE public.${marker}(id integer);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
      NOTIFY pgrst, 'reload schema';
    `)

    proxy = await startRestPrefixProxy(new URL(postgrestUrl!))
    const restOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    const serviceKey = signJwt(jwtSecret!, { role: 'service_role' })

    const deadline = Date.now() + 20_000
    for (;;) {
      const probe = await fetch(`${restOrigin}/rest/v1/${marker}?select=id&limit=1`, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      })
      if (probe.ok) break
      if (Date.now() > deadline) throw new Error(`PostgREST schema cache not ready: ${probe.status} ${await probe.text()}`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    process.env.NEXT_PUBLIC_SUPABASE_URL = restOrigin
    process.env.SUPABASE_SERVICE_KEY = serviceKey

    const serviceClient = () => createClient(restOrigin, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const runningProxy = proxy
    return {
      db,
      restOrigin,
      serviceKey,
      serviceClient,
      cookieClient(currentUser) {
        const client = serviceClient()
        Object.assign(client.auth, {
          getUser: async () => ({ data: { user: currentUser() }, error: null }),
        })
        Object.assign(client.auth.mfa, {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
            error: null,
          }),
        })
        return client
      },
      async close() {
        await new Promise((resolve) => runningProxy.close(resolve))
        await db.end()
      },
    }
  } catch (error) {
    proxy?.close()
    await db.end()
    throw error
  }
}

interface GeneratedRelationship {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

interface GeneratedTable {
  columns: Set<string>
  relationships: GeneratedRelationship[]
}

const quotedList = (value: string) => [...value.matchAll(/"([^"]+)"/g)].map((match) => match[1])

/** src/types/database.generated.ts'teki public tablolarini (canli semanin kaydi) okur. */
export function readGeneratedTables(): Map<string, GeneratedTable> {
  const source = readRepoFile('src/types/database.generated.ts').replace(/\r\n/g, '\n')
  const start = source.indexOf('\n  public: {\n    Tables: {')
  const end = source.indexOf('\n    Views: {', start)
  if (start < 0 || end < 0) throw new Error('database.generated.ts public Tables block not found')
  const tables = new Map<string, GeneratedTable>()
  for (const block of source.slice(start, end).split(/\n {6}(?=[a-z_0-9]+: \{\n {8}Row: \{)/)) {
    const name = block.match(/^([a-z_0-9]+): \{\n {8}Row: \{/)?.[1]
    if (!name) continue
    const row = block.slice(0, block.indexOf('\n        }'))
    const relationships = block.slice(block.indexOf('Relationships: ['))
    tables.set(name, {
      columns: new Set([...row.matchAll(/\n {10}([a-z_0-9]+):/g)].map((match) => match[1])),
      relationships: [...relationships.matchAll(
        /foreignKeyName: "([^"]+)"\s*columns: \[([^\]]*)\]\s*isOneToOne: (true|false)\s*referencedRelation: "([^"]+)"\s*referencedColumns: \[([^\]]*)\]/g,
      )].map((match) => ({
        foreignKeyName: match[1],
        columns: quotedList(match[2]),
        isOneToOne: match[3] === 'true',
        referencedRelation: match[4],
        referencedColumns: quotedList(match[5]),
      })),
    })
  }
  return tables
}

const describeRelationship = (table: string, rel: GeneratedRelationship) =>
  `${table}.${rel.foreignKeyName}(${rel.columns.join(',')}) -> ${rel.referencedRelation}(${rel.referencedColumns.join(',')}) 1:1=${rel.isOneToOne}`

/**
 * Fikstürün canli semayla ayni iliski secimini urettigini denetler:
 *  - her fikstür tablosu ve sutunu database.generated.ts'te var;
 *  - fikstür tablolari arasindaki FK'ler (ad, sutun, hedef, 1:1) birebir ayni;
 *  - gomulen her [kaynak, hedef] cifti icin iki uca da FK'si olan her tablo
 *    (PostgREST'in M2M/belirsizlik adayi) fikstürde var.
 */
export async function assertFixtureMirrorsGeneratedSchema(db: PgClient, embeds: Array<[string, string]>) {
  const generated = readGeneratedTables()
  const { rows: tableRows } = await db.query<{ table_name: string; columns: string[] }>(`
    SELECT c.relname AS table_name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '${READY_MARKER_PREFIX}%'
    GROUP BY c.relname`)
  const fixtureTables = new Set(tableRows.map((row) => row.table_name))

  const unknownColumns = tableRows.flatMap((row) => {
    const live = generated.get(row.table_name)
    if (!live) return [`${row.table_name} (tablo yok)`]
    return row.columns.filter((column) => !live.columns.has(column)).map((column) => `${row.table_name}.${column}`)
  })
  expect(unknownColumns, 'fikstür canli semada olmayan tablo/sutun iceriyor').toEqual([])

  const { rows: fkRows } = await db.query<{
    table_name: string; conname: string; referenced: string; columns: string[]; referenced_columns: string[]; one_to_one: boolean
  }>(`
    SELECT src.relname AS table_name, con.conname::text AS conname, dst.relname AS referenced,
      array(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
      array(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS referenced_columns,
      EXISTS (
        SELECT 1 FROM pg_constraint uk
        WHERE uk.conrelid = con.conrelid AND uk.contype IN ('p', 'u')
          AND uk.conkey @> con.conkey AND uk.conkey <@ con.conkey
      ) AS one_to_one
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace srcn ON srcn.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = con.confrelid
    JOIN pg_namespace dstn ON dstn.oid = dst.relnamespace
    WHERE con.contype = 'f' AND srcn.nspname = 'public' AND dstn.nspname = 'public'`)
  const fixtureRelationships = fkRows.map((row) => describeRelationship(row.table_name, {
    foreignKeyName: row.conname,
    columns: row.columns,
    isOneToOne: row.one_to_one,
    referencedRelation: row.referenced,
    referencedColumns: row.referenced_columns,
  })).sort()
  const liveRelationships = [...fixtureTables].flatMap((table) => (generated.get(table)?.relationships ?? [])
    .filter((rel) => fixtureTables.has(rel.referencedRelation))
    .map((rel) => describeRelationship(table, rel))).sort()
  expect(fixtureRelationships, 'fikstür FK kumesi canli semadan sapiyor').toEqual(liveRelationships)

  const referencesTo = (table: string, target: string) =>
    (generated.get(table)?.relationships ?? []).some((rel) => rel.referencedRelation === target)
  for (const [source, target] of embeds) {
    expect(fixtureTables.has(source) && fixtureTables.has(target), `${source} -> ${target} fikstürde yok`).toBe(true)
    const junctionCandidates = [...generated.keys()]
      .filter((table) => table !== source && table !== target && referencesTo(table, source) && referencesTo(table, target))
    expect(junctionCandidates.filter((table) => !fixtureTables.has(table)), `${source} -> ${target} junction adaylari eksik`)
      .toEqual([])
  }
}
