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

import { useEffect, useReducer, useRef } from 'react'
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
    )

    // Reconnect: REST resync (memory id=335 - Realtime missed event'leri replay etmez)
    const reconnectListener = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/state`)
        if (!res.ok) return
        const fresh = await res.json()
        if (isMounted.current) {
          dispatch({ type: 'HYDRATE', payload: fresh })
        }
      } catch {
        // Network error during reconnect - isStale flag zaten setlenmis durumda
      }
    }

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
      channel.unsubscribe()
    }
  }, [roomId, userId])

  return { state, isOnline: !state.isStale }
}
