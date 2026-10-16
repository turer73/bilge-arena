import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresCiSuite } from './postgres-ci-suites.mjs'
import { PostgresCiReportError, verifyPostgresCiSuiteReport } from './verify-postgres-ci-result.mjs'

// Bir PostgreSQL CI takimini postgres-ci-suites.mjs'teki dosya listesiyle kosar,
// makine-okunur raporu her seferinde yeni bir dizine yazar (bayat rapor
// dogrulanamaz) ve atlanan, eksik ya da bos dosyayi reddeder.
// Kullanim: node scripts/security/run-postgres-ci-suite.mjs <takim>
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
// --test-reporter bir modul belirtecidir; Windows'ta C:\ yolu URL semasi sanilir.
const reporterUrl = new URL('./node-test-json-reporter.mjs', import.meta.url).href

export function postgresCiSuiteCommand(suite, reportPath) {
  if (suite.runner === 'vitest') {
    return [
      path.join('node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', 'vitest.database.config.ts',
      ...(suite.sequential ? ['--no-file-parallelism'] : []),
      ...(suite.maxWorkers ? [`--maxWorkers=${suite.maxWorkers}`] : []),
      ...suite.files,
      '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`,
    ]
  }
  if (suite.runner === 'node-test') {
    return [
      '--test',
      '--test-reporter=spec', '--test-reporter-destination=stdout',
      `--test-reporter=${reporterUrl}`, `--test-reporter-destination=${reportPath}`,
      ...suite.files,
    ]
  }
  throw new Error('Unknown PostgreSQL CI runner')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let suiteId
  try {
    if (process.argv.length !== 3) throw new Error('Exactly one suite id required')
    suiteId = process.argv[2]
    const suite = postgresCiSuite(suiteId)
    const reportPath = path.join(mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), 'postgres-ci-')), `${suiteId}.json`)
    const run = spawnSync(process.execPath, postgresCiSuiteCommand(suite, reportPath), {
      cwd: repositoryRoot,
      stdio: 'inherit',
      env: process.env,
    })
    if (run.error) throw run.error
    if (run.status !== 0) {
      console.error(`PostgreSQL CI suite ${suiteId}: test runner exited with ${run.status ?? run.signal}`)
      process.exit(1)
    }
    const result = verifyPostgresCiSuiteReport(suiteId, JSON.parse(readFileSync(reportPath, 'utf8')))
    console.log(`PostgreSQL CI suite ${suiteId}: ${result.files} files, ${result.passed} tests passed; zero skipped`)
  } catch (error) {
    console.error(error instanceof PostgresCiReportError
      ? `PostgreSQL CI suite ${suiteId}: ${error.message}`
      : 'PostgreSQL CI suite rejected: unknown suite, runner failure, or missing/malformed report')
    process.exitCode = 1
  }
}
