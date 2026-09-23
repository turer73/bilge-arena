// Creates real GoTrue sessions for isolated synthetic accounts and keeps all
// credentials in process memory. This module must only run inside the dedicated
// development stack.
import assert from 'node:assert/strict'
import {createServerClient} from '@supabase/ssr'

const TEST_ORIGIN = 'http://localhost:3137'
const AUTH_ORIGIN = 'http://auth:9999'
const AUTH_REST_ORIGIN = 'http://auth-rest:3000'
const ROOMS_REST_ORIGIN = 'http://rooms-rest:3000'
const accountNames = ['host', 'player1', 'player2']

function requiredEnv(name) {
  const value = process.env[name]
  assert.ok(value, name + ' is required in the isolated test container')
  return value
}

async function requestJson(origin, path, options = {}) {
  assert.ok(path.startsWith('/'), 'Synthetic request path must be absolute')
  const response = await fetch(origin + path, {
    ...options,
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    // Do not expose response bodies: they may contain environment-specific data.
    throw new Error(path + ': unexpected HTTP ' + response.status)
  }
  const body = await response.text()
  return body ? JSON.parse(body) : null
}

export async function createSyntheticSessions({gameSchema = false} = {}) {
  assert.equal(process.env.NODE_ENV, 'development')
  assert.equal(process.env.BILGE_ISOLATED_TEST, 'true')
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, TEST_ORIGIN)
  assert.equal(process.env.BILGE_ARENA_RPC_URL, ROOMS_REST_ORIGIN)

  const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const password = requiredEnv('TEST_USER_PASSWORD')
  const serviceHeaders = {
    Authorization: 'Bearer ' + serviceRoleKey,
    'Content-Type': 'application/json',
  }
  const existing = await requestJson(AUTH_ORIGIN, '/admin/users', {headers: serviceHeaders})
  const sessions = []

  for (const [index, name] of accountNames.entries()) {
    const email = 'academy-' + name + '@example.test'
    if (!existing.users.some((user) => user.email === email)) {
      await requestJson(AUTH_ORIGIN, '/admin/users', {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: {full_name: 'Test ' + name},
        }),
      })
    }

    const session = await requestJson(AUTH_ORIGIN, '/token?grant_type=password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password}),
    })
    assert.equal(session.user.email, email)

    const authHeaders = {Authorization: 'Bearer ' + session.access_token}
    if (gameSchema) {
      const direct = await fetch(AUTH_REST_ORIGIN + '/profiles?select=id', {headers: authHeaders})
      assert.equal(direct.status, 403, 'Full app uses route-only profile reads (migration 049)')
    } else {
      const profiles = await requestJson(AUTH_REST_ORIGIN, '/profiles?select=id,role,deleted_at', {
        headers: authHeaders,
      })
      assert.equal(profiles.length, 1, 'RLS must expose only own profile')
      assert.equal(profiles[0].id, session.user.id)
      assert.equal(profiles[0].role, 'user')
    }

    const denied = await fetch(AUTH_REST_ORIGIN + '/profiles?id=eq.' + session.user.id, {
      method: 'PATCH',
      headers: {...authHeaders, 'Content-Type': 'application/json'},
      body: JSON.stringify({total_xp: 999, role: 'admin'}),
    })
    assert.equal(denied.status, 403, 'Privilege/XP write must fail')

    let cookies = []
    const client = createServerClient(TEST_ORIGIN, anonKey, {
      cookies: {
        getAll: () => cookies,
        setAll: (values) => {
          cookies = values
        },
      },
    })
    const {error} = await client.auth.setSession(session)
    assert.equal(error, null)

    if (gameSchema) {
      const cookieHeader = cookies
        .map((cookie) => cookie.name + '=' + encodeURIComponent(cookie.value))
        .join('; ')
      const profile = await requestJson(TEST_ORIGIN, '/api/profile', {
        headers: {Cookie: cookieHeader},
      })
      assert.equal(profile.profile.id, session.user.id)
      assert.equal(profile.profile.role, 'user')
      assert.equal(profile.isAdmin, false)
    }

    sessions.push({...session, cookies})
    console.log(
      'PASS synthetic account ' + (index + 1) + ': real auth, ' +
        (gameSchema ? 'route-only own profile' : 'own-profile RLS') +
        ', privilege denial',
    )
  }

  const anonymous = await fetch(AUTH_REST_ORIGIN + '/profiles?select=id', {
    headers: {Authorization: 'Bearer ' + anonKey},
  })
  assert.equal(anonymous.status, 401)
  return sessions
}
