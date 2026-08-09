const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || 'lvnmzdowhfzmpkueurih'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const MODE = process.argv[2] || 'audit'

if (!ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is required.')
  process.exit(1)
}

if (MODE !== 'audit') {
  console.error(`Unsupported mode: ${MODE}`)
  process.exit(2)
}

const API_ROOT = 'https://api.supabase.com'

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const raw = await response.text()
  let parsed = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }
  }

  if (!response.ok) {
    const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    throw new Error(`${method} ${path} failed (${response.status}): ${detail.slice(0, 1000)}`)
  }

  return parsed
}

async function query(sql) {
  return request(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: { query: sql, read_only: true },
  })
}

function rowsOf(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.result)) return result.result
  if (Array.isArray(result?.data)) return result.data
  return []
}

async function optionalRequest(path) {
  try {
    return { ok: true, value: await request(path) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const fingerprintSql = `
SELECT migration, present
FROM (VALUES
  ('091', to_regclass('public.verified_attempts') IS NOT NULL),
  ('092', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_verified_game_session')),
  ('093', to_regclass('public.reward_ledger') IS NOT NULL),
  ('094', to_regclass('public.review_cards') IS NOT NULL),
  ('095', to_regclass('public.daily_plan_items') IS NOT NULL),
  ('096', to_regclass('public.curriculum_nodes') IS NOT NULL),
  ('097', to_regclass('public.mastery_outcome_evidence') IS NOT NULL),
  ('098', to_regclass('public.adaptive_diagnostic_sessions') IS NOT NULL),
  ('099', to_regclass('public.verified_coach_sessions') IS NOT NULL),
  ('100', to_regclass('public.verified_exam_attempts') IS NOT NULL),
  ('101', to_regclass('public.weekly_learning_league_preferences') IS NOT NULL),
  ('102', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_my_weekly_learning_spotlights')),
  ('103', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_my_weekly_team_boss')),
  ('104', to_regclass('public.paper_study_packs') IS NOT NULL),
  ('105', to_regclass('public.teacher_classrooms') IS NOT NULL),
  ('106', to_regclass('public.question_content_revisions') IS NOT NULL
          AND to_regclass('public.verified_attempt_question_revisions') IS NOT NULL)
) AS checks(migration, present)
ORDER BY migration;
`

const questionPreflightSql = `
WITH normalized AS (
  SELECT
    jsonb_typeof(content->'options') AS options_type,
    CASE WHEN jsonb_typeof(content->'options')='array'
         THEN jsonb_array_length(content->'options') END AS option_count,
    jsonb_typeof(content->'answer') AS answer_type,
    content->>'answer' AS answer_text,
    CASE WHEN jsonb_typeof(content->'answer')='number'
                   AND (content->>'answer') ~ '^[0-9]+$'
         THEN (content->>'answer')::integer END AS answer_index
  FROM public.questions
), classified AS (
  SELECT *,
    options_type IS DISTINCT FROM 'array'
      OR option_count NOT BETWEEN 2 AND 5
      OR answer_type IS DISTINCT FROM 'number'
      OR answer_index IS NULL
      OR answer_index NOT BETWEEN 0 AND 4
      OR answer_index >= option_count AS invalid
  FROM normalized
)
SELECT
  count(*) AS total_questions,
  count(*) FILTER (WHERE invalid) AS invalid_total,
  count(*) FILTER (WHERE options_type IS DISTINCT FROM 'array') AS options_not_array,
  count(*) FILTER (WHERE options_type='array' AND option_count NOT BETWEEN 2 AND 5) AS option_count_invalid,
  count(*) FILTER (WHERE answer_type IS DISTINCT FROM 'number' OR answer_index IS NULL) AS answer_shape_invalid,
  count(*) FILTER (WHERE answer_index IS NOT NULL AND answer_index >= option_count) AS answer_out_of_bounds
FROM classified;
`

const project = await request(`/v1/projects/${PROJECT_REF}`)
const backups = await optionalRequest(`/v1/projects/${PROJECT_REF}/database/backups`)
const pooler = await optionalRequest(`/v1/projects/${PROJECT_REF}/config/database/pooler`)
const migrationHistory = await optionalRequest(`/v1/projects/${PROJECT_REF}/database/migrations`)

const fingerprintsResult = await query(fingerprintSql)
const fingerprints = rowsOf(fingerprintsResult)
const present = new Map(fingerprints.map((row) => [
  String(row.migration),
  row.present === true || String(row.present).toLowerCase() === 'true',
]))

let activeVerifiedAttempts = null
if (present.get('091')) {
  activeVerifiedAttempts = rowsOf(await query(`
    SELECT count(*) AS active_verified_attempts
    FROM public.verified_attempts
    WHERE completed_at IS NULL AND expires_at > clock_timestamp();
  `))[0] ?? null
}

const questionPreflight = rowsOf(await query(questionPreflightSql))[0] ?? null

const sanitizedPooler = pooler.ok && Array.isArray(pooler.value)
  ? pooler.value.map((entry) => ({
      db_host: entry.db_host,
      db_port: entry.db_port,
      db_user: entry.db_user,
      db_name: entry.db_name,
      pool_mode: entry.pool_mode,
      database_type: entry.database_type,
    }))
  : pooler

const sanitizedBackups = backups.ok && Array.isArray(backups.value)
  ? backups.value.map((entry) => ({
      status: entry.status,
      inserted_at: entry.inserted_at,
      started_at: entry.started_at,
      completed_at: entry.completed_at,
      is_physical_backup: entry.is_physical_backup,
    }))
  : backups

console.log(JSON.stringify({
  mode: MODE,
  project: {
    id: project.id,
    ref: project.ref,
    name: project.name,
    region: project.region,
    status: project.status,
    postgres_version: project.database?.version,
  },
  backups: sanitizedBackups,
  pooler: sanitizedPooler,
  migrationHistory,
  fingerprints,
  rawFingerprintShape: fingerprints.length ? undefined : fingerprintsResult,
  activeVerifiedAttempts,
  questionPreflight,
}, null, 2))
