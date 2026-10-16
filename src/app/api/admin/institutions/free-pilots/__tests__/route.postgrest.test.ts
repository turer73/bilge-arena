// @vitest-environment node
//
// POST /api/admin/institutions/free-pilots gerçek PostgreSQL + PostgREST'te.
// route.test.ts servis-role istemcisini mock'ladığı için 112 ve 158'in pilot
// tablolarından service_role dahil REVOKE ALL yaptığını göremedi: route'un
// tekrar/uygunluk ön okumaları canlıda 42501 alıp her isteği 503'e çeviriyordu
// (disc #2531, 16 Ekim 2026 canlı ölçüm: dört tabloda service_role SELECT yok).
//
// Burada route mock'suz supabase-js ile gider: tarayıcı istemcisi authenticated
// + aal2 JWT taşır, RPC 168'deki tanımın aynısıdır, tablo ve fonksiyon ACL'i
// düzeneğin toplu GRANT'ından sonra migration metninden aynen geri uygulanır.
// Yalnız GoTrue (yönetici e-postası) auth.users'tan okunarak, e-posta gönderimi
// ve hız sınırı ise sabitlenir.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  readMigrationFunction,
  readRepoFile,
  signJwt,
  startPostgrestContract,
  type PgClient,
  type PostgrestContract,
  type SessionUser,
} from '@/test/postgrest-contract/harness'

const state = vi.hoisted(() => ({
  db: null as PgClient | null,
  browser: null as unknown,
  mailResult: { ok: true, id: 'email-1' } as { ok: boolean; id?: string; error?: string },
  mails: [] as Array<{ to: string; idempotencyKey?: string; committedFreePilots: number }>,
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state.browser }))
vi.mock('@/lib/institution-pilot/server-security', () => ({
  isInstitutionFreePilotEnabled: () => true,
  isInstitutionPilotEnabled: () => true,
}))
vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: () => true,
  isInstitutionStudyProgramEnabled: () => true,
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: async () => ({ success: true }) }),
}))
// GoTrue bu düzenekte yok; yönetici kaydını RPC'nin de okuduğu auth.users'tan verir.
vi.mock('@/lib/supabase/service-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/service-role')>()
  return {
    ...actual,
    createServiceRoleClient: () => {
      const client = actual.createServiceRoleClient()
      Object.assign(client.auth.admin, {
        getUserById: async (id: string) => {
          const { rows } = await state.db!.query<{ email: string | null; email_confirmed_at: string | null }>(
            'SELECT email, email_confirmed_at::text FROM auth.users WHERE id = $1',
            [id],
          )
          return rows[0]
            ? { data: { user: { id, ...rows[0], user_metadata: { display_name: 'Kurum Yöneticisi' } } }, error: null }
            : { data: { user: null }, error: { message: 'User not found', status: 404 } }
        },
      })
      return client
    },
  }
})
// Gönderim anında kaç ücretsiz pilotun commit edilmiş olduğunu ayrı bağlantıdan kaydeder.
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (params: { to: string; idempotencyKey?: string }) => {
    const { rows } = await state.db!.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.pilot_institutions WHERE pilot_kind = 'invitation_free'",
    )
    state.mails.push({ to: params.to, idempotencyKey: params.idempotencyKey, committedFreePilots: rows[0].n })
    return state.mailResult
  },
}))

const PILOT_TABLES = [
  'pilot_institution_requests',
  'institution_pilot_controls',
  'pilot_institutions',
  'pilot_institution_memberships',
]

