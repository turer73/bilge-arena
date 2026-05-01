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
import { roomStateReducer, type RoomState } from './room-state-reducer'

export function useRoomChannel(
  roomId: string,
  userId: string,
  initialState: RoomState,
) {
  const [state, dispatch] = useReducer(roomStateReducer, initialState)
  const isMounted = useRef(true)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    isMounted.current = true
    const supabase = createClient()

    // Reconnect + round-change REST resync (memory id=335 + Codex P1 PR50)
    const refetchRoomState = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/state`)
        if (!res.ok) return
        const fresh = await res.json()
        if (isMounted.current) {
          dispatch({ type: 'HYDRATE', payload: fresh })
        }
      } catch {
        // Network error - isStale flag zaten setli kalir
      }
    }

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

    const reconnectListener = refetchRoomState

    // Phoenix Socket-pattern: onError TS tipinde expose edilmemis ama runtime'da var.
    // realtime-js RealtimeClient (https://github.com/supabase/realtime-js).
    const socket = channel.socket as unknown as {
      onError?: (callback: (error: Error) => void) => void
    }
    if (socket.onError) {
      socket.onError(() => {
        void reconnectListener()
      })
    }

    return () => {
      isMounted.current = false
      channelRef.current = null
      channel.unsubscribe()
    }
  }, [roomId, userId])

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

  return { state, isOnline: !state.isStale, broadcastTyping }
}
