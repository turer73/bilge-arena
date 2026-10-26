/**
 * /p/[code] paylasim baglantisi imzasi.
 *
 * Eskiden /p/[code] ve /api/og/result/[code] baslik, skor ve kategoriyi
 * dogrudan URL'den basiyordu: var olmayan bir kod ve uydurma metinle
 * bilgearena.com alanindan sahte sonuc karti uretilebiliyordu (genel tarama
 * 2026-10-26, disc #2950). Artik degerleri sunucu, oyuncunun kendi oturumuyla
 * oda-DB'den okuyup imzalar (POST /api/rooms/share-link); sayfa ve OG karti
 * yalniz imzasi tutan degerleri gosterir, digerlerinde genel kart cizer.
 *
 * Edge (OG route) ve Node'da calismasi icin Web Crypto HMAC-SHA256 kullanilir;
 * dogrulama subtle.verify ile sabit zamanlidir.
 */
import { ROOM_CODE_REGEX } from './validations'
import { isValidCategory } from './categories'

export const SHARE_TITLE_MAX = 80
export const SHARE_SCORE_MAX = 1_000_000
const SECRET_MIN_LENGTH = 32
const PAYLOAD_VERSION = 'bilge-arena/share-link/v1'

export interface ShareClaims {
  code: string
  title: string
  score: number | null
  category: string | null
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

/** Ayri sir zorunlu; yoksa imzali paylasim kapali kalir (genel kart). */
export function shareLinkSecret(): string | null {
  const secret = process.env.SHARE_LINK_SECRET
  return secret && secret.length >= SECRET_MIN_LENGTH ? secret : null
}

export function isShareRoomCode(code: unknown): code is string {
  return typeof code === 'string' && ROOM_CODE_REGEX.test(code)
}

/** Kontrol karakterlerini atar, bosluklari teklestirir, uzunlugu sinirlar. */
export function normalizeShareTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title) return null
  return Array.from(title).slice(0, SHARE_TITLE_MAX).join('')
}

function normalizeScore(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= SHARE_SCORE_MAX ? value : null
  }
  if (typeof value !== 'string' || !/^[1-9]\d{0,6}$/.test(value)) return null
  const score = Number(value)
  return score <= SHARE_SCORE_MAX ? score : null
}

function normalizeCategory(value: unknown): string | null {
  return typeof value === 'string' && isValidCategory(value) ? value : null
}

function payload(claims: ShareClaims): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    [PAYLOAD_VERSION, claims.code, claims.title, claims.score ?? '', claims.category ?? ''].join('\n'),
  )
}

async function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=')
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Sunucunun oda-DB'den okudugu degerleri imzalar ve /p ile OG route'un
 * okudugu sorgu parametrelerini dondurur. Gecersiz kod veya bos baslikta null.
 */
export async function signShareClaims(
  input: { code: string; title: string; score?: number | null; category?: string | null },
  secret: string,
): Promise<URLSearchParams | null> {
  const title = normalizeShareTitle(input.title)
  if (!isShareRoomCode(input.code) || !title) return null
  const claims: ShareClaims = {
    code: input.code,
    title,
    score: normalizeScore(input.score ?? null),
    category: normalizeCategory(input.category ?? null),
  }
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), payload(claims))
  const params = new URLSearchParams({ og_title: claims.title })
  if (claims.score !== null) params.set('og_score', String(claims.score))
  if (claims.category !== null) params.set('og_category', claims.category)
  params.set('og_sig', toBase64Url(signature))
  return params
}

/**
 * Imzasi tutan degerleri dondurur; imza yok, bozuk ya da sir tanimsizsa null.
 * Cagiran null'da URL'deki metni HIC gostermemeli (genel kart).
 */
export async function verifyShareParams(
  code: unknown,
  source: ParamSource,
  secret: string | null = shareLinkSecret(),
): Promise<ShareClaims | null> {
  if (!secret || !isShareRoomCode(code)) return null
  const signature = fromBase64Url(read(source, 'og_sig') ?? '')
  const rawTitle = read(source, 'og_title')
  const title = normalizeShareTitle(rawTitle)
  if (!signature || !title || title !== rawTitle) return null

  const rawScore = read(source, 'og_score')
  const score = rawScore === undefined ? null : normalizeScore(rawScore)
  if (rawScore !== undefined && score === null) return null
  const rawCategory = read(source, 'og_category')
  const category = rawCategory === undefined ? null : normalizeCategory(rawCategory)
  if (rawCategory !== undefined && category === null) return null

  const claims: ShareClaims = { code, title, score, category }
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signature, payload(claims))
    return ok ? claims : null
  } catch {
    return null
  }
}
