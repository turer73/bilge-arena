// Run only inside the new isolated Klipper checkout. Never imports local/prod env.
import { randomBytes, createHmac } from 'node:crypto'
import { writeFileSync, existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const here = fileURLToPath(new URL('.', import.meta.url))
if (realpathSync(here) !== '/home/klipperos/bilge-arena-academy-test/source/infra/test/klipper') {
  throw new Error('Refusing to generate environment outside dedicated test directory')
}
if (existsSync(new URL('.env', import.meta.url))) throw new Error('Existing test environment preserved')
const env = { TEST_ORIGIN: 'http://localhost:3137' }
for (const key of ['DB_PASSWORD', 'AUTH_DB_PASSWORD', 'REST_DB_PASSWORD', 'ROOM_APP_PASSWORD', 'ROOM_AUTH_PASSWORD', 'JWT_SECRET', 'CONSENT_SECRET', 'TEST_USER_PASSWORD']) env[key] = randomBytes(32).toString('hex')
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = role => {
  const now = Math.floor(Date.now() / 1000)
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'academy-isolated-test', iat: now, exp: now + 86400 * 90 })}`
  return `${body}.${createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url')}`
}
env.ANON_KEY = token('anon')
env.SERVICE_ROLE_KEY = token('service_role')
writeFileSync(new URL('.env', import.meta.url), Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n') + '\n', {mode: 0o600, flag: 'wx'})
console.log('Isolated credentials created; values intentionally not printed.')
