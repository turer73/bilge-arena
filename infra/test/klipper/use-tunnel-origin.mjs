// Scoped migration of an existing test config; leaves all credentials intact.
import {readFileSync, writeFileSync, realpathSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const here = fileURLToPath(new URL('.', import.meta.url))
if (realpathSync(here) !== '/home/klipperos/bilge-arena-academy-test/source/infra/test/klipper') throw new Error('Not isolated directory')
const file = new URL('.env', import.meta.url)
const input = readFileSync(file, 'utf8')
if (!/^TEST_ORIGIN=(https:\/\/klipper-2\.tail1ade8e\.ts\.net:8443|http:\/\/100\.84\.251\.49:3137|http:\/\/localhost:3137)$/m.test(input)) throw new Error('Unexpected origin; preserved')
writeFileSync(file, input.replace(/^TEST_ORIGIN=.*$/m, 'TEST_ORIGIN=http://localhost:3137'), {mode:0o600})
console.log('Test origin uses SSH localhost tunnel; credentials unchanged.')
