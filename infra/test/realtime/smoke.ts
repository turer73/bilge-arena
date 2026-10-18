/**
 * Oda Realtime duman testi (inceleme §4.1).
 *
 * Uygulamanin kendi istemci kodu (createOdaRealtimeClient + setupRoomChannel,
 * realtime-js 2.117.3) ve /api/realtime/token ile ayni imzalama kodu
 * (realtime-token.ts) yalitilmis supabase/realtime v2.140.7 + bilge-arena-db
 * (wal2json) yiginina baglanir. Iki faz:
 *
 *   before: bugunku VPS ayari (SEED_SELF_HOST=true, tenant sirri ==
 *           API_JWT_SECRET, aud dogrulamasi yok, 27 uygulanmamis), eski
 *           istemci davranisi (public kanal). Aciklarin yeniden uretimi.
 *   after:  onerilen ayar (SEED_SELF_HOST=false, ayri API_JWT_SECRET,
 *           JWT_CLAIM_VALIDATORS aud, 27 uygulanmis), yeni istemci.
 *
 * Token, sir, e-posta ya da yanit govdesi loglanmaz.
 */

import pg from 'pg'
import { RealtimeClient, type RealtimeChannel } from '@supabase/supabase-js'
import {
  buildRealtimeTokenClaims,
  signRealtimeToken,
  type RealtimeTokenClaims,
} from '../../../src/lib/rooms/realtime-token'
import { createOdaRealtimeClient, type OdaRealtimeToken } from '../../../src/lib/rooms/oda-realtime-client'
import { setupRoomChannel } from '../../../src/lib/rooms/setup-room-channel'
import type { RoomEvent } from '../../../src/lib/rooms/room-state-reducer'

// before / after: izole yigin (run.sh).
// prod-probe: uretimde DB'ye dokunmadan yalniz reddedilmesi gerekenleri yoklar.
// prod-pair: uretimde sentetik oda (sabit UUID'ler, gercek kullanici degil)
//   kurar, iki oyuncu kontrolunu kosar, odayi siler. DB'ye yazar: onayla kos.
const PHASES = ['before', 'after', 'prod-probe', 'prod-pair'] as const
const phase = process.argv[2] as (typeof PHASES)[number]
if (!PHASES.includes(phase)) throw new Error(`usage: smoke.mjs ${PHASES.join('|')}`)

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

const WS_URL = process.env.SMOKE_WS_URL ?? 'ws://ws-dev.smoke:4000/socket'
const HTTP_URL = process.env.SMOKE_HTTP_URL ?? 'http://ws-dev.smoke:4000'
/** Yonetim API'sine edge'i atlayarak (ic ag) ulasilan adres; yoksa HTTP_URL. */
const ADMIN_URL = process.env.SMOKE_ADMIN_URL ?? HTTP_URL
const TENANT_SECRET = env('SMOKE_TENANT_SECRET')
const ADMIN_SECRET = process.env.SMOKE_ADMIN_SECRET ?? ''
const db = phase === 'prod-probe' ? null : new pg.Client({ connectionString: env('SMOKE_DATABASE_URL') })
function sql(text: string, values?: unknown[]) {
  if (!db) throw new Error('prod-probe DB kullanmaz')
  return db.query(text, values)
}

const ROOM = '5a0e0000-0000-4000-8000-000000000001'
const TOPIC = `room-${ROOM}`
const U = {
  host: '5a0e0000-0000-4000-8000-00000000000a',
  player: '5a0e0000-0000-4000-8000-00000000000b',
  refresher: '5a0e0000-0000-4000-8000-00000000000c',
  staticKey: '5a0e0000-0000-4000-8000-000000000011',
  expiring: '5a0e0000-0000-4000-8000-000000000012',
  kicked: '5a0e0000-0000-4000-8000-00000000000d',
  outsider: '5a0e0000-0000-4000-8000-00000000000e',
} as const