// 112 + 158 (+ 155/168 fonksiyonları). Sütunlar route ve RPC'nin kullandığı
// kadardır; kısıt adları üretimdekiyle aynıdır (FK'ler assert ile sınanır).
const FIXTURE_SQL = `
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

  -- GoTrue sütunları: RPC onaylı yöneticiyi auth.users'tan doğrular.
  ALTER TABLE auth.users
    ADD COLUMN email text,
    ADD COLUMN email_confirmed_at timestamptz,
    ADD COLUMN deleted_at timestamptz;

  CREATE TABLE public.pilot_institutions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
    status text NOT NULL DEFAULT 'pilot'
      CHECK (status IN ('pilot', 'active', 'suspended', 'archived')),
    student_limit smallint NOT NULL DEFAULT 200 CHECK (student_limit BETWEEN 1 AND 200),
    staff_limit smallint NOT NULL DEFAULT 6 CHECK (staff_limit BETWEEN 1 AND 6),
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    archived_at timestamptz,
    pilot_kind text NOT NULL DEFAULT 'commercial'
      CHECK (pilot_kind IN ('legacy', 'invitation_free', 'commercial')),
    review_due_at timestamptz,
    approval_ref text
  );
  CREATE UNIQUE INDEX pilot_institutions_one_open_free_pilot
    ON public.pilot_institutions (pilot_kind)
    WHERE pilot_kind = 'invitation_free' AND status IN ('pilot', 'active');

  CREATE TABLE public.pilot_institution_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
    institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('manager', 'teacher')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    ended_at timestamptz
  );
  CREATE UNIQUE INDEX pilot_institution_one_active_tenant_per_staff
    ON public.pilot_institution_memberships (user_id) WHERE status = 'active';

  CREATE TABLE public.pilot_institution_requests (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
    request_id uuid NOT NULL,
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (user_id, operation, request_id)
  );

  CREATE TABLE public.institution_pilot_controls (
    control_key text PRIMARY KEY
      CHECK (control_key IN ('free_provisioning', 'commercial_provisioning')),
    enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  INSERT INTO public.institution_pilot_controls(control_key, enabled)
  VALUES ('free_provisioning', false), ('commercial_provisioning', false);

  -- 158 + 167 (readiness_ref) + 20261009 (onboarding_mode). Kapı tetikleyicisi
  -- açılışı oturum ayarından değil, bu tablodaki son olaydan okur.
  CREATE TABLE public.institution_pilot_control_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_key text NOT NULL,
    previous_enabled boolean NOT NULL,
    enabled boolean NOT NULL,
    change_reference text NOT NULL
      CHECK (change_reference ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
    database_actor text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    readiness_ref text,
    onboarding_mode text NOT NULL DEFAULT 'comprehensive',
    CHECK (previous_enabled IS DISTINCT FROM enabled),
    UNIQUE (control_key, change_reference)
  );

  -- logAdminAction'ın yazdığı sütunlar.
  CREATE TABLE public.admin_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    details jsonb,
    created_at timestamptz DEFAULT now()
  );

  ALTER TABLE public.pilot_institutions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.pilot_institution_memberships ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.pilot_institution_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.institution_pilot_controls ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.institution_pilot_control_events ENABLE ROW LEVEL SECURITY;

  -- checkPermission tarayıcı istemcisiyle (authenticated) RBAC tablolarını
  -- okur; üretimde bu okuma RLS politikalarıyla açıktır, bu dosyanın konusu değil.
  GRANT SELECT ON public.roles, public.role_permissions, public.user_roles TO authenticated;
`

/** Bir migration'daki, deseni taşıyan gövdesiz REVOKE/GRANT/CREATE TRIGGER ifadeleri (aynen). */
function migrationStatements(migrationPath: string, pattern: RegExp) {
  const statements = [...readRepoFile(migrationPath).matchAll(/^(?:REVOKE|GRANT|CREATE TRIGGER)\b[^;]*;/gm)]
    .map((match) => match[0])
    .filter((statement) => pattern.test(statement))
  if (statements.length === 0) throw new Error(`no statement for ${pattern} in ${migrationPath}`)
  return statements
}

const M155 = 'database/migrations/155_institution_security_review_followup.sql'
const M158 = 'database/migrations/158_invitation_only_free_institution_pilot.sql'
const M167 = 'database/migrations/167_free_pilot_readiness_evidence_gate.sql'
const M168 = 'database/migrations/168_free_pilot_closed_gate_replay.sql'
const M20261009 = 'database/migrations/20261009200126_institution_basic_pilot_onboarding.sql'

