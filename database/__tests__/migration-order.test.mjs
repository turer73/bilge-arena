// Migration sira manifesti (database/migration-order.json) — kurallar:
// database/migration-order.mjs. Veritabani gerektirmez.
import { describe, expect, it } from 'vitest'

import {
  LEXICAL_ORDER_EXCEPTIONS,
  compareWithLedger,
  loadMigrationOrder,
  migrationFileNames,
  parseLedgerDump,
  validateMigrationOrder,
} from '../migration-order.mjs'

const rules = (violations) => violations.map((v) => v.rule)
const ledger = (version, name) => ({ version, name })

function manifest(...migrations) {
  return { migrations }
}

describe('repo migration manifesti', () => {
  const repo = loadMigrationOrder()

  it('her migration dosyasi tam bir kez listede ve tum sira kurallari tutuyor', () => {
    const violations = validateMigrationOrder(repo, migrationFileNames())
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
    expect(repo.migrations.map((e) => e.file).sort()).toEqual(migrationFileNames())
  })

  it('zaman damgali dosyalar 222 sonrasinda, uretimdeki sirayla calisir', () => {
    const order = repo.migrations.map((e) => e.file)
    const at222 = order.indexOf('222_tyt_social_reviewed_pool_preflight.sql')
    for (const file of order.filter((f) => /^\d{14}_/.test(f))) {
      expect(order.indexOf(file), file).toBeGreaterThan(at222)
    }
    // Uretim 200126'yi 200000'den once uyguladi (defter 20261009200126 < 20261009203813).
    expect(order.indexOf('20261009200126_institution_basic_pilot_onboarding.sql'))
      .toBeLessThan(order.indexOf('20261009200000_question_source_evidence_exceptions.sql'))
  })

  it('the literature seed and prior three releases retain their actual ledger pins', () => {
    const pending = repo.migrations.filter((e) => e.status === 'pending').map((e) => e.file)
    expect(pending).toEqual([])
    const latestApplied = repo.migrations.filter((e) => e.status !== 'pending')
    // 230 (2026-10-30) ve 231 (2026-11-01) Supabase SQL Editor ile uygulandi: defter satiri yok, unrecorded.
    expect(latestApplied.at(-1)).toMatchObject({ file:'231_revision_bound_tyt_quality_policy.sql',status:'unrecorded' })
    expect(latestApplied.at(-1).ledger).toBeUndefined()
    expect(latestApplied.at(-2)).toMatchObject({ file:'230_question_minor_text_correction.sql',status:'unrecorded' })
    expect(latestApplied.at(-2).ledger).toBeUndefined()
    expect(latestApplied.at(-3)).toEqual({ file:'228_ai_owner_retirement_acceptance.sql',status:'ledger',ledger:[ledger('20261020200911','228_ai_owner_retirement_acceptance')] })
    const applied=latestApplied.slice(0,-3)
    expect(applied.at(-2)).toEqual({ file:'226_ayt_literature_internal_outcome.sql',status:'ledger',ledger:[ledger('20261018230450','226_ayt_literature_internal_outcome')] })
    expect(applied.at(-1)).toEqual({ file:'227_quarantined_retirement_scope.sql',status:'ledger',ledger:[ledger('20261019045923','227_quarantined_retirement_scope')] })
    expect(applied.slice(-5,-2).map(({ file, status, ledger: rows }) => ({ file, status, ledger: rows }))).toEqual([
      {
        file: '20261013183312_adaptive_diagnostic_legacy_coverage_repair.sql',
        status: 'ledger',
        ledger: [ledger('20261018204344', 'adaptive_diagnostic_legacy_coverage_repair')],
      },
      {
        file: '20261013184551_tyt_social_learning_epoch_forward.sql',
        status: 'ledger',
        ledger: [ledger('20261018204353', 'tyt_social_learning_epoch_forward')],
      },
      {
        file: '20261014183929_revision_bound_turkce_quality_policy.sql',
        status: 'ledger',
        ledger: [ledger('20261018204412', 'revision_bound_turkce_quality_policy')],
      },
    ])
  })

  it('sozluk sirasi istisnalari donduruldu; yeni migration istisnaya eklenmez, yeniden adlandirilir', () => {
    expect(LEXICAL_ORDER_EXCEPTIONS).toHaveLength(35)
    const computed = validateMigrationOrder(repo, migrationFileNames(), { lexicalExceptions: [] })
      .filter((v) => v.rule === 'order-lexical-position')
      .map((v) => v.file)
    expect(computed).toEqual([...LEXICAL_ORDER_EXCEPTIONS])
  })

  it('180 production ledger rows occur exactly once after the owner retirement release', () => {
    const rows = repo.migrations.flatMap((e) => e.ledger ?? [])
    expect(rows).toHaveLength(180)
    expect(new Set(rows.map((r) => r.version)).size).toBe(180)
  })
})

