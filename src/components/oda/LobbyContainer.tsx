/**
 * Bilge Arena Oda: <LobbyContainer> client orchestrator
 * Sprint 1 PR4b Task 6
 *
 * Root client component. useRoomChannel hook'u uzerinden Realtime state
 * (postgres_changes + presence) abone olur, alt bilesenleri prop drill ile
 * besler.
 *
 * SSR initial state ile mount, Realtime delta ile guncelle, reconnect
 * sonrasi REST resync (memory id=335).
 */

'use client'

import { useRoomChannel } from '@/lib/rooms/use-room-channel'
import type { RoomState } from '@/lib/rooms/room-state-reducer'
import { LobbyHeader } from './LobbyHeader'
import { RoomInfoPanel } from './RoomInfoPanel'
import { MemberRoster } from './MemberRoster'
import { MemberActions } from './MemberActions'
import { HostActions } from './HostActions'

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
