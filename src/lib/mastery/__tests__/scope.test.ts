import { describe, expect, it, vi } from 'vitest'
import {
  isMasteryScopeIntegrityClean,
  parseMasteryScopeIntegrity,
  parseReleasedMasteryScope,
  resolveReleasedMasteryScope,
} from '../scope'

const FEN_SCOPE = {
  game: 'fen',
  displayExamRef: 'TYT',
  questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-fen-v1',
  mappingMode: 'category_proxy',
  diagnosticEnabled: false,
} as const

describe('released mastery scope contract', () => {
  it('strict ve normalize edilmis registry payloadini kabul eder', () => {
    expect(parseReleasedMasteryScope(FEN_SCOPE)).toEqual(FEN_SCOPE)
    expect(parseReleasedMasteryScope({ ...FEN_SCOPE, secret: true })).toBeNull()
    expect(parseReleasedMasteryScope({ ...FEN_SCOPE, taxonomyVersion: '../bad' })).toBeNull()
  })

  it('bütünlük payloadini katı ayrıştırır ve yalnız tam kapsamı temiz sayar', () => {
    const clean = {
      total: 757, mapped: 757, unmapped: 0, scopeMismatch: 0,
      nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0,
    }
    expect(parseMasteryScopeIntegrity(clean)).toEqual(clean)
    expect(isMasteryScopeIntegrityClean(parseMasteryScopeIntegrity(clean))).toBe(true)
    expect(isMasteryScopeIntegrityClean(parseMasteryScopeIntegrity({ ...clean, scopeMismatch: 1 }))).toBe(false)
    expect(isMasteryScopeIntegrityClean(parseMasteryScopeIntegrity({ ...clean, total: 0, mapped: 0 }))).toBe(false)
    expect(parseMasteryScopeIntegrity({ ...clean, extra: 1 })).toBeNull()
    expect(parseMasteryScopeIntegrity({ ...clean, mapped: 756 })).toBeNull()
  })

  it('release edilmemis scope ile RPC/contract hatasini ayirir', async () => {
    const unsupportedRpc = vi.fn(async () => ({ data: null, error: null }))
    await expect(resolveReleasedMasteryScope(unsupportedRpc, 'turkce', 'tyt')).resolves.toEqual({
      scope: null,
      error: false,
    })
    expect(unsupportedRpc).toHaveBeenCalledWith({ p_game: 'turkce', p_display_exam_ref: 'TYT' })

    await expect(resolveReleasedMasteryScope(
      async () => ({ data: null, error: { code: 'PGRST202' } }),
      'fen',
      'TYT',
    )).resolves.toEqual({ scope: null, error: true, code: 'PGRST202' })

    await expect(resolveReleasedMasteryScope(
      async () => ({ data: { ...FEN_SCOPE, game: 'sosyal' }, error: null }),
      'fen',
      'TYT',
    )).resolves.toEqual({ scope: null, error: true })
  })
})