describe('validateMigrationOrder', () => {
  const files = ['001_a.sql', '002_b.sql', '003_c.sql']

  it('eksik, bilinmeyen ve yinelenen dosyalari yakalar', () => {
    const v = validateMigrationOrder(
      manifest(
        { file: '001_a.sql', status: 'pre-ledger' },
        { file: '001_a.sql', status: 'pre-ledger' },
        { file: '009_x.sql', status: 'pending' },
      ),
      files,
      { lexicalExceptions: ['001_a.sql'] },
    )
    expect(rules(v)).toEqual(expect.arrayContaining(['order-duplicate-file', 'order-unknown-file', 'order-missing-file']))
    expect(v.filter((x) => x.rule === 'order-missing-file').map((x) => x.file)).toEqual(['002_b.sql', '003_c.sql'])
  })

  it('defter versiyonu uretim sirasina aykiri girdiyi reddeder', () => {
    const v = validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'ledger', ledger: [ledger('20260102000000', 'a')] },
      { file: '002_b.sql', status: 'ledger', ledger: [ledger('20260101000000', 'b')] },
      { file: '003_c.sql', status: 'pending' },
    ), files)
    expect(rules(v)).toEqual(['order-ledger-not-monotonic'])
  })

  it('ledger-backfill sirasi monotonluga katilmaz ama gerekcesini note ister', () => {
    const entries = [
      { file: '001_a.sql', status: 'ledger', ledger: [ledger('20260102000000', 'a')] },
      { file: '002_b.sql', status: 'ledger-backfill', ledger: [ledger('20260109000000', 'b')] },
      { file: '003_c.sql', status: 'ledger', ledger: [ledger('20260103000000', 'c')] },
    ]
    expect(rules(validateMigrationOrder(manifest(...entries), files))).toEqual(['order-backfill-note'])
    entries[1] = { ...entries[1], note: 'defter satiri sonradan yazildi' }
    expect(validateMigrationOrder(manifest(...entries), files)).toEqual([])
  })

  it('defter satiri bicimi ve status tutarliligi', () => {
    const v = validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'ledger' },
      { file: '002_b.sql', status: 'pending', ledger: [ledger('20260101000000', 'b')] },
      { file: '003_c.sql', status: 'applied' },
    ), files)
    expect(rules(v)).toEqual(expect.arrayContaining(['order-ledger-shape', 'order-bad-status']))
    expect(rules(validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'ledger', ledger: [ledger('2026', 'a')] },
      { file: '002_b.sql', status: 'pending' },
      { file: '003_c.sql', status: 'pending' },
    ), files))).toEqual(['order-ledger-shape'])
  })

  it('pre-ledger basta, pending sonda kalir', () => {
    expect(rules(validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'unrecorded' },
      { file: '002_b.sql', status: 'pre-ledger' },
      { file: '003_c.sql', status: 'pending' },
    ), files))).toEqual(['order-pre-ledger-position'])
    expect(rules(validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'pre-ledger' },
      { file: '002_b.sql', status: 'pending' },
      { file: '003_c.sql', status: 'unrecorded' },
    ), files))).toEqual(['order-pending-not-tail'])
  })

  it('yeni dosya sozlukte oncekilerden sonra gelmeli: zaman damgasi 222_ sonrasina konamaz', () => {
    const stamped = validateMigrationOrder(manifest(
      { file: '201_x.sql', status: 'pre-ledger' },
      { file: '222_y.sql', status: 'unrecorded' },
      { file: '20261018000000_new.sql', status: 'pending' },
    ), ['201_x.sql', '20261018000000_new.sql', '222_y.sql'], { lexicalExceptions: [] })
    expect(rules(stamped)).toEqual(['order-lexical-position'])
    expect(stamped[0].detail).toContain('222_y.sql')

    expect(validateMigrationOrder(manifest(
      { file: '201_x.sql', status: 'pre-ledger' },
      { file: '222_y.sql', status: 'unrecorded' },
      { file: '223_new.sql', status: 'pending' },
    ), ['201_x.sql', '222_y.sql', '223_new.sql'], { lexicalExceptions: [] })).toEqual([])
  })

  it('operatorStep yalniz var olan migration-chain/operator dosyasini gosterir', () => {
    const v = validateMigrationOrder(manifest(
      { file: '001_a.sql', status: 'pre-ledger', operatorStep: '../../etc/passwd' },
      { file: '002_b.sql', status: 'pre-ledger', operatorStep: 'migration-chain/operator/yok.sql' },
      { file: '003_c.sql', status: 'pre-ledger', operatorStep: 'migration-chain/operator/148_community_quality_worker.sql' },
    ), files)
    expect(v.filter((x) => x.rule === 'order-operator-step').map((x) => x.file)).toEqual(['001_a.sql', '002_b.sql'])
  })
})

describe('uretim defteri karsilastirmasi', () => {
  const m = manifest(
    { file: '001_a.sql', status: 'ledger', ledger: [ledger('20260101000000', '001_a')] },
    { file: '002_new_topic.sql', status: 'pending' },
  )

  it('psql -A dokumunu okur, baslik ve satir sayisini atlar', () => {
    expect(parseLedgerDump('version|name\n20260101000000|001_a\n20260102000000|new_topic\n(2 rows)\n')).toEqual([
      ledger('20260101000000', '001_a'),
      ledger('20260102000000', 'new_topic'),
    ])
  })

  it('canliya cikmis pending dosyayi isaretlemeyi soyler', () => {
    const problems = compareWithLedger(m, [ledger('20260101000000', '001_a'), ledger('20260102000000', 'new_topic')])
    expect(problems).toHaveLength(1)
    expect(problems[0].rule).toBe('ledger-row-not-in-manifest')
    expect(problems[0].detail).toContain('002_new_topic.sql')
  })

  it('ad uyusmazligini ve defterde olmayan manifest satirini yakalar', () => {
    expect(rules(compareWithLedger(m, [ledger('20260101000000', 'baska_ad')]))).toEqual(['ledger-name-mismatch'])
    expect(rules(compareWithLedger(m, []))).toEqual(['manifest-row-not-in-ledger'])
  })
})