// Her fonksiyon canlıdaki son tanımıdır (16 Ekim 2026'da prosrc md5 ile
// eşlendi; 155'tekiler canlıya CRLF satır sonuyla uygulanmış, metin aynı).
// pilot_institution_requests'in işlem olayı tetikleyicileri burada yoktur;
// RPC'yi tüm migration'larla database/__tests__/institution-pilot-foundation-postgres sınar.
const FUNCTION_SQL = [
  readMigrationFunction(M155, 'public.institution_rpc_actor_has_aal2'),
  readMigrationFunction(M155, 'public.institution_pilot_payload_hash'),
  readMigrationFunction(M155, 'public.institution_pilot_is_platform_admin'),
  readMigrationFunction(M158, 'public.enforce_free_pilot_lifecycle'),
  readMigrationFunction(M20261009, 'public.audit_institution_pilot_control_change'),
  readMigrationFunction(M20261009, 'public.enforce_institution_provisioning_control'),
  readMigrationFunction(M20261009, 'public.consume_free_pilot_readiness'),
  ...migrationStatements(M158, /^CREATE TRIGGER (?:institution_pilot_control_change_audit|institution_provisioning_control_guard|pilot_institutions_free_lifecycle_guard)\b/),
  ...migrationStatements(M167, /^CREATE TRIGGER institution_free_pilot_readiness_consume\b/),
  readMigrationFunction(M168, 'public.provision_free_pilot_institution'),
]

