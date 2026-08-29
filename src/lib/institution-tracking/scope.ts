import { z } from 'zod'
import type { GameSlug } from '@/lib/constants/games'
import { parseReleasedMasteryScope } from '@/lib/mastery/scope'

const institutionScopeSchema = z.object({
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  displayExamRef: z.string().regex(/^[A-Z0-9-]{2,10}$/),
  questionExamRef: z.string().regex(/^[A-Z0-9-]{2,10}$/).nullable(),
  taxonomyVersion: z.string().regex(/^ba-[a-z0-9-]+-v[0-9]+$/),
  scopePolicyVersion: z.string().regex(/^institution-scope-v[0-9]+$/),
  diagnosticEnabled: z.boolean(),
}).strict()

export const institutionScopeIdentitySchema = z.object({
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  examRef: z.string().regex(/^[A-Z0-9-]{2,10}$/),
  questionExamRef: z.string().regex(/^[A-Z0-9-]{2,10}$/).nullable(),
  taxonomyVersion: z.string().regex(/^ba-[a-z0-9-]+-v[0-9]+$/),
  scopePolicyVersion: z.string().regex(/^institution-scope-v[0-9]+$/),
}).strict()

export const institutionScopeListSchema = z.object({
  scopes: z.array(institutionScopeSchema).max(25),
}).strict().superRefine((value, context) => {
  const keys = value.scopes.map((scope) => `${scope.game}:${scope.displayExamRef}`)
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'institution scopes must be unique' })
  }
})

export type InstitutionLearningScope = z.infer<typeof institutionScopeSchema>
export type InstitutionScopeIdentity = z.infer<typeof institutionScopeIdentitySchema>
export type InstitutionScopeList = z.infer<typeof institutionScopeListSchema>

export function parseInstitutionLearningScope(value: unknown): InstitutionLearningScope | null {
  const parsed = institutionScopeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseInstitutionScopeRpcList(value: unknown): InstitutionScopeList | null {
  const parsed = z.array(institutionScopeSchema).max(25).safeParse(value)
  if (!parsed.success) return null
  const result = institutionScopeListSchema.safeParse({ scopes: parsed.data })
  return result.success ? result.data : null
}

export function isMissingInstitutionScopeRpc(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

export function isExactInstitutionScope(
  scope: InstitutionLearningScope,
  game: GameSlug,
  displayExamRef: string,
): boolean {
  return scope.game === game && scope.displayExamRef === displayExamRef.trim().toUpperCase()
}

export function isExactInstitutionScopeIdentity(
  identity: InstitutionScopeIdentity,
  released: InstitutionLearningScope,
): boolean {
  return identity.game === released.game
    && identity.examRef === released.displayExamRef
    && identity.questionExamRef === released.questionExamRef
    && identity.taxonomyVersion === released.taxonomyVersion
    && identity.scopePolicyVersion === released.scopePolicyVersion
}

interface ScopeRpcResult {
  data: unknown
  error: { code?: string } | null
}

type ScopeRpc = (
  name: 'resolve_released_institution_scope' | 'resolve_released_curriculum_scope',
  args: { p_game: string; p_display_exam_ref: string },
) => PromiseLike<ScopeRpcResult>

export type InstitutionScopeResolution =
  | { scope: InstitutionLearningScope | null; error: false; legacy: boolean }
  | { scope: null; error: true; legacy: false; code?: string }

/**
 * Resolve an institution-reporting capability, not merely a broad game. During
 * deploy-before-migration rollout only the previously proven Math scope may use
 * the legacy curriculum resolver.
 */
export async function resolveInstitutionLearningScope(
  rpc: ScopeRpc,
  game: GameSlug,
  displayExamRef: string,
): Promise<InstitutionScopeResolution> {
  const normalizedExamRef = displayExamRef.trim().toUpperCase()
  const current = await rpc('resolve_released_institution_scope', {
    p_game: game,
    p_display_exam_ref: normalizedExamRef,
  })
  if (!current.error) {
    if (current.data === null) return { scope: null, error: false, legacy: false }
    const scope = parseInstitutionLearningScope(current.data)
    return scope && isExactInstitutionScope(scope, game, normalizedExamRef)
      ? { scope, error: false, legacy: false }
      : { scope: null, error: true, legacy: false }
  }
  if (!isMissingInstitutionScopeRpc(current.error) || game !== 'matematik' || normalizedExamRef !== 'TYT') {
    return { scope: null, error: true, legacy: false, code: current.error.code }
  }

  const fallback = await rpc('resolve_released_curriculum_scope', {
    p_game: game,
    p_display_exam_ref: normalizedExamRef,
  })
  if (fallback.error) return { scope: null, error: true, legacy: false, code: fallback.error.code }
  if (fallback.data === null) return { scope: null, error: false, legacy: true }
  const released = parseReleasedMasteryScope(fallback.data)
  if (!released || released.game !== game || released.displayExamRef !== normalizedExamRef) {
    return { scope: null, error: true, legacy: false }
  }
  return {
    scope: {
      game: released.game,
      displayExamRef: released.displayExamRef,
      questionExamRef: released.questionExamRef,
      taxonomyVersion: released.taxonomyVersion,
      scopePolicyVersion: 'institution-scope-v1',
      diagnosticEnabled: released.diagnosticEnabled,
    },
    error: false,
    legacy: true,
  }
}
