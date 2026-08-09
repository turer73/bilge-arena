'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPaperPack,
  submitPaperPack,
} from '@/lib/paper-mode/client'
import type {
  PaperPackSubmitInput,
  PaperPackView,
} from '@/lib/paper-mode/server-contract'

export function usePaperPack(packId?: string | null) {
  const [loadedPack, setLoadedPack] = useState<{
    packId: string
    pack: PaperPackView
  } | null>(null)
  const [loading, setLoading] = useState(Boolean(packId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<'load' | 'submit' | null>(null)
  const loadRef = useRef<AbortController | null>(null)
  const submitRef = useRef<AbortController | null>(null)
  const pack = loadedPack && loadedPack.packId === packId ? loadedPack.pack : null

  const refresh = useCallback(async () => {
    loadRef.current?.abort()
    if (!packId) {
      setLoadedPack(null)
      setLoading(false)
      setError(null)
      return false
    }

    const controller = new AbortController()
    loadRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const loaded = await fetchPaperPack(packId, controller.signal)
      if (loadRef.current !== controller || controller.signal.aborted) return false
      setLoadedPack({ packId, pack: loaded })
      return true
    } catch (caught) {
      if (
        loadRef.current === controller
        && (caught as { name?: string } | null)?.name !== 'AbortError'
      ) {
        setLoadedPack(null)
        setError('load')
      }
      return false
    } finally {
      if (loadRef.current === controller) setLoading(false)
    }
  }, [packId])

  const submit = useCallback(async (input: PaperPackSubmitInput) => {
    submitRef.current?.abort()
    if (!packId) return false

    const controller = new AbortController()
    submitRef.current = controller
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitPaperPack(packId, input, controller.signal)
      if (submitRef.current !== controller || controller.signal.aborted) return false
      setLoadedPack({ packId, pack: result.pack })
      return true
    } catch (caught) {
      if (
        submitRef.current === controller
        && (caught as { name?: string } | null)?.name !== 'AbortError'
      ) setError('submit')
      return false
    } finally {
      if (submitRef.current === controller) setSubmitting(false)
    }
  }, [packId])

  useEffect(() => {
    let active = true
    submitRef.current?.abort()
    queueMicrotask(() => {
      if (active) void refresh()
    })
    return () => {
      active = false
      loadRef.current?.abort()
      submitRef.current?.abort()
    }
  }, [refresh])

  return { pack, loading, submitting, error, refresh, submit }
}