type Result = { id: string; ok: boolean; detail: string; info?: boolean }
const results: Result[] = []
function record(id: string, ok: boolean, detail: string, info = false) {
  results.push({ id, ok, detail, info })
  console.log(`${info ? 'INFO' : ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (pred()) return true
    await sleep(200)
  }
  return pred()
}

function mint(sub: string, patch: Partial<RealtimeTokenClaims> & Record<string, unknown> = {}, secret = TENANT_SECRET) {
  const claims = { ...buildRealtimeTokenClaims(sub), ...patch } as RealtimeTokenClaims
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (claims as Record<string, unknown>)[k]
  return { token: signRealtimeToken(claims, secret), expiresAtMs: claims.exp * 1000 }
}

/** /api/realtime/token yerine gecen kaynak: ayni claim'ler, istege bagli kisa omur. */
function tokenSource(sub: string, ttlSec?: number) {
  let calls = 0
  const fetchToken = async (): Promise<OdaRealtimeToken> => {
    calls += 1
    const iat = Math.floor(Date.now() / 1000)
    return mint(sub, ttlSec ? { iat, exp: iat + ttlSec } : {})
  }
  return { fetchToken, calls: () => calls }
}

/** Uygulamanin yolu: createOdaRealtimeClient + setupRoomChannel. */
async function appMember(sub: string, ttlSec?: number) {
  const src = tokenSource(sub, ttlSec)
  const client = await createOdaRealtimeClient({ wsUrl: WS_URL, fetchToken: src.fetchToken })
  if (!client) throw new Error(`client for ${sub} not created`)
  const events: RoomEvent[] = []
  const channel = setupRoomChannel(client, ROOM, sub, (e) => events.push(e))
  return { sub, client, channel, events, tokenCalls: src.calls }
}

/** Ham kanal: eski istemci (public) ya da yetkisiz deneme gozlemi icin. */
function rawJoin(client: RealtimeClient, key: string, isPrivate: boolean, topic = TOPIC) {
  const statuses: string[] = []
  const errors: string[] = []
  const typing: string[] = []
  const system: string[] = []
  const ch = client.channel(topic, { config: { private: isPrivate, presence: { key } } })
  ch.on('broadcast' as never, { event: 'typing_start' } as never, (m: { payload?: { user_id?: string } }) => {
    if (m.payload?.user_id) typing.push(m.payload.user_id)
  })
  ch.on('system' as never, { event: '*' } as never, (p: { status?: string; message?: string }) => {
    system.push(`${p.status ?? ''}:${p.message ?? ''}`)
  })
  ch.subscribe((status, err) => {
    statuses.push(status)
    if (err) errors.push(err.message)
    if (status === 'SUBSCRIBED') void ch.track({ user_id: key })
  })
  const presence = () => Object.keys(ch.presenceState())
  return { ch, statuses, errors, typing, system, presence }
}

function rawClient(token: string, accessToken?: () => Promise<string>) {
  const client = new RealtimeClient(WS_URL, {
    params: { apikey: token, vsn: '1.0.0' },
    ...(accessToken ? { accessToken } : {}),
  })
  client.connect()
  return client
}

function typing(ch: RealtimeChannel, sub: string) {
  return ch.send({ type: 'broadcast', event: 'typing_start', payload: { user_id: sub } })
}

function lastOnline(events: RoomEvent[]): string[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'PRESENCE_SYNC') return e.payload.online
  }
  return []
}
const typed = (events: RoomEvent[], sub: string, from = 0) =>
  events.slice(from).some((e) => e.type === 'TYPING_START' && e.payload.user_id === sub)
const joinedAfter = (events: RoomEvent[], sub: string, from: number) =>
  events.slice(from).some((e) => e.type === 'PRESENCE_JOIN' && e.payload.user_id === sub)

async function wsProbe(token: string): Promise<'open' | 'rejected' | 'timeout'> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/websocket?apikey=${encodeURIComponent(token)}&vsn=1.0.0`)
    const t = setTimeout(() => { ws.close(); resolve('timeout') }, 6000)
    ws.onopen = () => { clearTimeout(t); ws.close(); resolve('open') }
    ws.onerror = () => { clearTimeout(t); resolve('rejected') }
  })
}

async function adminStatus(token: string, base = ADMIN_URL): Promise<number> {
  const res = await fetch(`${base}/api/tenants`, { headers: { Authorization: `Bearer ${token}` } })
  await res.arrayBuffer()
  return res.status
}

