// CI'daki her gercek PostgreSQL adiminin hangi dosyalari kostugu - tek kaynak.
// ci.yml adimlari bu listeyi run-postgres-ci-suite.mjs uzerinden okur; Test isi
// de test:db'de atlanan her dosyanin burada bir takima bagli oldugunu dogrular
// (verify-db-skip-coverage.mjs). Boylece yeni bir PG test dosyasi CI'a
// baglanmadan "skipped" olarak sessizce gecemez: 2026-10'da 13 dosyadaki 67
// davranis testi (odul, satin alma, notlama) hicbir CI isinde kosmuyordu.
//
// runner: 'vitest' -> vitest.database.config.ts; 'node-test' -> node --test.
// sequential: dosyalar ayni veritabaninda public semasini sifirladigi icin
// sirayla kosar (--no-file-parallelism). expectedTests: takimin tam test
// sayisi sabitse (yoksa her dosyada en az bir gecen test yeter). allowedSkips:
// yalniz node-test takimlarinda, depoda olmayan bir girdiye bagli tek test icin
// dosya + tam baslik + gerekce; describe duzeyinde atlama izinli degildir.
const t = (name) => `database/__tests__/${name}`

export const POSTGRES_CI_SUITES = Object.freeze({
  'institution-pilot': {
    job: 'institution-pilot-postgres',
    runner: 'vitest',
    files: [t('institution-pilot-foundation-postgres.integration.test.mjs')],
  },
  'teacher-classroom': {
    job: 'institution-pilot-postgres',
    runner: 'vitest',
    files: [t('teacher-classroom-privacy-postgres.integration.test.mjs')],
  },
  'leaderboard-privacy': {
    job: 'institution-pilot-postgres',
    runner: 'vitest',
    files: [t('private-leaderboard-opt-in-postgres.integration.test.mjs')],
  },
  'retention-erasure': {
    job: 'institution-pilot-postgres',
    runner: 'vitest',
    files: [t('retention-erasure-profile-tombstone-postgres.integration.test.mjs')],
  },
  'question-quality': {
    job: 'question-quality-postgres',
    runner: 'vitest',
    sequential: true,
    files: [
      t('adaptive-diagnostic-postgres.integration.test.mjs'),
      t('question-content-governance-postgres.integration.test.mjs'),
      t('question-outcome-mapping-candidates-postgres.integration.test.mjs'),
      t('admin-homepage-mutation-governance-postgres.integration.test.mjs'),
      t('admin-rbac-mutation-governance-postgres.integration.test.mjs'),
      t('admin-read-privacy-boundaries-postgres.integration.test.mjs'),
      t('reward-integrity-postgres.integration.test.mjs'),
    ],
  },
  'curriculum-scope': {
    job: 'question-quality-postgres',
    runner: 'vitest',
    files: [t('curriculum-scope-release-postgres.integration.test.mjs')],
  },
  'mastery-evidence': {
    job: 'question-quality-postgres',
    runner: 'vitest',
    files: [t('mastery-evidence-v2-postgres.integration.test.mjs')],
  },
  'social-pilot': {
    job: 'question-quality-postgres',
    runner: 'node-test',
    files: [t('social-discovery-pilot-postgres.integration.test.mjs')],
  },
  'source-review-native': {
    job: 'question-quality-postgres',
    runner: 'vitest',
    files: [
      t('question-source-review-wasm.test.mjs'),
      t('source-comparison-review.test.mjs'),
      t('question-basic-guard-postgres.test.mjs'),
      t('tyt-social-reviewed-preparation-pool.test.mjs'),
      t('governed-social-outcome-projection.test.mjs'),
      t('governed-math-outcome-projection.test.mjs'),
      t('tyt-social-preparation-learner-flow.test.mjs'),
      t('revision-bound-fen-quality-policy.test.mjs'),
      t('question-benchmark-scope.test.mjs'),
    ],
  },
  'controlled-measurement': {
    job: 'question-quality-postgres',
    runner: 'vitest',
    files: [
      t('controlled-measurement.test.mjs'),
      t('social-calibration-readiness.test.mjs'),
      t('measurement-readiness.test.mjs'),
      t('measurement-release-check.test.mjs'),
    ],
  },
  'canonical-identity': {
    job: 'question-quality-postgres',
    runner: 'node-test',
    files: [t('canonical-curriculum.test.mjs'), t('canonical-curriculum-postgres.integration.test.mjs')],
    allowedSkips: [{
      file: t('canonical-curriculum-postgres.integration.test.mjs'),
      title: 'rehearses the hash-pinned real package with fixture UUIDs, without source acceptance',
      reason: 'CANONICAL_REVIEW_PACKAGE ozel inceleme paketini ister; paket bilerek depoda degil '
        + '(docs/content-quality/lgs-canonical-catalog.md). Ayni dosyanin diger PG testleri CI icinde kosar.',
    }],
  },
  'formal-tyt-social-scope': {
    job: 'question-quality-postgres',
    runner: 'node-test',
    files: [t('formal-tyt-social-scope-postgres.integration.test.mjs')],
  },
  'tyt-reviewed-pool': {
    job: 'question-quality-postgres',
    runner: 'node-test',
    files: [t('tyt-social-reviewed-pool-postgres.integration.test.mjs')],
  },
  'tyt-social-epoch': {
    job: 'tyt-social-epoch-postgres',
    runner: 'vitest',
    maxWorkers: 1,
    expectedTests: 18,
    files: [t('tyt-social-selection-epoch-postgres.integration.test.mjs')],
  },
  'learning-reward': {
    job: 'learning-reward-postgres',
    runner: 'vitest',
    sequential: true,
    files: [
      t('verified-attempts-postgres.integration.test.mjs'),
      t('purchase-ledger-postgres.integration.test.mjs'),
      t('session-coin-scale-postgres.integration.test.mjs'),
      t('persistent-fsrs-postgres.integration.test.mjs'),
      t('verified-coach-flow-postgres.integration.test.mjs'),
      t('verified-exam-strategy-postgres.integration.test.mjs'),
      t('daily-plan-items-v2-postgres.integration.test.mjs'),
      t('curriculum-graph-v1-postgres.integration.test.mjs'),
      t('relative-weekly-leagues-postgres.integration.test.mjs'),
      t('positive-learning-spotlights-postgres.integration.test.mjs'),
      t('cohort-team-boss-postgres.integration.test.mjs'),
      t('paper-study-packs-postgres.integration.test.mjs'),
      t('canonical-category-remap-postgres.integration.test.mjs'),
      t('award-badges-postgres.integration.test.mjs'),
      t('activation-reward-claims-postgres.integration.test.mjs'),
      t('error-report-rewards-postgres.integration.test.mjs'),
    ],
  },
})

// test:db'de PostgreSQL disi bir sebeple atlanan testler. Dosya + tam baslik
// eslesmeli; ayni dosyadaki baska bir atlama kabul edilmez.
export const DB_SKIP_ALLOWLIST = Object.freeze([
  {
    file: t('question-bank.test.mjs'),
    title: 'gerçek bank ERROR=0 (regresyon)',
    reason: 'Gercek soru bankasi dosyasi depoda yok (git gecmisinden temizlendi); PostgreSQL testi degil.',
  },
])

export function postgresCiSuite(id) {
  if (!Object.hasOwn(POSTGRES_CI_SUITES, id)) throw new Error('Unknown PostgreSQL CI suite')
  return POSTGRES_CI_SUITES[id]
}

export function postgresCiSuiteFiles() {
  return Object.values(POSTGRES_CI_SUITES).flatMap((suite) => suite.files)
}
