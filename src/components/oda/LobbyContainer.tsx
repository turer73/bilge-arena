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
import { LobbyHeader } from './LobbyHeader'
import { RoomInfoPanel } from './RoomInfoPanel'
import { MemberRoster } from './MemberRoster'
import { MemberActions } from './MemberActions'
import { HostActions } from './HostActions'
import { GameInProgress } from './GameInProgress'
import { GameCompleted } from './GameCompleted'

interface LobbyContainerProps {
  roomId: string
  userId: string
  initialState: RoomState
}

export function LobbyContainer({
  roomId,
  userId,
  initialState,
}: LobbyContainerProps) {
  const { state, isOnline } = useRoomChannel(roomId, userId, initialState)
  const isHost = userId === state.room.host_id
  const roomState = state.room.state

  // State-aware routing (PR4e-1 scaffold)
  if (roomState === 'completed' || roomState === 'archived') {
    return <GameCompleted state={state} userId={userId} />
  }
  if (roomState === 'active' || roomState === 'reveal') {
    return <GameInProgress state={state} userId={userId} />
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
    </div>
  )
}
