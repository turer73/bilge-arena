import { describe, expect, it } from 'vitest'
import { describeVerifiedAttemptFailure, VerifiedAttemptIssueError } from '../verified-attempt-failure'

describe('describeVerifiedAttemptFailure', () => {
  it('keeps the stage and code of an issuance error and keeps the public message', () => {
    const error = new VerifiedAttemptIssueError('verified_attempt_issue_failed', 'rpc', 'PGRST202')
    expect(error.message).toBe('verified_attempt_issue_failed')
    expect(describeVerifiedAttemptFailure(error)).toEqual({ stage: 'rpc', code: 'PGRST202' })
  })

  it('recognizes the route-level snapshot re-check', () => {
    expect(describeVerifiedAttemptFailure(new Error('verified_attempt_snapshot_mismatch')))
      .toEqual({ stage: 'route_snapshot', code: null })
  })

  it('reports only the error type for anything else, never its message', () => {
    const summary = describeVerifiedAttemptFailure(new TypeError('user@example.com timed out'))
    expect(summary).toEqual({ stage: 'unexpected', code: 'TypeError' })
    expect(JSON.stringify(summary)).not.toContain('example.com')
    expect(describeVerifiedAttemptFailure('string thrown')).toEqual({ stage: 'unexpected', code: null })
  })
})
