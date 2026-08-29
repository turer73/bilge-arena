import { describe, expect, it, vi } from 'vitest'
import {
  ADAPTIVE_DIAGNOSTIC_SCOPE,
  parseDiagnosticPageScope,
  parseReleasedDiagnosticScope,
  resolveReleasedDiagnosticScope,
  supportsAdaptiveDiagnosticScope,
} from '@/lib/diagnostic/scope'

describe('adaptive diagnostic scope capability', () => {
  it('supports only the immutable Mathematics pilot scope', () => {
    expect(supportsAdaptiveDiagnosticScope(ADAPTIVE_DIAGNOSTIC_SCOPE)).toBe(true)
    expect(supportsAdaptiveDiagnosticScope({
      game: 'matematik', examRef: 'TYT', questionExamRef: 'TYT', taxonomyVersion: 'ba-tyt-math-v2',
    })).toBe(false)
    expect(supportsAdaptiveDiagnosticScope({
      game: 'fen', examRef: 'TYT', questionExamRef: 'TYT', taxonomyVersion: 'ba-tyt-fen-v1',
    })).toBe(false)
    expect(supportsAdaptiveDiagnosticScope({
      game: 'matematik', examRef: 'TYT', questionExamRef: 'LGS', taxonomyVersion: 'ba-tyt-math-v1',
    })).toBe(false)
  })

  it('strictly parses a dynamic released screening scope', () => {
    const scope = {
      game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v2', policyVersion: 'adaptive-diagnostic-v3',
      questionCount: 9, outcomeCount: 6, maxPerOutcome: 2,
    }
    expect(parseReleasedDiagnosticScope(scope)).toEqual(scope)
    expect(parseReleasedDiagnosticScope({ ...scope, extra: true })).toBeNull()
    expect(parseReleasedDiagnosticScope({ ...scope, questionCount: 13 })).toBeNull()
    expect(parseReleasedDiagnosticScope({ ...scope, outcomeCount: 10 })).toBeNull()
  })

  it('resolves only the exact normalized registry scope', async () => {
    const scope = {
      game: 'turkce', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-turkce-v2', policyVersion: 'adaptive-diagnostic-v3',
      questionCount: 10, outcomeCount: 5, maxPerOutcome: 2,
    }
    const rpc = vi.fn(async () => ({ data: scope, error: null }))
    await expect(resolveReleasedDiagnosticScope(rpc, 'turkce', 'tyt')).resolves.toEqual({
      scope, error: false,
    })
    expect(rpc).toHaveBeenCalledWith({ p_game: 'turkce', p_display_exam_ref: 'TYT' })
  })

  it('defaults the page only when both params are absent and rejects partial or lowercase explicit scope', () => {
    expect(parseDiagnosticPageScope(null, null)).toEqual({ game: 'matematik', examRef: 'TYT' })
    expect(parseDiagnosticPageScope('fen', 'TYT')).toEqual({ game: 'fen', examRef: 'TYT' })
    expect(parseDiagnosticPageScope('fen', null)).toBeNull()
    expect(parseDiagnosticPageScope(null, 'TYT')).toBeNull()
    expect(parseDiagnosticPageScope('Fen', 'TYT')).toBeNull()
    expect(parseDiagnosticPageScope('fen', 'tyt')).toBeNull()
  })
})
