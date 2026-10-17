// smoke.ts'i (uygulamanin src/lib/rooms kodu + realtime-js + pg) Node 22 icin
// tek dosyaya paketler. Yigin icinde npm install gerekmez.
import { build } from 'rolldown'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

await build({
  input: join(here, 'smoke.ts'),
  platform: 'node',
  external: ['pg-native'],
  onLog(level, log, handler) {
    if (log.code === 'MODULE_LEVEL_DIRECTIVE') return
    handler(level, log)
  },
  output: {
    file: join(here, 'dist', 'smoke.mjs'),
    format: 'esm',
    codeSplitting: false,
  },
})
console.log('built dist/smoke.mjs')
