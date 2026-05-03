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
import { GameInProgress } from './GameInProgress'
import { GameCompleted } from './GameCompleted'
import { GameView } from './GameView'
import { SonucView } from './SonucView'
import { HostGameActions } from './HostGameActions'
import { LobbyPreviewQuestion } from './LobbyPreviewQuestion'

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
  const { state, isOnline, broadcastTyping } = useRoomChannel(
    roomId,
    userId,
    initialState,
  )
  const isHost = userId === state.room.host_id
  const roomState = state.room.state

  // State-aware routing
  // PR4e-1: lobby/completed/archived/active+reveal scaffold
  // PR4e-2: active state'e GameView (gercek soru + answer form + timer),
  //         reveal state hala GameInProgress (4e-3'te SonucView yapilacak)
  if (roomState === 'completed' || roomState === 'archived') {
    return <GameCompleted state={state} userId={userId} />
  }
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
