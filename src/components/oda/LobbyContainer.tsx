/**
 * Bilge Arena Oda: <LobbyContainer> client orchestrator
 * Sprint 1 PR4b Task 6 (PR4e-1: state-aware routing)
 *
 * Root client component. useRoomChannel hook'u uzerinden Realtime state
 * (postgres_changes + presence) abone olur. Oda state'ine gore farkli
 * goruntu: lobby (lobby_view), active/reveal (GameInProgress), completed/
 * archived (GameCompleted).
 *
 * SSR initial state ile mount, Realtime delta ile guncelle, reconnect
 * sonrasi REST resync (memory id=335). State degisirken (lobby->active)
 * useRoomChannel ROOM_UPDATE event ile re-render tetikler, router yeni
 * goruntu render eder.
 */

'use client'

import { useRoomChannel } from '@/lib/rooms/use-room-channel'
import type { RoomState } from '@/lib/rooms/room-state-reducer'
import type { LobbyPreviewQuestion as PreviewQ } from '@/lib/rooms/server-fetch'
import { LobbyHeader } from './LobbyHeader'
import { RoomInfoPanel } from './RoomInfoPanel'
import { MemberRoster } from './MemberRoster'
import { MemberActions } from './MemberActions'
import { HostActions } from './HostActions'
import { GameCompleted } from './GameCompleted'
import { GameView } from './GameView'
import { SonucView } from './SonucView'
import { HostGameActions } from './HostGameActions'
import { LobbyPreviewQuestion } from './LobbyPreviewQuestion'
import { WaitingForOthers } from './WaitingForOthers'

interface LobbyContainerProps {
  roomId: string
  userId: string
  initialState: RoomState
  /** Sprint 2A Task 2: SSR initial preview soru (lobby state'inde) */
  initialPreviewQuestion?: PreviewQ | null
}

