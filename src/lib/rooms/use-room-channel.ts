'use client'

/**
 * Bilge Arena Oda Sistemi: useRoomChannel hook (Orchestrator)
 * Sprint 1 PR4b Task 4
 *
 * useReducer + useEffect orchestrator. Mount: setupRoomChannel + reconnect
 * listener. Reconnect sonrasi REST resync (memory id=335 zorunlu).
 * Unmount: channel.unsubscribe + isMounted guard.
 *
 * Race protection: isMounted ref ile dispatch ignore unmounted.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { setupRoomChannel } from './setup-room-channel'
import {
  roomStateReducer,
  type RoomState,
  type Member,
  type MyAnswer,
} from './room-state-reducer'

export function useRoomChannel(
  roomId: string,
  userId: string,
  initialState: RoomState,
) {
  const [state, dispatch] = useReducer(roomStateReducer, initialState)
  const isMounted = useRef(true)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 2026-05-03 fix: Realtime postgres_changes Bilge Arena DB'sini gormuyor
  // (rooms tablolari bilge_arena_dev DB'sinde, Panola Supabase Realtime ana
  // postgres DB'sini izliyor). Channel CHANNEL_ERROR -> isStale=true kalir,
  // postgres_changes hicbir zaman fire etmez. Polling fallback (asagida) ile
  // sistem degraded-mode'da tam islevsel kalir; gercek Realtime sonra ws-dev.
  const refetchRoomState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/state`)
      if (!res.ok) return
      const fresh = await res.json()
      if (isMounted.current) {
        // Async PR1 Faz B1: caller_user_id geciriliyor — async modda lokal
        // optimistic state polling HYDRATE'i geri yutmasin (reducer karar verir).
        dispatch({ type: 'HYDRATE', payload: fresh, caller_user_id: userId })
      }
    } catch {
      // Network error - isStale flag zaten setli kalir
    }
  }, [roomId, userId])

  useEffect(() => {
    isMounted.current = true
    const supabase = createClient()

    const channel = setupRoomChannel(
      supabase,
      roomId,
      userId,
      (event) => {
        if (isMounted.current) dispatch(event)
      },
      refetchRoomState, // Codex P1 PR #50: room_rounds INSERT/UPDATE -> refresh
    )
    channelRef.current = channel

    // Phoenix Socket-pattern: onError TS tipinde expose edilmemis ama runtime'da var.
    // realtime-js RealtimeClient (https://github.com/supabase/realtime-js).
    const socket = channel.socket as unknown as {
      onError?: (callback: (error: Error) => void) => void
    }
    if (socket.onError) {
      socket.onError(() => {
        void refetchRoomState()
      })
    }

    return () => {
      isMounted.current = false
      channelRef.current = null
      channel.unsubscribe()
    }
  }, [roomId, userId, refetchRoomState])

  // Polling: Realtime postgres_changes hibrit DB mismatch sebebiyle hicbir zaman
  // fire etmiyor (Panola Realtime != bilge_arena_dev). Bu sebeple polling primary
  // mekanizma; isStale=true iken hizli recovery (3sn), aksi halde defense-in-depth
  // (5sn). PR #95 ws-dev.bilgearena.com switch sonrasi sadece isStale durumunda
  // calismaya cekilebilir.
  useEffect(() => {
    if (state.room.state === 'completed' || state.room.state === 'archived') {
      return // terminal state, polling gereksiz
    }
    const intervalMs = state.isStale ? 3000 : 5000
    const id = window.setInterval(() => {
      if (isMounted.current) void refetchRoomState()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [state.isStale, state.room.state, refetchRoomState])

  // PR4h: typing broadcast helper. Player secenek tikladiginda call edilir,
  // 3sn sonra otomatik typing_stop emit. Reentrant-safe (re-call timer reset).
  const typingTimerRef = useRef<number | null>(null)
  const broadcastTyping = useCallback(() => {
    const ch = channelRef.current
    if (!ch) return
    void ch.send({
      type: 'broadcast',
      event: 'typing_start',
      payload: { user_id: userId },
    })
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = window.setTimeout(() => {
      void ch.send({
        type: 'broadcast',
        event: 'typing_stop',
        payload: { user_id: userId },
      })
      typingTimerRef.current = null
    }, 3000)
  }, [userId])

  // Async PR2 Faz C: optimistic update helper'lar. submit_answer_async ve
  // advance_round_for_member RPC return ile lokal state'i polling beklemeden
  // guncelle (3-5sn delay UX'i bozmasin). Polling HYDRATE async-fresher logic
  // ile lokal optimistic state korunur (server stale ise).
  const setOptimisticMyAnswer = useCallback((answer: MyAnswer | null) => {
    if (isMounted.current) {
      dispatch({ type: 'OPTIMISTIC_MY_ANSWER_SET', payload: answer })
    }
  }, [])

  const updateOptimisticMember = useCallback(
    (memberUserId: string, updates: Partial<Member>) => {
      if (isMounted.current) {
        dispatch({
          type: 'MEMBER_OPTIMISTIC_UPDATE',
          payload: { user_id: memberUserId, updates },
        })
      }
    },
    [],
  )

  return {
    state,
    isOnline: !state.isStale,
    broadcastTyping,
    setOptimisticMyAnswer,
    updateOptimisticMember,
  }
}
