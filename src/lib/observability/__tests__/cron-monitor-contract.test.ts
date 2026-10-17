import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vercel.json'daki her cron, route'unda aynı ad ve zamanlamayla izlenmeli.
// Zamanlama iki yerde yazılı; biri değişip öteki kalırsa Sentry Crons yanlış
// saatte "kaçırıldı" der ya da gerçek kaçırmayı görmez.
const root = process.cwd()
const crons = (JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  crons: Array<{ path: string; schedule: string }>
}).crons

describe('cron monitor contract', () => {
  it('has at least the five known crons', () => {
    expect(crons.length).toBeGreaterThanOrEqual(5)
  })

  it.each(crons.map((cron) => [cron.path, cron.schedule]))('%s is wrapped with its vercel.json schedule', (path, schedule) => {
    const slug = path.split('/').at(-1)
    const source = readFileSync(join(root, 'src/app', path, 'route.ts'), 'utf8')
    expect(source).toContain(`export const GET = withCronMonitor('${slug}', '${schedule}',`)
    expect(source).not.toMatch(/export async function GET/)
  })
})
