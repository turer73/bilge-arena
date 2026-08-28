#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PROJECT_REF = 'lvnmzdowhfzmpkueurih'
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const action = process.argv.includes('--apply') ? 'apply' : 'inspect'
const confirmed = process.argv.includes('--confirm-production')

const migrations = [
  {
    version: '20260828010000',
    name: '185_profile_visibility_scope',
    file: new URL('./migrations/185_profile_visibility_scope.sql', import.meta.url),
  },
  {
    version: '20260828010001',
    name: '186_atomic_friend_requests',
    file: new URL('./migrations/186_atomic_friend_requests.sql', import.meta.url),
  },
]

if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required')
if (action === 'apply' && !confirmed) {
  throw new Error('--apply requires --confirm-production')
}

async function databaseQuery(query) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(`Supabase management query failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function migrationBody(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const beginMatches = raw.match(/\bBEGIN;/gi) ?? []
  const commitMatches = raw.match(/\bCOMMIT;/gi) ?? []
  if (beginMatches.length !== 1 || commitMatches.length !== 1) {
    throw new Error(`Migration transaction wrapper is invalid: ${file.pathname}`)
  }
  const body = raw
    .replace(/\bBEGIN;\s*/i, '')
    .replace(/\bCOMMIT;\s*/i, '')
    .trim()
  if (!body) throw new Error(`Migration body is empty: ${file.pathname}`)
  return { raw, body }
}

function historyStatement(migration, raw) {
  const hash = createHash('sha256').update(raw).digest('hex')
  const tag = `$history_${migration.version}$`
  if (raw.includes(tag)) throw new Error(`Migration contains reserved history delimiter: ${tag}`)
  return `
    INSERT INTO supabase_migrations.schema_migrations(
      version,statements,name,created_by,idempotency_key
    ) VALUES(
      ${sqlLiteral(migration.version)},
      ARRAY[${tag}${raw}${tag}]::text[],
      ${sqlLiteral(migration.name)},
      'profile-visibility-friends-production-rollout',
      ${sqlLiteral(hash)}
    )
    ON CONFLICT(version) DO NOTHING;
  `
}

async function state() {
  const rows = await databaseQuery(`
    SELECT json_build_object(
      'recorded', COALESCE((
        SELECT json_object_agg(name,version)
        FROM supabase_migrations.schema_migrations
        WHERE name IN ('185_profile_visibility_scope','186_atomic_friend_requests')
      ), '{}'::json),
      'prerequisites', json_build_object(
        'leaderboardOptIn', EXISTS(
          SELECT 1 FROM pg_attribute
          WHERE attrelid='public.profiles'::regclass
            AND attname='leaderboard_opt_in' AND NOT attisdropped
        ),
        'browserProfileReadClosed', NOT EXISTS(
          SELECT 1 FROM pg_attribute
          WHERE attrelid='public.profiles'::regclass
            AND attnum>0 AND NOT attisdropped
            AND (
              has_column_privilege('anon','public.profiles',attname,'SELECT')
              OR has_column_privilege('authenticated','public.profiles',attname,'SELECT')
            )
        )
      ),
      'objects', json_build_object(
        'profileVisibility', EXISTS(
          SELECT 1 FROM pg_attribute
          WHERE attrelid='public.profiles'::regclass
            AND attname='profile_visibility' AND NOT attisdropped
        ),
        'visibleProfileRpc', to_regprocedure('public.get_public_profile(text,uuid)') IS NOT NULL,
        'friendRequestRpc', to_regprocedure('public.request_friendship(uuid,uuid)') IS NOT NULL
      ),
      'privileges', json_build_object(
        'profileRpcServiceOnly',
          COALESCE(has_function_privilege('service_role',to_regprocedure('public.get_public_profile(text,uuid)'),'EXECUTE'),false)
          AND NOT COALESCE(has_function_privilege('authenticated',to_regprocedure('public.get_public_profile(text,uuid)'),'EXECUTE'),false),
        'friendRpcServiceOnly',
          COALESCE(has_function_privilege('service_role',to_regprocedure('public.request_friendship(uuid,uuid)'),'EXECUTE'),false)
          AND NOT COALESCE(has_function_privilege('authenticated',to_regprocedure('public.request_friendship(uuid,uuid)'),'EXECUTE'),false),
        'browserFriendDmlClosed',
          NOT has_table_privilege('authenticated','public.friendships','INSERT')
          AND NOT has_table_privilege('authenticated','public.friendships','UPDATE')
          AND NOT has_table_privilege('authenticated','public.friendships','DELETE')
      ),
      'reverseDuplicatePairs', (
        SELECT count(*)
        FROM public.friendships first_friendship
        JOIN public.friendships reverse_friendship
          ON reverse_friendship.user_id=first_friendship.friend_id
         AND reverse_friendship.friend_id=first_friendship.user_id
         AND reverse_friendship.id>first_friendship.id
      )
    ) AS state;
  `)
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.state) {
    throw new Error('Unexpected production inspection response')
  }
  return rows[0].state
}

const before = await state()
console.log(JSON.stringify({ action, phase: 'before', ...before }, null, 2))

if (action === 'apply') {
  if (!before.prerequisites?.leaderboardOptIn || !before.prerequisites?.browserProfileReadClosed) {
    throw new Error(`Production prerequisite 177 is not verified: ${JSON.stringify(before.prerequisites)}`)
  }
  if (Number(before.reverseDuplicatePairs ?? 0) !== 0) {
    throw new Error(`Production contains reverse friendship duplicates: ${before.reverseDuplicatePairs}`)
  }

  for (const migration of migrations) {
    if (before.recorded?.[migration.name]) {
      console.log(JSON.stringify({ migration: migration.name, status: 'already_recorded' }))
      continue
    }
    const { raw, body } = migrationBody(migration.file)
    await databaseQuery(`BEGIN;\n${body}\n${historyStatement(migration, raw)}\nCOMMIT;`)
    console.log(JSON.stringify({ migration: migration.name, status: 'applied' }))
  }
}

const after = await state()
console.log(JSON.stringify({ action, phase: 'after', ...after }, null, 2))

if (action === 'apply') {
  const missingHistory = migrations.filter((migration) => !after.recorded?.[migration.name])
  const missingObjects = Object.entries(after.objects ?? {}).filter(([, present]) => !present)
  const invalidPrivileges = Object.entries(after.privileges ?? {}).filter(([, valid]) => !valid)
  if (missingHistory.length || missingObjects.length || invalidPrivileges.length) {
    throw new Error(`Production verification failed: ${JSON.stringify({ missingHistory, missingObjects, invalidPrivileges })}`)
  }
}
