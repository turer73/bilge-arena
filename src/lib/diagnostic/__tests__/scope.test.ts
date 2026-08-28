import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_DIAGNOSTIC_SCOPE,
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
})