/**
 * postgres_changes: Realtime replikasyon aboneligini katilimdan sonra kurar;
 * o ana kadarki degisiklik kacabilir. 3 sn arayla UPDATE atilir, ilk teslime
 * kadar gecen sure (ms) ya da 45 sn'de teslim yoksa null doner.
 */
async function firstChangeDelivery(delivered: () => boolean): Promise<number | null> {
  const start = Date.now()
  while (Date.now() - start < 45_000) {
    await sql('UPDATE public.room_members SET score = score + 1 WHERE room_id = $1 AND user_id = $2', [ROOM, U.player])
    if (await waitFor(delivered, 3000)) return Date.now() - start
  }
  return null
}

/** Ag kopmasi: soket kapanir, realtime-js kendisi yeniden baglanir. */
function dropConnection(client: RealtimeClient) {
  const socket = (client as unknown as { socketAdapter: { getSocket(): { conn: WebSocket | null } } })
    .socketAdapter.getSocket()
  socket.conn?.close()
}

async function seedFixture() {
  await sql('DELETE FROM public.rooms WHERE id = $1', [ROOM])
  await sql(
    `INSERT INTO public.rooms (id, code, host_id, title, category, difficulty, question_count,
       max_players, per_question_seconds, mode, state)
     VALUES ($1, 'SMKRTA', $2, 'Realtime smoke', 'smoke', 2, 5, 8, 20, 'sync', 'lobby')`,
    [ROOM, U.host],
  )
  const rows: Array<[string, string, boolean]> = [
    [U.host, 'host', true],
    [U.player, 'player', true],
    [U.refresher, 'player', true],
    [U.staticKey, 'player', true],
    [U.expiring, 'player', true],
    [U.kicked, 'player', false],
  ]
  for (const [uid, role, active] of rows) {
    await sql(
      `INSERT INTO public.room_members (room_id, user_id, role, is_active, left_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NULL ELSE NOW() END)`,
      [ROOM, uid, role, active],
    )
  }
}

async function before() {
  // B1: kullanici token'i yonetim API'sinde
  const user = mint(U.outsider).token
  const s = await adminStatus(user)
  record('B1 admin API + kullanici token', s === 200, `GET /api/tenants -> ${s} (bugunku VPS'te olculen: 200)`)

  // B2: aud'suz token kabul ediliyor mu
  const noAud = mint(U.outsider, { aud: undefined }).token
  const p = await wsProbe(noAud)
  record('B2 aud dogrulamasi yok', p === 'open', `aud'suz token ile soket -> ${p}`)

  // B3: eski istemci (public kanal) — uye olmayan presence okur, typing alir/gonderir
  const host = rawJoin(rawClient(mint(U.host).token), U.host, false)
  const out = rawJoin(rawClient(mint(U.outsider).token), U.outsider, false)
  await waitFor(() => host.statuses.includes('SUBSCRIBED') && out.statuses.includes('SUBSCRIBED'), 15000)
  await waitFor(() => out.presence().includes(U.host), 8000)
  await typing(host.ch, U.host)
  await typing(out.ch, U.outsider)
  await waitFor(() => out.typing.includes(U.host) && host.typing.includes(U.outsider), 6000)
  record(
    'B3 public kanal sizintisi',
    out.presence().includes(U.host) && out.typing.includes(U.host) && host.typing.includes(U.outsider),
    `yabanci presence'ta host'u gordu=${out.presence().includes(U.host)}, host typing'ini aldi=${out.typing.includes(U.host)}, sahte typing host'a ulasti=${host.typing.includes(U.outsider)}`,
  )

  // B5: postgres_changes bugunku (public) kanalda calisiyor mu — A3 ile kiyas
  let pubChanges = 0
  const pubClient = rawClient(mint(U.host).token)
  pubClient
    .channel(TOPIC, { config: { presence: { key: `${U.host}-pgc` } } })
    .on('postgres_changes' as never,
      { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `room_id=eq.${ROOM}` } as never,
      () => { pubChanges += 1 })
    .subscribe()
  const pubDelivery = await firstChangeDelivery(() => pubChanges > 0)
  record('B5 postgres_changes public kanalda', true,
    `ilk teslim ${pubDelivery === null ? 'yok (45 sn)' : `${pubDelivery} ms`}`, true)

  // B4: 27 uygulanmadan private kanal uyeye bile kapali (siralama gerekcesi)
  const priv = rawJoin(rawClient(mint(U.player).token), U.player, true)
  await waitFor(() => priv.statuses.length > 0, 10000)
  record(
    'B4 27 oncesi private kanal',
    !priv.statuses.includes('SUBSCRIBED'),
    `uye private join -> ${priv.statuses.join(',') || 'yanit yok'} hata=${priv.errors[0]?.slice(0, 100) ?? '-'} (27 deploy'dan once uygulanmali)`,
    true,
  )
}

