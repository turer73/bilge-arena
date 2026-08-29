import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import {
  isMissingInstitutionScopeRpc,
  parseInstitutionScopeRpcList,
} from '@/lib/institution-tracking/scope'
import { resolveReleasedMasteryScope } from '@/lib/mastery/scope'

export async function GET(request: Request) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum takip sistemi yapılandırılmadı' },
      { status: 503 },
    )
  }

  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response

  const { data, error } = await context.admin.rpc('list_released_institution_scopes')
  if (!error) {
    const parsed = parseInstitutionScopeRpcList(data)
    return parsed
      ? institutionPilotNoStoreJson(parsed)
      : institutionPilotNoStoreJson({ error: 'Kurum kapsamları doğrulanamadı' }, { status: 500 })
  }

  // Deploy-before-migration compatibility: the old production contract had a
  // single proven Math scope. Never broaden this fallback to the game catalog.
  if (isMissingInstitutionScopeRpc(error)) {
    const legacy = await resolveReleasedMasteryScope(
      (args) => context.admin.rpc('resolve_released_curriculum_scope', args),
      'matematik',
      'TYT',
    )
    if (legacy.error) {
      return institutionPilotNoStoreJson(
        { error: 'Kurum kapsamları doğrulanamadı' },
        { status: legacy.code ? institutionPilotRpcStatus(legacy.code) : 500 },
      )
    }
    return institutionPilotNoStoreJson({
      scopes: legacy.scope ? [{
        game: legacy.scope.game,
        displayExamRef: legacy.scope.displayExamRef,
        questionExamRef: legacy.scope.questionExamRef,
        taxonomyVersion: legacy.scope.taxonomyVersion,
        scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: legacy.scope.diagnosticEnabled,
      }] : [],
    })
  }

  return institutionPilotNoStoreJson(
    { error: 'Kurum kapsamları doğrulanamadı' },
    { status: institutionPilotRpcStatus(error.code) },
  )
}
