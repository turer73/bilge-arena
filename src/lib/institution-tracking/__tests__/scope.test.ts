import { describe, expect, it, vi } from 'vitest'
import {
  isExactInstitutionScope,
  isMissingInstitutionScopeRpc,
  parseInstitutionLearningScope,
  parseInstitutionScopeRpcList,
  resolveInstitutionLearningScope,
} from '../scope'

const MATH = {
  game: 'matematik',
  displayExamRef: 'TYT',
  questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1',
  scopePolicyVersion: 'institution-scope-v1',
  diagnosticEnabled: true,
}

describe('institution learning scope contract', () => {
  it('accepts an exact released capability and rejects extra or malformed fields', () => {
    expect(parseInstitutionLearningScope(MATH)).toEqual(MATH)
    expect(parseInstitutionLearningScope({ ...MATH, rawStudentCount: 4 })).toBeNull()
    expect(parseInstitutionLearningScope({ ...MATH, displayExamRef: 'tyt' })).toBeNull()
    expect(parseInstitutionLearningScope({ ...MATH, taxonomyVersion: '../math' })).toBeNull()
  })

  it('rejects duplicate list scopes and keeps scope comparison exact', () => {
    expect(parseInstitutionScopeRpcList([MATH])).toEqual({ scopes: [MATH] })
    expect(parseInstitutionScopeRpcList([MATH, MATH])).toBeNull()
    const parsed = parseInstitutionLearningScope(MATH)!
    expect(isExactInstitutionScope(parsed, 'matematik', 'tyt')).toBe(true)
    expect(isExactInstitutionScope(parsed, 'fen', 'TYT')).toBe(false)
  })

  it('recognizes only missing-function rollout errors', () => {
    expect(isMissingInstitutionScopeRpc({ code: 'PGRST202' })).toBe(true)
    expect(isMissingInstitutionScopeRpc({ code: '42883' })).toBe(true)
    expect(isMissingInstitutionScopeRpc({ code: '42501' })).toBe(false)
  })

  it('resolves an exact capability and uses legacy fallback only for Math', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: MATH, error: null })
    await expect(resolveInstitutionLearningScope(rpc, 'matematik', 'tyt')).resolves.toEqual({
      scope: MATH, error: false, legacy: false,
    })

    const fallback = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValueOnce({
        data: {
          game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
        },
        error: null,
      })
    await expect(resolveInstitutionLearningScope(fallback, 'matematik', 'TYT')).resolves.toEqual({
      scope: MATH, error: false, legacy: true,
    })
    expect(fallback).toHaveBeenCalledTimes(2)

    const noFenFallback = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(resolveInstitutionLearningScope(noFenFallback, 'fen', 'TYT')).resolves.toMatchObject({
      scope: null, error: true, legacy: false,
    })
    expect(noFenFallback).toHaveBeenCalledTimes(1)
  })
})
