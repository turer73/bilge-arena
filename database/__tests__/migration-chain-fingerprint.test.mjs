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

  it('230 sonrasi olculen 462 public fonksiyonu tasir; eski 044 imzasi ve yetim trigger yok', () => {
    // 2026-10-30: 228 sonrasi 451 + 230'un 11 yeni fonksiyonu (canli md5 e55ce6b4f12269d801c8a7c2b07fe477).
    expect(production.size).toBe(462)
    expect(production.has('publish_question_minor_text_correction(uuid,uuid,uuid,jsonb,uuid)')).toBe(true)
    for (const signature of [
      'assert_tyt_social_learning_epoch(uuid,text,uuid)',
      'create_tyt_social_daily_plan_for_epoch(uuid,date,jsonb,text,uuid)',
      'issue_verified_tyt_social_attempt_for_epoch(uuid,text,uuid[],integer,uuid,text,uuid)',
      'issue_verified_tyt_social_exam_attempt_for_epoch(uuid,text,jsonb,integer,integer,uuid,text,uuid)',
      'question_revision_validation_pair_valid(text,text,text,text)',
      'read_tyt_social_learning_snapshot(uuid,uuid[])',
      'tyt_social_learning_context_at(uuid,timestamp with time zone)',
      'accept_question_revision_retirement_review(uuid,uuid,jsonb,text,uuid,jsonb)',
      'get_question_revision_retirement_review(uuid,uuid)',
      'question_retirement_fingerprint(uuid)',
      'question_retirement_evidence_valid(uuid,jsonb)',
      'question_revision_retirement_review_ready(uuid)',
    ]) expect(production.has(signature), signature).toBe(true)
    expect(production.has('block_disposable_emails()')).toBe(false)
    expect([...production.keys()].filter((s) => s.startsWith('select_random_questions('))).toEqual([
      'select_random_questions(text,integer,text,integer,uuid[],text)',
    ])
    for (const signature of ['accept_question_revision_retirement_review(uuid,uuid,jsonb,text,uuid,jsonb)','get_question_revision_retirement_review(uuid,uuid)']) {
      const definition=production.get(signature)
      expect(definition?.acl).toBe('{postgres=X/postgres,service_role=X/postgres}')
      expect(definition?.config).toBe('search_path=pg_catalog')
    }
    for (const signature of ['question_retirement_fingerprint(uuid)','question_retirement_evidence_valid(uuid,jsonb)','question_revision_retirement_review_ready(uuid)']) {
      expect(production.get(signature)?.acl).toBe('{postgres=X/postgres}')
    }
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