type AppMember = Awaited<ReturnType<typeof appMember>>

async function pairChecks() {
  // A1-A3: iki oyuncu, uygulama kodu, private kanal
  const host = await appMember(U.host)
  const player = await appMember(U.player)
  const mutual = await waitFor(
    () => lastOnline(host.events).includes(U.player) && lastOnline(player.events).includes(U.host),
    15000,
  )
  record('A1 iki uye private kanalda birbirini goruyor', mutual,
    `host online=${lastOnline(host.events).length}, player online=${lastOnline(player.events).length}`)

  await typing(player.channel, U.player)
  record('A2 typing uyeden uyeye', await waitFor(() => typed(host.events, U.player), 6000), 'player -> host TYPING_START')

  const pgc = await firstChangeDelivery(
    () => host.events.some((e) => e.type === 'MEMBER_UPDATE' && e.payload.user_id === U.player),
  )
  record('A3 postgres_changes private kanalda', pgc !== null,
    `room_members UPDATE -> host MEMBER_UPDATE; ilk teslim ${pgc === null ? 'yok (45 sn)' : `${pgc} ms`}`)

  // A4-A5: yabanci ve atilan uye private kanala giremez
  for (const [id, sub] of [['A4 yabanci', U.outsider], ['A5 atilan uye', U.kicked]] as const) {
    const j = rawJoin(rawClient(mint(sub).token), sub, true)
    await waitFor(() => j.statuses.length > 0, 10000)
    await sleep(1500)
    const denied = !j.statuses.includes('SUBSCRIBED') && !lastOnline(host.events).includes(sub)
    record(`${id} private join reddedildi`, denied,
      `durum=${j.statuses.join(',') || 'yanit yok'} hata=${j.errors[0]?.slice(0, 80) ?? '-'}`)
  }

  // A6: ayni adli public kanal ayri topic — presence ve typing karismaz
  const outPub = rawJoin(rawClient(mint(U.outsider).token), U.outsider, false)
  await waitFor(() => outPub.statuses.includes('SUBSCRIBED'), 10000)
  const typingMark = host.events.length
  await typing(outPub.ch, U.outsider)
  await typing(player.channel, U.player)
  await sleep(4000)
  const isolated =
    !outPub.presence().includes(U.host) &&
    !outPub.typing.includes(U.player) &&
    !typed(host.events, U.outsider, typingMark)
  record('A6 public ayni ad izole', isolated,
    `public abone=${outPub.statuses.includes('SUBSCRIBED')}, uye presence gordu=${outPub.presence().includes(U.host)}, uye typing aldi=${outPub.typing.includes(U.player)}, sahte typing uyeye ulasti=${typed(host.events, U.outsider, typingMark)}`)

  return { host, player }
}

