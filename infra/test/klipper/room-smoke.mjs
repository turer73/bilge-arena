#!/usr/bin/env node
/**
 * Real, synthetic-only PostgREST smoke for the synchronous Oda lifecycle.
 * Run inside the Node 22 app container. It intentionally never logs tokens,
 * response bodies, emails, or session credentials.
 */
import {createSyntheticSessions} from './synthetic-sessions.mjs'

const roomsUrl = process.env.BILGE_ARENA_RPC_URL
const expectedRoomsUrl = 'http://rooms-rest:3000'
const gameSchema = process.argv.includes('--game-schema')
const expectedOptionValues = new Map([
  [1, '2'], [2, '4'], [3, '5'], [4, '7'], [5, '3'],
  [6, '8'], [7, '0'], [8, '4'], [9, '8'], [10, '5'],
])

function fail(message) {
  throw new Error(`room-smoke: ${message}`)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function headers(token, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function request(path, { token, method = 'GET', body, ok = [200, 201, 204] } = {}) {
  const response = await fetch(`${roomsUrl}${path}`, {
    method,
    headers: token ? headers(token, body !== undefined) : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (!ok.includes(response.status)) {
    // Deliberately omit response body: it can contain environment-specific detail.
    fail(`${method} ${path} returned unexpected HTTP ${response.status}`)
  }
  if (response.status === 204) return null
  return response.json()
}

async function mustDeny(path, { token, method = 'POST', body } = {}) {
  const response = await fetch(`${roomsUrl}${path}`, {
    method,
    headers: token ? headers(token, body !== undefined) : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  assert(!response.ok, `${method} ${path} unexpectedly succeeded`)
}

function expectedAnswerFor(questionText, options) {
  const match = /^Sentetik cebir (\d+):/.exec(questionText ?? '')
  assert(match, 'safe question view did not return a recognized synthetic fixture')
  const expectedValue = expectedOptionValues.get(Number(match[1]))
  assert(expectedValue !== undefined, `fixture answer missing for question ${match[1]}`)
  const answerIndex = options.indexOf(expectedValue)
  assert(answerIndex >= 0, `fixture option missing for question ${match[1]}`)
  return String(answerIndex)
}

async function currentRound(token, roomId, index) {
  const params = new URLSearchParams({
    room_id: `eq.${roomId}`,
    round_index: `eq.${index}`,
    select: 'round_id,room_id,round_index,question_id,started_at,ends_at,revealed_at,question_text,options,correct_answer',
    limit: '1',
  })
  const rows = await request(`/room_round_question_view?${params}`, { token })
  assert(Array.isArray(rows) && rows.length === 1, `round ${index} is not visible to the member`)
  const round = rows[0]
  assert(Array.isArray(round.options) && round.options.length >= 2, `round ${index} safe options missing`)
  assert(round.correct_answer === null, `round ${index} leaked correct_answer before reveal`)
  return round
}

async function main() {
  assert(roomsUrl === expectedRoomsUrl, `BILGE_ARENA_RPC_URL must equal ${expectedRoomsUrl}`)
  const sessions = await createSyntheticSessions({gameSchema})
  assert(Array.isArray(sessions) && sessions.length === 3, 'expected exactly three memory-only sessions')
  for (const session of sessions) {
    assert(typeof session?.access_token === 'string' && session.access_token.length > 20, 'invalid synthetic access token')
    assert(typeof session?.user?.id === 'string' && session.user.id.length > 20, 'invalid synthetic user id')
  }
  const [host, player1, player2] = sessions
  assert(new Set(sessions.map((session) => session.user.id)).size === 3, 'synthetic user ids must be distinct')

  // Questions are deliberately not exposed to anonymous callers.
  await mustDeny('/questions?select=id,content&limit=1')

  const created = await request('/rpc/create_room', {
    token: host.access_token,
    method: 'POST',
    body: {
      p_title: 'Synthetic room smoke',
      p_category: 'denklemler',
      p_difficulty: 2,
      p_question_count: 5,
      p_max_players: 3,
      p_per_question_seconds: 60,
      p_mode: 'sync',
      p_auto_advance_seconds: 0,
      p_is_public: false,
    },
  })
  assert(typeof created?.id === 'string' && typeof created?.code === 'string', 'create_room returned invalid shape')
  const roomId = created.id
  const roomCode = created.code

  for (const player of [player1, player2]) {
    await request('/rpc/join_room', {
      token: player.access_token,
      method: 'POST',
      body: { p_code: roomCode },
    })
  }

  await mustDeny('/rpc/start_room', {
    token: player1.access_token,
    body: { p_room_id: roomId },
  })
  await request('/rpc/start_room', { token: host.access_token, method: 'POST', body: { p_room_id: roomId } })
  await request('/rpc/advance_round', { token: host.access_token, method: 'POST', body: { p_room_id: roomId } })

  let awardedPoints = 0
  for (let index = 1; index <= 5; index += 1) {
    const round = await currentRound(host.access_token, roomId, index)
    const expectedAnswer = expectedAnswerFor(round.question_text, round.options)
    for (const player of [host, player1, player2]) {
      await request('/rpc/submit_answer', {
        token: player.access_token,
        method: 'POST',
        body: { p_room_id: roomId, p_answer_value: expectedAnswer },
      })
    }

    await mustDeny('/rpc/reveal_round', {
      token: player2.access_token,
      body: { p_room_id: roomId },
    })
    await request('/rpc/reveal_round', { token: host.access_token, method: 'POST', body: { p_room_id: roomId } })

    const revealedParams = new URLSearchParams({
      room_id: `eq.${roomId}`,
      round_index: `eq.${index}`,
      select: 'round_id,correct_answer,revealed_at',
      limit: '1',
    })
    const revealed = await request(`/room_round_question_view?${revealedParams}`, { token: host.access_token })
    assert(revealed.length === 1 && revealed[0].revealed_at && revealed[0].correct_answer === expectedAnswer,
      `round ${index} reveal projection is invalid`)

    const answers = await request(`/room_answers?round_id=eq.${round.round_id}&select=user_id,answer_value,is_correct,points_awarded`, { token: host.access_token })
    assert(Array.isArray(answers) && answers.length === 3, `round ${index} does not have exactly three answers`)
    for (const answer of answers) {
      assert(answer.answer_value === expectedAnswer && answer.is_correct === true && Number(answer.points_awarded) > 0,
        `round ${index} score verification failed`)
      awardedPoints += Number(answer.points_awarded)
    }
    await request('/rpc/advance_round', { token: host.access_token, method: 'POST', body: { p_room_id: roomId } })
  }

  const finalRoom = await request(`/rooms?id=eq.${roomId}&select=state,ended_at,current_round_index&limit=1`, { token: host.access_token })
  assert(finalRoom.length === 1 && finalRoom[0].state === 'completed' && finalRoom[0].ended_at,
    'room did not reach completed state')
  const members = await request(`/room_members?room_id=eq.${roomId}&select=user_id,score`, { token: host.access_token })
  assert(Array.isArray(members) && members.length === 3 && members.every((member) => Number(member.score) > 0),
    'final member scores are incomplete')
  const allAnswers = await request(`/room_answers?room_id=eq.${roomId}&select=round_id,user_id`, { token: host.access_token })
  assert(Array.isArray(allAnswers) && allAnswers.length === 15, 'expected 15 stored answers')

  console.log(JSON.stringify({
    ok: true,
    lifecycle: 'create/join/start/answer/reveal/advance/completed',
    members: members.length,
    answers: allAnswers.length,
    awardedPoints,
  }))
}

main().catch((error) => {
  // Do not stringify arbitrary errors: network libraries can include URLs/headers.
  console.error(error instanceof Error ? error.message : 'room-smoke failed')
  process.exitCode = 1
})