export function LobbyContainer({
  roomId,
  userId,
  initialState,
  initialPreviewQuestion = null,
}: LobbyContainerProps) {
  const {
    state,
    isOnline,
    broadcastTyping,
    setOptimisticMyAnswer,
    updateOptimisticMember,
  } = useRoomChannel(roomId, userId, initialState)
  const isHost = userId === state.room.host_id
  const roomState = state.room.state
  const isAsync = state.room.mode === 'async'

  // Async PR2 Faz C: submit_answer_async RPC return ile lokal optimistic
  // my_answer + member.score update. Polling HYDRATE async-fresher logic
  // (reducer) lokal state'i polling stale'inden korur.
  const handleAsyncSubmitSuccess = (
    myAnswer: {
      answer_value: string
      is_correct: boolean
      points_awarded: number
      response_ms: number
    },
  ) => {
    setOptimisticMyAnswer(myAnswer)
    const me = state.members.find((m) => m.user_id === userId)
    updateOptimisticMember(userId, {
      score: (me?.score ?? 0) + myAnswer.points_awarded,
    })
  }

  // Async PR2 Faz C: advance_round_for_member RPC return ile lokal state.
  // status='advanced' -> my_answer clear (sonraki GameView), member round++
  // status='finished' -> my_answer clear, finished_at set (WaitingForOthers)
  const handleAsyncAdvanceSuccess = (result: {
    status: 'advanced' | 'finished'
    round_index: number
    started_at?: string
    finished_at?: string
  }) => {
    setOptimisticMyAnswer(null)
    if (result.status === 'finished') {
      updateOptimisticMember(userId, {
        finished_at: result.finished_at,
        current_round_index: result.round_index,
      })
    } else {
      updateOptimisticMember(userId, {
        current_round_index: result.round_index,
        current_round_started_at: result.started_at,
      })
    }
  }

  // State-aware routing
  // PR4e-1: lobby/completed/archived/active+reveal scaffold
  // Faz C: async mod per-user — caller finished_at -> WaitingForOthers,
  //        my_answer NOT NULL -> SonucView, NULL -> GameView. Sync mod
  //        room.state ile yonlenir (mevcut paterni).
  if (roomState === 'completed' || roomState === 'archived') {
    return <GameCompleted state={state} userId={userId} />
  }

  if (isAsync && (roomState === 'active' || roomState === 'reveal')) {
    // Faz C async per-user routing
    const me = state.members.find((m) => m.user_id === userId)
    const meFinished = me?.finished_at != null
    const hasMyAnswer = state.my_answer != null

    if (meFinished) {
      return (
        <div className="space-y-4">
          <WaitingForOthers
            room={state.room}
            members={state.members}
            viewerUserId={userId}
          />
          <HostGameActions
            isHost={isHost}
            roomId={state.room.id}
            roomState={roomState}
            currentRound={state.current_round}
            answersCount={state.answers_count}
            totalActiveMembers={
              state.members.filter((m) => !m.is_kicked).length
            }
            mode="async"
          />
        </div>
      )
    }

    if (hasMyAnswer) {
      // Async per-user reveal — caller cevap verdi, SonucView gosterilir,
      // auto-advance bitince advanceRoundForMemberAction auto-tetikler.
      return (
        <div className="space-y-4">
          <SonucView
            state={state}
            userId={userId}
            onAsyncAdvanceSuccess={handleAsyncAdvanceSuccess}
          />
          <HostGameActions
            isHost={isHost}
            roomId={state.room.id}
            roomState={roomState}
            currentRound={state.current_round}
            answersCount={state.answers_count}
            totalActiveMembers={
              state.members.filter((m) => !m.is_kicked).length
            }
            mode="async"
          />
        </div>
      )
    }

    // Async active — caller suaresi gelmis soru cevaplama
    return (
      <div className="space-y-4">
        <GameView
          state={state}
          userId={userId}
          onTyping={broadcastTyping}
          onAsyncSubmitSuccess={handleAsyncSubmitSuccess}
        />
        <HostGameActions
          isHost={isHost}
          roomId={state.room.id}
          roomState={roomState}
          currentRound={state.current_round}
          answersCount={state.answers_count}
          totalActiveMembers={
            state.members.filter((m) => !m.is_kicked).length
          }
          mode="async"
        />
      </div>
    )
  }

  // Sync mod: mevcut paterni
  if (roomState === 'active') {
    return (
      <div className="space-y-4">
        <GameView state={state} userId={userId} onTyping={broadcastTyping} />
        <HostGameActions
          isHost={isHost}
          roomId={state.room.id}
          roomState={roomState}
          currentRound={state.current_round}
          answersCount={state.answers_count}
          totalActiveMembers={
            state.members.filter((m) => !m.is_kicked).length
          }
        />
      </div>
    )
  }
  if (roomState === 'reveal') {
    return (
      <div className="space-y-4">
        <SonucView state={state} userId={userId} />
        <HostGameActions
          isHost={isHost}
          roomId={state.room.id}
          roomState={roomState}
          currentRound={state.current_round}
          answersCount={state.answers_count}
          totalActiveMembers={
            state.members.filter((m) => !m.is_kicked).length
          }
        />
      </div>
    )
  }

  // Default: lobby view
  return (
    <div className="space-y-4">
      <LobbyHeader room={state.room} isOnline={isOnline} />
      <RoomInfoPanel room={state.room} />
      <MemberRoster
        members={state.members}
        online={state.online}
        hostId={state.room.host_id}
        maxPlayers={state.room.max_players}
        viewerUserId={userId}
        roomId={state.room.id}
        roomState={state.room.state}
        typingUsers={state.typing_users}
      />
      <MemberActions
        roomId={state.room.id}
        roomCode={state.room.code}
        roomState={state.room.state}
      />
      <HostActions
        isHost={isHost}
        roomId={state.room.id}
        roomState={state.room.state}
      />
      {/* Sprint 2A Task 2: Lobby preview soru widget'i — sadece lobby state'i */}
      <LobbyPreviewQuestion
        initialQuestion={initialPreviewQuestion}
        category={state.room.category}
      />
    </div>
  )
}
