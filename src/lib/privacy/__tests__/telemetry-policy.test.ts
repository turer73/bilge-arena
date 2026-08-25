import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  isCurrentBrowserPathSensitive,
  isSensitiveTelemetryUrl,
  isSensitiveWorkspacePath,
} from '../telemetry-policy'

describe('sensitive workspace telemetry policy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    '/admin',
    '/admin/kurumlar/abc',
    '/arena/kurum',
    '/arena/kurum/sinif/abc?tab=ogrenciler',
    '/arena/sinif/ogretmen',
    '/arena/sinif/odev/abc#sonuc',
    '/%61dmin/sorular',
    '/arena/%6Burum/roller',
    '/arena%2Fsinif/davet',
    '/api/admin/institutions',
    '/api/institution/workspace',
    '/api/teacher/classrooms/abc',
  ])('%s yolunda ucuncu taraf telemetriyi engeller', (pathname) => {
    expect(isSensitiveWorkspacePath(pathname)).toBe(true)
  })

  it.each(['/administrator', '/arena/kurumsal', '/arena/siniflar', '/arena/matematik']) (
    '%s benzer fakat hassas olmayan segmenti engellemez',
    (pathname) => expect(isSensitiveWorkspacePath(pathname)).toBe(false),
  )

  it('tam URL icindeki hassas rotayi tanir', () => {
    expect(isSensitiveTelemetryUrl('https://bilgearena.com/admin/loglar?x=1')).toBe(true)
    expect(isSensitiveTelemetryUrl('https://bilgearena.com/hakkinda')).toBe(false)
    expect(isSensitiveTelemetryUrl('https://bilgearena.com/api/institution/workspace')).toBe(true)
  })

  it('browser konumunu uygulama ici gecislerde yeniden degerlendirir', () => {
    window.history.replaceState({}, '', '/arena/kurum')
    expect(isCurrentBrowserPathSensitive()).toBe(true)
    window.history.replaceState({}, '', '/hakkinda')
    expect(isCurrentBrowserPathSensitive()).toBe(false)
  })
})
