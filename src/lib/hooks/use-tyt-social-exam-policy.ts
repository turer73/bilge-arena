'use client'

import { useAuthStore } from '@/stores/auth-store'
import {
  getTytSocialPolicyResponseSchema,
  setTytSocialPolicyResponseSchema,
  type GetTytSocialPolicyResponse,
  type TytSocialPolicyVariant,
} from '@/lib/exam-policy/tyt-social-contract'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const TYT_SOCIAL_POLICY_ENDPOINT = '/api/profile/exam-policy/tyt-social'

export type TytSocialVariant = TytSocialPolicyVariant
export type TytSocialPolicyStatus = 'inactive' | 'loading' | 'setup_required' | 'active' | 'error'

export interface TytSocialExamPolicyState {
  eligible: boolean
  status: TytSocialPolicyStatus
  loading: boolean
  saving: boolean
  error: string | null
  policyVersion: string | null
  selectionEffectiveAt: string | null
  variantCode: TytSocialVariant | null
  /** Saves the selected range. A failed/uncertain save keeps its request id for retry. */
  saveSelection: (variantCode: TytSocialVariant) => Promise<boolean>
  retry: () => void
}

export interface UseTytSocialExamPolicyOptions {
  game?: string | null
  examRef?: string | null
  enabled?: boolean
}

type HookInput = UseTytSocialExamPolicyOptions | string | null | undefined
type UsablePolicyPayload = Extract<GetTytSocialPolicyResponse, { status: 'setup_required' | 'active' }>

function normalizeInput(input: HookInput, examRefArg?: string | null): UseTytSocialExamPolicyOptions {
  if (typeof input === 'string' || input == null) return { game: input, examRef: examRefArg }
  return input
}

function isVariant(value: unknown): value is TytSocialVariant {
  return value === 'questions_16_20' || value === 'questions_21_25'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Authenticated TYT Social candidate-route preference.
 *
 * The server remains the source of truth. Until a valid response arrives, this
 * hook exposes no usable selection (fail-closed), and ineligible contexts never
 * issue a request. A request id is retained after an uncertain PUT so a retry
 * is an idempotent replay of the same user action.
 */
export function useTytSocialExamPolicy(
  input: HookInput = {},
  examRefArg?: string | null,
): TytSocialExamPolicyState {
  const options = normalizeInput(input, examRefArg)
  const { user } = useAuthStore()
  const game = options.game ?? null
  const examRef = options.examRef ?? null
  const eligible = Boolean(
    isTytSocialV2ClientEnabled()
    && user
    && options.enabled !== false
    && game === 'sosyal'
    && examRef === 'TYT',
  )

  const [status, setStatus] = useState<TytSocialPolicyStatus>(eligible ? 'loading' : 'inactive')
  const [policyVersion, setPolicyVersion] = useState<string | null>(null)
  const [selectionEffectiveAt, setSelectionEffectiveAt] = useState<string | null>(null)
  const [variantCode, setVariantCode] = useState<TytSocialVariant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const requestRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0)
  const scopeRef = useRef<string | null>(null)
  const pendingRequestRef = useRef<{ variantCode: TytSocialVariant; requestId: string } | null>(null)

  useEffect(() => {
    sequenceRef.current += 1
    const sequence = sequenceRef.current
    const scopeKey = `${user?.id ?? ''}:${game}:${examRef}`
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey
      pendingRequestRef.current = null
    }
    requestRef.current?.abort()
    requestRef.current = null

    if (!eligible) {
      setStatus('inactive')
      setPolicyVersion(null)
      setSelectionEffectiveAt(null)
      setVariantCode(null)
      setError(null)
      setSaving(false)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setStatus('loading')
    setPolicyVersion(null)
    setSelectionEffectiveAt(null)
    setVariantCode(null)
    setError(null)

    void fetch(TYT_SOCIAL_POLICY_ENDPOINT, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('policy request failed')
        const parsed = getTytSocialPolicyResponseSchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success || parsed.data.status === 'unavailable') throw new Error('policy unavailable')
        return parsed.data as UsablePolicyPayload
      })
      .then((next) => {
        if (controller.signal.aborted || sequenceRef.current !== sequence) return
        setStatus(next.status)
        setPolicyVersion(next.policyVersion)
        setSelectionEffectiveAt(next.status === 'active' ? next.effectiveAt : null)
        setVariantCode(next.status === 'active' ? next.variant : null)
        if (
          next.status === 'active'
          && pendingRequestRef.current?.variantCode === next.variant
        ) pendingRequestRef.current = null
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || sequenceRef.current !== sequence || isAbortError(caught)) return
        setStatus('error')
        setPolicyVersion(null)
        setSelectionEffectiveAt(null)
        setVariantCode(null)
        setError('TYT Sosyal cevaplama düzeni yüklenemedi.')
      })

    return () => {
      controller.abort()
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [eligible, retryNonce, user?.id, game, examRef])

  const saveSelection = useCallback(async (nextVariant: TytSocialVariant): Promise<boolean> => {
    if (!eligible || saving || !isVariant(nextVariant)) return false

    const operationSequence = sequenceRef.current
    const pending = pendingRequestRef.current
    const requestId = pending?.variantCode === nextVariant
      ? pending.requestId
      : crypto.randomUUID()
    pendingRequestRef.current = { variantCode: nextVariant, requestId }
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(TYT_SOCIAL_POLICY_ENDPOINT, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': requestId,
        },
        body: JSON.stringify({ variant: nextVariant, requestId }),
      })
      if (operationSequence !== sequenceRef.current || !eligible) return false
      if (!response.ok) throw new Error('policy save failed')
      const parsed = setTytSocialPolicyResponseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) {
        throw new Error('policy save response invalid')
      }
      setStatus('active')
      setPolicyVersion(parsed.data.policyVersion)
      setSelectionEffectiveAt(parsed.data.effectiveAt)
      setVariantCode(parsed.data.variant)
      pendingRequestRef.current = null
      return true
    } catch (caught: unknown) {
      if (!isAbortError(caught)) {
        // A failed PUT does not invalidate a previously read server choice;
        // retain that usable state so the same request id can be retried.
        if (status !== 'active' && status !== 'setup_required') setStatus('error')
        setError('TYT Sosyal cevaplama düzeni kaydedilemedi.')
      }
      return false
    } finally {
      setSaving(false)
    }
  }, [eligible, saving, status])

  const retry = useCallback(() => setRetryNonce((value) => value + 1), [])

  return useMemo(() => ({
    eligible,
    status,
    loading: status === 'loading',
    saving,
    error,
    policyVersion,
    selectionEffectiveAt,
    variantCode,
    saveSelection,
    retry,
  }), [eligible, status, saving, error, policyVersion, selectionEffectiveAt, variantCode, saveSelection, retry])
}