// Düzenek service_role'e her şeyi verir; üretimin ACL'i bunun üstüne yazılır.
const PRODUCTION_ACL_SQL = [
  ...migrationStatements('database/migrations/112_institution_pilot_foundation.sql', /ON TABLE[\s\S]*public\.pilot_institution_requests\b/),
  ...migrationStatements(M158, /ON TABLE public\.institution_pilot_control(?:s|_events)\b/),
  ...migrationStatements(M168, /public\.provision_free_pilot_institution\(/),
]

/** Kapıyı üretimdeki gibi açar/kapatır: denetim tetikleyicisi değişiklik referansı ister. */
function setFreeProvisioning(enabled: boolean) {
  const reference = `TEST-${enabled ? 'OPEN' : 'CLOSE'}-${randomUUID().toUpperCase()}`
  return `
    BEGIN;
    SELECT set_config('app.institution_control_change_ref', '${reference}', true),
           set_config('app.institution_onboarding_mode', 'basic', true);
    UPDATE public.institution_pilot_controls SET enabled = ${enabled} WHERE control_key = 'free_provisioning';
    COMMIT;`
}

const ids = {
  admin: randomUUID(),
  manager: randomUUID(),
  secondManager: randomUUID(),
  unconfirmedManager: randomUUID(),
  superAdminRole: randomUUID(),
  staffRole: randomUUID(),
}

function body(managerUserId: string, requestId: string) {
  return {
    name: ' Bilge Eğitim Merkezi ',
    managerUserId,
    packageAccepted: true,
    studentLimit: 30,
    staffLimit: 2,
    trialDays: 30,
    requestId,
  }
}

function post(payload: unknown) {
  return new Request('http://localhost/api/admin/institutions/free-pilots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as import('next/server').NextRequest
}

describePostgrest('/api/admin/institutions/free-pilots on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')
  let currentUser: SessionUser | null = null

  const count = async (sql: string, params: unknown[] = []) =>
    (await contract.db.query<{ n: number }>(`SELECT (${sql})::int AS n`, params)).rows[0].n

  beforeAll(async () => {
    contract = await startPostgrestContract([FIXTURE_SQL, ...FUNCTION_SQL])
    const { db } = contract
    state.db = db
    for (const statement of PRODUCTION_ACL_SQL) await db.query(statement)

    await db.query(
      `INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
        ($1, 'admin@example.com', now()), ($2, 'manager@example.com', now()),
        ($3, 'second@example.com', now()), ($4, 'unconfirmed@example.com', NULL)`,
      [ids.admin, ids.manager, ids.secondManager, ids.unconfirmedManager],
    )
    await db.query(
      `INSERT INTO public.profiles(id, username) VALUES
        ($1, 'platform_admin'), ($2, 'kurum_yonetici'), ($3, 'ikinci_yonetici'), ($4, 'onaysiz_yonetici')`,
      [ids.admin, ids.manager, ids.secondManager, ids.unconfirmedManager],
    )
    await db.query(
      `INSERT INTO public.roles(id, slug, name, is_system) VALUES
        ($1, 'super_admin', 'Süper yönetici', true), ($2, 'institution_pilot_staff', 'Kurum Pilotu Personeli', true)`,
      [ids.superAdminRole, ids.staffRole],
    )
    await db.query(
      `INSERT INTO public.role_permissions(role_id, permission) VALUES
        ($1, 'institution.pilots.manage'), ($2, 'institution.pilot.access')`,
      [ids.superAdminRole, ids.staffRole],
    )
    await db.query('INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $2)', [ids.admin, ids.superAdminRole])

    // Üretimdeki çerez istemcisi: authenticated rolü, AAL2 oturum.
    const secret = process.env.POSTGREST_CONTRACT_TEST_JWT_SECRET!
    const browser = createClient(contract.restOrigin, contract.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers)
          const claims = currentUser
            ? { role: 'authenticated', sub: currentUser.id, aal: 'aal2' }
            : { role: 'anon' }
          headers.set('Authorization', `Bearer ${signJwt(secret, claims)}`)
          return fetch(input, { ...init, headers })
        },
      },
    })
    Object.assign(browser.auth, { getUser: async () => ({ data: { user: currentUser }, error: null }) })
    Object.assign(browser.auth.mfa, {
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      }),
    })
    state.browser = browser

    route = await import('../route')
  }, 60_000)

  beforeEach(async () => {
    await contract.db.query(`
      TRUNCATE public.pilot_institution_memberships, public.pilot_institution_requests,
        public.pilot_institutions, public.admin_logs;
    `)
    // 9 Ekim 2026 canlı açılışıyla aynı biçim: basic modda auditli olay.
    const { rows } = await contract.db.query<{ enabled: boolean }>(
      "SELECT enabled FROM public.institution_pilot_controls WHERE control_key = 'free_provisioning'",
    )
    if (!rows[0].enabled) await contract.db.query(setFreeProvisioning(true))
    currentUser = { id: ids.admin }
    state.mailResult = { ok: true, id: 'email-1' }
    state.mails = []
  })

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live free pilot provisioning tables', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [])
  })

  it('keeps the pilot tables closed to service_role as production does', async () => {
    const { rows } = await contract.db.query<{ tbl: string; service_role: boolean; authenticated: boolean }>(
      `SELECT t AS tbl,
         has_table_privilege('service_role', 'public.' || t, 'SELECT') AS service_role,
         has_table_privilege('authenticated', 'public.' || t, 'SELECT') AS authenticated
       FROM unnest($1::text[]) AS t`,
      [PILOT_TABLES],
    )
    expect(rows).toEqual(PILOT_TABLES.map((tbl) => ({ tbl, service_role: false, authenticated: false })))

    // Eski route'un ilk adımı: servis anahtarıyla tekrar defterini okumak.
    const { error } = await contract.serviceClient()
      .from('pilot_institution_requests')
      .select('request_id')
      .limit(1)
    expect(error?.code).toBe('42501')

    const rpc = 'public.provision_free_pilot_institution(uuid,text,uuid,text,smallint,smallint,smallint,uuid)'
    const fn = await contract.db.query<{ authenticated: boolean; service_role: boolean }>(
      `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
              has_function_privilege('service_role', $1, 'EXECUTE') AS service_role`,
      [rpc],
    )
    expect(fn.rows[0]).toEqual({ authenticated: true, service_role: false })
  })

  it('provisions through the RPC and mails the document only after the commit', async () => {
    const requestId = randomUUID()
    const response = await route.POST(post(body(ids.manager, requestId)))

    expect(response.status).toBe(201)
    const json = await response.json()
    expect(json).toMatchObject({
      institution: {
        name: 'Bilge Eğitim Merkezi',
        status: 'pilot',
        pilotKind: 'invitation_free',
        studentLimit: 30,
        staffLimit: 2,
        approvalReference: `PILOT-${requestId.toUpperCase()}`,
      },
      membership: { role: 'manager' },
      replayed: false,
      documentDelivery: { sent: true, version: '1.0' },
    })
    expect(await count(
      "SELECT count(*) FROM public.pilot_institution_memberships WHERE user_id = $1 AND role = 'manager' AND status = 'active'",
      [ids.manager],
    )).toBe(1)
    expect(await count(
      "SELECT count(*) FROM public.pilot_institution_requests WHERE operation = 'provision_free_pilot' AND request_id = $1",
      [requestId],
    )).toBe(1)
    expect(state.mails).toEqual([{
      to: 'manager@example.com',
      idempotencyKey: `institution-pilot-package-${requestId}`,
      committedFreePilots: 1,
    }])
    const audit = await contract.db.query<{ target_id: string; details: Record<string, unknown> }>(
      "SELECT target_id, details FROM public.admin_logs WHERE action = 'provision_free_institution_pilot'",
    )
    expect(audit.rows).toEqual([expect.objectContaining({
      target_id: json.institution.id,
      details: expect.objectContaining({ documentEmailId: 'email-1', documentDelivered: true }),
    })])
  })

  it('replays the same request id from the RPC ledger and redelivers under the same key', async () => {
    const requestId = randomUUID()
    const first = await (await route.POST(post(body(ids.manager, requestId)))).json()

    const replay = await route.POST(post(body(ids.manager, requestId)))
    expect(replay.status).toBe(200)
    const json = await replay.json()
    expect(json.replayed).toBe(true)
    expect(json.institution).toEqual(first.institution)
    expect(await count('SELECT count(*) FROM public.pilot_institutions')).toBe(1)
    expect(state.mails.map((mail) => mail.idempotencyKey)).toEqual([
      `institution-pilot-package-${requestId}`,
      `institution-pilot-package-${requestId}`,
    ])
    expect(await count('SELECT count(*) FROM public.admin_logs')).toBe(1)
  })

  it('keeps a committed pilot when delivery fails and recovers on an unchanged resubmission', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const requestId = randomUUID()
    state.mailResult = { ok: false, error: 'provider down' }

    const failed = await route.POST(post(body(ids.manager, requestId)))
    expect(failed.status).toBe(503)
    const failedJson = await failed.json()
    expect(failedJson.documentDelivery).toEqual({ sent: false, version: '1.0' })
    expect(await count('SELECT count(*) FROM public.pilot_institutions')).toBe(1)
    expect(state.mails[0].committedFreePilots).toBe(1)

    state.mailResult = { ok: true, id: 'email-2' }
    const retried = await route.POST(post(body(ids.manager, requestId)))
    expect(retried.status).toBe(200)
    const retriedJson = await retried.json()
    expect(retriedJson).toMatchObject({ replayed: true, documentDelivery: { sent: true, version: '1.0' } })
    expect(retriedJson.institution.id).toBe(failedJson.institution.id)
    expect(await count('SELECT count(*) FROM public.pilot_institutions')).toBe(1)
    consoleError.mockRestore()
  })

  it('leaves the single open slot and the closed gate to the RPC and mails nothing for them', async () => {
    const firstRequest = randomUUID()
    expect((await route.POST(post(body(ids.manager, firstRequest)))).status).toBe(201)

    const secondSlot = await route.POST(post(body(ids.secondManager, randomUUID())))
    expect(secondSlot.status).toBe(409)

    await contract.db.query(setFreeProvisioning(false))
    const gateClosed = await route.POST(post(body(ids.secondManager, randomUUID())))
    expect(gateClosed.status).toBe(503)
    expect(await gateClosed.json()).toEqual({ error: 'Ücretsiz kurum pilotu oluşturulamadı' })

    // 168: kapı kapandıktan sonra da commit edilmiş istek tekrar oynatılabilir.
    const replay = await route.POST(post(body(ids.manager, firstRequest)))
    expect(replay.status).toBe(200)

    expect(await count('SELECT count(*) FROM public.pilot_institutions')).toBe(1)
    expect(state.mails.map((mail) => mail.to)).toEqual(['manager@example.com', 'manager@example.com'])
  })

  it('rejects an unconfirmed manager before the RPC and the document', async () => {
    const response = await route.POST(post(body(ids.unconfirmedManager, randomUUID())))
    expect(response.status).toBe(422)
    expect(await count('SELECT count(*) FROM public.pilot_institution_requests')).toBe(0)
    expect(state.mails).toEqual([])
  })
})