async function tokenChecks() {
  // A7: soket seviyesinde token kurallari
  const probes = {
    dogru: await wsProbe(mint(U.outsider).token),
    audsuz: await wsProbe(mint(U.outsider, { aud: undefined }).token),
    yanlisAud: await wsProbe(mint(U.outsider, { aud: 'authenticated' as never }).token),
    suresiDolmus: await wsProbe(mint(U.outsider, { iat: 1_700_000_000, exp: 1_700_000_600 }).token),
    adminSirri: await wsProbe(mint(U.outsider, {}, ADMIN_SECRET).token),
  }
  record('A7 token kurallari', probes.dogru === 'open' && probes.yanlisAud === 'rejected' &&
    probes.suresiDolmus === 'rejected' && probes.adminSirri === 'rejected',
  JSON.stringify(probes))
  // Realtime'in JWT_CLAIM_VALIDATORS'u (Joken) yalniz token'da bulunan claim'i
  // dogrular; aud'suz token'i reddetmez. Boyle bir token'i yalniz tenant sirrini
  // bilen (Vercel route'u, her zaman aud ekler) uretebilir.
  record('A7b aud claim eksikse', true, `aud'suz token -> ${probes.audsuz} (dogrulayici yalniz mevcut aud'u kontrol eder)`, true)

  // A8: yonetim API'si kullanici token'ini reddeder, ayri admin sirri calisir
  const userStatus = await adminStatus(mint(U.outsider).token)
  const now = Math.floor(Date.now() / 1000)
  const adminNoAud = signRealtimeToken({ role: 'service_role', iat: now, exp: now + 60 } as never, ADMIN_SECRET)
  const adminAud = mint('admin', { role: 'service_role' as never }, ADMIN_SECRET).token
  const a1 = await adminStatus(adminNoAud)
  const a2 = await adminStatus(adminAud)
  record('A8 yonetim API ayrimi', userStatus === 403 && (a1 === 200 || a2 === 200),
    `kullanici token -> ${userStatus}; admin sirri aud'suz -> ${a1}, aud'lu -> ${a2}`)

}

async function lifecycleChecks(host: AppMember, player: AppMember) {
  // A9-A13: yenileme, yeniden baglanma, sure zorlamasi, kick
  const t0 = Date.now()
  const refresher = await appMember(U.refresher, 150)
  const statik = rawJoin(
    rawClient(mint(U.staticKey, { iat: Math.floor(t0 / 1000), exp: Math.floor(t0 / 1000) + 60 }).token,
      async () => mint(U.staticKey).token),
    U.staticKey, true,
  )
  const expiringTok = mint(U.expiring, { iat: Math.floor(t0 / 1000), exp: Math.floor(t0 / 1000) + 40 }).token
  const expiring = rawJoin(rawClient(expiringTok), U.expiring, true)
  await waitFor(() => lastOnline(host.events).includes(U.refresher) && statik.statuses.includes('SUBSCRIBED') &&
    expiring.statuses.includes('SUBSCRIBED'), 15000)

  await sleep(Math.max(0, t0 + 55_000 - Date.now()))
  const expiredClosed = expiring.statuses.some((s) => s !== 'SUBSCRIBED') || expiring.system.length > 0 ||
    expiring.ch.state !== 'joined'
  record('A12 sunucu suresi dolan token kanalini kapatir', expiredClosed,
    `durumlar=${expiring.statuses.join(',')} system=${expiring.system.slice(0, 2).join('|') || '-'} state=${expiring.ch.state}`)

  await sleep(Math.max(0, t0 + 70_000 - Date.now()))
  const hostMarkStatic = host.events.length
  dropConnection((statik.ch as unknown as { socket: RealtimeClient }).socket)
  await sleep(15_000)
  record('A11 kontrol: apikey guncellenmezse reconnect reddedilir',
    !joinedAfter(host.events, U.staticKey, hostMarkStatic),
    `statik apikey istemcisi kopmadan sonra geri katildi=${joinedAfter(host.events, U.staticKey, hostMarkStatic)}`, true)

  await sleep(Math.max(0, t0 + 165_000 - Date.now()))
  const mark = host.events.length
  await typing(refresher.channel, U.refresher)
  const alive = await waitFor(() => typed(host.events, U.refresher, mark), 6000)
  record('A9 token yenilemesi ilk token suresini asar', alive && refresher.tokenCalls() >= 2 &&
    lastOnline(host.events).includes(U.refresher),
  `token istegi=${refresher.tokenCalls()}, 165. sn'de typing ulasti=${alive}`)

  const dropMark = host.events.length
  dropConnection(refresher.client)
  const rejoined = await waitFor(() => joinedAfter(host.events, U.refresher, dropMark), 25_000)
  record('A10 ilk token dolduktan sonra reconnect', rejoined, `kopma sonrasi presence join=${rejoined}`)

  await sql(
    'UPDATE public.room_members SET is_active = FALSE, left_at = NOW() WHERE room_id = $1 AND user_id = $2',
    [ROOM, U.refresher],
  )
  const kickMark = host.events.length
  const callsAtKick = refresher.tokenCalls()
  const revoked = await waitFor(
    () => host.events.slice(kickMark).some((e) => e.type === 'PRESENCE_LEAVE' && e.payload.user_id === U.refresher) ||
      refresher.events.slice(0).some((e) => e.type === 'CHANNEL_ERROR'),
    120_000,
  )
  record('A13 oyun sirasinda atilan uyenin kanali', revoked,
    `token yenilemesi=${refresher.tokenCalls() - callsAtKick}, kanal kapandi=${revoked}`, true)

  for (const c of [host.client, player.client, refresher.client]) void c.disconnect()
}

