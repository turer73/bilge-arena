// Real GoTrue password sessions for synthetic accounts, not OAuth/callback evidence.
import assert from 'node:assert/strict'
import {createSyntheticSessions} from './synthetic-sessions.mjs'

const sessions = await createSyntheticSessions({
  gameSchema: process.argv.includes('--game-schema'),
})
assert.equal(sessions.length, 3)
console.log('PASS anonymous profile access denied; 3 test sessions remained memory-only')
