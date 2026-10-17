// Tam zincir ile uretim fonksiyon parmak izi karsilastirmasi (saf fonksiyonlar).
// Zincirin kendisi PostgreSQL ister ve migration-idempotency.yml'de kosar.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  KNOWN_DRIFT_PATH,
  applyKnownDrift,
  diffFingerprints,
  loadKnownDrift,
  parseFingerprint,
} from '../apply-migration-chain.mjs'
import { DATABASE_DIR } from '../migration-order.mjs'

const row = (signature, body, acl = '{postgres=X/postgres,service_role=X/postgres}') =>
  `${signature}|${body}|t|search_path=pg_catalog|${acl}`

describe('fonksiyon parmak izi farki', () => {
  const production = parseFingerprint([
    row('f()', 'aaa'),
    row('g(uuid)', 'bbb'),
    row('h()', 'ccc', '{postgres=X/postgres,anon=X/postgres}'),
  ].join('\n'))

  it('eksik, fazla, govde ve ACL farklarini iki taraftaki degerle verir', () => {
    const chain = parseFingerprint([
      row('g(uuid)', 'bbb-old'),
      row('h()', 'ccc'),
      row('f(text,integer)', 'zzz'),
    ].join('\n'))
    expect(diffFingerprints(production, chain)).toEqual([
      { signature: 'f()', kind: 'missing-in-chain', production: 'aaa', chain: null },
      { signature: 'g(uuid)', kind: 'body-differs', production: 'bbb', chain: 'bbb-old' },
      {
        signature: 'h()',
        kind: 'acl-differs',
        production: '{postgres=X/postgres,anon=X/postgres}',
        chain: '{postgres=X/postgres,service_role=X/postgres}',
      },
      { signature: 'f(text,integer)', kind: 'extra-in-chain', production: null, chain: 'zzz' },
    ])
  })

  it('bilinen sapma yalniz imza, tur ve iki taraf birebir tutarsa yutulur; eslesmeyen giris bayattir', () => {
    const diffs = [
      { signature: 'f()', kind: 'missing-in-chain', production: 'aaa', chain: null },
      { signature: 'g(uuid)', kind: 'body-differs', production: 'bbb', chain: 'bbb-new' },
    ]
    const known = [
      { signature: 'f()', kind: 'missing-in-chain', production: 'aaa' },
      { signature: 'g(uuid)', kind: 'body-differs', production: 'bbb', chain: 'bbb-old' },
      { signature: 'gone()', kind: 'body-differs', production: 'x', chain: 'y' },
    ]
    const { unexpected, stale } = applyKnownDrift(diffs, known)
    expect(unexpected).toEqual([diffs[1]])
    expect(stale.map((e) => e.signature)).toEqual(['g(uuid)', 'gone()'])
  })
})

describe('kayitli uretim parmak izi ve bilinen sapmalar', () => {
  const production = parseFingerprint(
    readFileSync(join(DATABASE_DIR, 'migration-chain', 'production-functions.txt'), 'utf8'),
  )

  it('223 sonrasi 2026-10-17 olcumundeki 439 public fonksiyonu tasir; 044 surumunun 5 argumanli imzasi ve yetim block_disposable_emails() yok', () => {
    expect(production.size).toBe(439)
    expect(production.has('block_disposable_emails()')).toBe(false)
    expect([...production.keys()].filter((s) => s.startsWith('select_random_questions('))).toEqual([
      'select_random_questions(text,integer,text,integer,uuid[],text)',
    ])
  })

  it('her bilinen sapma uretimdeki bir imzaya ve kayitli govde ozetine baglidir', () => {
    const known = loadKnownDrift(KNOWN_DRIFT_PATH)
    expect(known.length).toBeGreaterThan(0)
    for (const entry of known) {
      expect(entry.reason, entry.signature).toMatch(/\S/)
      expect(production.get(entry.signature)?.body, entry.signature).toBe(entry.production)
    }
  })
})