async function after() {
  const { host, player } = await pairChecks()
  await tokenChecks()
  await lifecycleChecks(host, player)
}

async function prodPair() {
  try {
    const { host, player } = await pairChecks()
    await Promise.all([host.client.disconnect(), player.client.disconnect()])
  } finally {
    await sql('DELETE FROM public.rooms WHERE id = $1', [ROOM])
    const left = await sql('SELECT 1 FROM public.room_members WHERE room_id = $1', [ROOM])
    record('C1 sentetik oda silindi', left.rows.length === 0, `kalan uye satiri=${left.rows.length}`)
  }
}

async function prodProbe() {
  const user = mint(U.outsider).token
  const edge = await adminStatus(user, HTTP_URL)
  record('P1 yonetim API disaridan', edge === 403 || edge === 404, `${new URL(HTTP_URL).host}/api/tenants -> ${edge}`)
  if (ADMIN_URL !== HTTP_URL) {
    const internal = await adminStatus(user)
    record('P2 yonetim API ic agdan + kullanici token', internal === 403, `-> ${internal}`)
    if (ADMIN_SECRET) {
      const now = Math.floor(Date.now() / 1000)
      const admin = signRealtimeToken({ role: 'service_role', iat: now, exp: now + 60 } as never, ADMIN_SECRET)
      const ok = await adminStatus(admin)
      record('P2b yonetim API ayri admin sirriyla', ok === 200, `-> ${ok}`)
    }
  }
  const probes = {
    dogru: await wsProbe(mint(U.outsider).token),
    yanlisAud: await wsProbe(mint(U.outsider, { aud: 'authenticated' as never }).token),
    suresiDolmus: await wsProbe(mint(U.outsider, { iat: 1_700_000_000, exp: 1_700_000_600 }).token),
  }
  record('P3 token kurallari', probes.dogru === 'open' && probes.yanlisAud === 'rejected' &&
    probes.suresiDolmus === 'rejected', JSON.stringify(probes))
  const j = rawJoin(rawClient(user), U.outsider, true, `room-${crypto.randomUUID()}`)
  await waitFor(() => j.statuses.length > 0, 10000)
  record('P4 uye olmayan private join', !j.statuses.includes('SUBSCRIBED') && /Unauthorized/.test(j.errors[0] ?? ''),
    `durum=${j.statuses.join(',') || 'yanit yok'} hata=${j.errors[0]?.slice(0, 60) ?? '-'}`)
}

async function main() {
  if (db) await db.connect()
  try {
    if (phase === 'prod-probe') await prodProbe()
    else {
      await seedFixture()
      if (phase === 'before') await before()
      else if (phase === 'after') await after()
      else await prodPair()
    }
  } finally {
    if (db) await db.end()
  }
  const failed = results.filter((r) => !r.ok && !r.info)
  console.log(`\nSUMMARY phase=${phase} pass=${results.filter((r) => r.ok && !r.info).length} fail=${failed.length} info=${results.filter((r) => r.info).length}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('smoke crashed:', err instanceof Error ? err.message : String(err))
  process.exit(2)
})
