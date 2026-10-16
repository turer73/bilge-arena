// node --test icin JSON raporlayici; verify-postgres-ci-result.mjs okur.
// Kullanim: node --test --test-reporter=spec --test-reporter-destination=stdout \
//   --test-reporter=./scripts/security/node-test-json-reporter.mjs \
//   --test-reporter-destination=<rapor.json> <dosyalar>
// Yalnizca akis sonunda yazar; yarida kesilen kosu "complete" alani olmayan
// (yani reddedilen) rapor birakmaz, hic rapor birakmaz.
const statusOf = (event) => {
  if (event.data?.skip !== undefined && event.data.skip !== false) return 'skipped'
  if (event.data?.todo !== undefined && event.data.todo !== false) return 'todo'
  return event.type === 'test:pass' ? 'passed' : 'failed'
}

export default async function* nodeTestJsonReporter(source) {
  const tests = []
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    const data = event.data ?? {}
    tests.push({
      file: typeof data.file === 'string' ? data.file : '',
      name: typeof data.name === 'string' ? data.name : '',
      nesting: data.nesting,
      kind: data.details?.type === 'suite' ? 'suite' : 'test',
      status: statusOf(event),
    })
  }
  yield `${JSON.stringify({ runner: 'node-test', complete: true, tests })}\n`
}
