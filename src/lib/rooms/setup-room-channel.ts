/**
 * Bilge Arena Oda Sistemi: Channel Setup (Side-Effect Layer)
 * Sprint 1 PR4b Task 3
 *
 * Supabase Realtime channel'i kurar, postgres_changes + presence + system
 * listener'larini register eder, subscribe ile baglanir. dispatch callback
 * ile pure roomStateReducer'a event yonlendirir.
 *
 * Channel filters:
 *   - rooms UPDATE (filter: id=eq.{roomId})
 *   - room_members INSERT/UPDATE/DELETE (filter: room_id=eq.{roomId})
 *   - presence sync/join/leave
 *   - system error
 *
 * Cleanup: caller channel.unsubscribe() yapmalidir (useRoomChannel hook).
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { Member, Room, RoomEvent } from './room-state-reducer'

export function setupRoomChannel(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  dispatch: (event: RoomEvent) => void,
  /** Codex P1 PR50/51 fix: room_rounds INSERT/UPDATE -> hook refetch /state */
  onRoundChange?: () => void,
): RealtimeChannel {
  const channel = supabase.channel(`room-${roomId}`, {
    config: { presence: { key: userId } },
  })

  // postgres_changes: rooms table (UPDATE only)
  channel.on(
    'postgres_changes' as never,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${roomId}`,
    },
    (payload: { new: Partial<Room> }) =>
      dispatch({ type: 'ROOM_UPDATE', payload: payload.new }),
  )

  // postgres_changes: room_members (INSERT, UPDATE, DELETE)
  channel.on(
    'postgres_changes' as never,
    {
      event: 'INSERT',
      schema: 'public',
      table: 'room_members',
      filter: `room_id=eq.${roomId}`,
    },
    (payload: { new: Member }) =>
      dispatch({ type: 'MEMBER_INSERT', payload: payload.new }),
  )
  channel.on(
    'postgres_changes' as never,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'room_members',
      filter: `room_id=eq.${roomId}`,
    },
    (payload: { new: Member }) =>
      dispatch({ type: 'MEMBER_UPDATE', payload: payload.new }),
  )
  channel.on(
    'postgres_changes' as never,
    {
      event: 'DELETE',
      schema: 'public',
      table: 'room_members',
      filter: `room_id=eq.${roomId}`,
    },
    (payload: { old: { user_id: string } }) =>
      dispatch({ type: 'MEMBER_DELETE', payload: { user_id: payload.old.user_id } }),
  )

  // Codex P1 PR #50: room_rounds INSERT/UPDATE -> current_round stale fix.
  // advance_round insert eder, reveal_round update eder. Hook refetch /state
  // ile fresh question_text + correct_answer + revealed_at vs.
  channel.on(
    'postgres_changes' as never,
    {
      event: 'INSERT',
      schema: 'public',
      table: 'room_rounds',
      filter: `room_id=eq.${roomId}`,
    },
    () => onRoundChange?.(),
  )
  channel.on(
    'postgres_changes' as never,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'room_rounds',
      filter: `room_id=eq.${roomId}`,
    },
    () => onRoundChange?.(),
  )

  // Codex P2 PR #54: room_answers INSERT -> answers_count refresh.
  // submit_answer her player icin INSERT yapar; aktif round boyunca badge
  // canli kalsin (advance/reveal'a kadar beklemesin). reveal_round sonrasi
  // UPDATE de is_correct/points_awarded doldurur, scoreboard PR'da kullanim.
  // RLS active-state'inde kendi cevabin disinda diger kayitlari gormez ama
  // INSERT broadcast room genelinde yayinlanir; PostgREST count=exact yine
  // total room_answers sayar (anti-cheat: cevap deger gorulmuyor, sadece sayim).
  channel.on(
    'postgres_changes' as never,
    {
      event: 'INSERT',
      schema: 'public',
      table: 'room_answers',
      filter: `room_id=eq.${roomId}`,
    },
    () => onRoundChange?.(),
  )
  channel.on(
    'postgres_changes' as never,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'room_answers',
      filter: `room_id=eq.${roomId}`,
    },
    () => onRoundChange?.(),
  )

  // Presence: sync (full snapshot), join, leave
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    const online = Object.keys(state)
    dispatch({ type: 'PRESENCE_SYNC', payload: { online } })
  })
  channel.on('presence', { event: 'join' }, ({ key }: { key: string }) =>
    dispatch({ type: 'PRESENCE_JOIN', payload: { user_id: key } }),
  )
  channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) =>
    dispatch({ type: 'PRESENCE_LEAVE', payload: { user_id: key } }),
  )

  // PR4h: typing broadcast — player aktif soruda secenek tikladiginda emit;
  // diger oyuncular MemberRoster'da "X..." indicator gorur. Auto-stop 3sn
  // sonra (client-side timer; sunucu tarafinda timeout yok). Anti-cheat:
  // payload sadece user_id, secilen cevap GIZLI (broadcast ettigimiz tek sey
  // kullanicinin "dusunuyor" oldugu).
  channel.on(
    'broadcast' as never,
    { event: 'typing_start' } as never,
    (payload: { payload?: { user_id?: string } }) => {
      const uid = payload.payload?.user_id
      if (uid) dispatch({ type: 'TYPING_START', payload: { user_id: uid } })
    },
  )
  channel.on(
    'broadcast' as never,
    { event: 'typing_stop' } as never,
    (payload: { payload?: { user_id?: string } }) => {
      const uid = payload.payload?.user_id
      if (uid) dispatch({ type: 'TYPING_STOP', payload: { user_id: uid } })
    },
  )

  // System error listener (channel error -> isStale flag)
  channel.on(
    'system' as never,
    { event: '*' } as never,
    (payload: { status?: string; message?: string }) => {
      if (payload.status === 'error') {
        dispatch({
          type: 'CHANNEL_ERROR',
          payload: { error: payload.message ?? 'channel error' },
        })
      }
    },
  )

  // Subscribe + presence track on SUBSCRIBED status
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      })
    }
  })

  return channel
}
