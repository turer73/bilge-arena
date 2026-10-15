'use client'

import { useSyncExternalStore } from 'react'
import { isBilgeCharacter, type BilgeCharacter } from './characters'

// Device-local guide preference, deliberately separate from profile/theme keys.
export const BILGE_CHARACTER_KEY = 'bilge-guide-character-v1'
const CHANGE_EVENT = 'bilge-guide-character-changed'
let volatileChoice: BilgeCharacter | null = null

const snapshots = {
  female: { saved: { character: 'female', persisted: true }, local: { character: 'female', persisted: false } },
  male: { saved: { character: 'male', persisted: true }, local: { character: 'male', persisted: false } },
} as const

function getSnapshot() {
  if (volatileChoice) return snapshots[volatileChoice].local
  try {
    const value = window.localStorage.getItem(BILGE_CHARACTER_KEY)
    return snapshots[isBilgeCharacter(value) ? value : 'female'].saved
  } catch {
    return snapshots.female.local
  }
}
const getServerSnapshot = () => snapshots.female.saved

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== BILGE_CHARACTER_KEY && event.key !== null) return
    volatileChoice = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

export function setBilgeCharacter(value: BilgeCharacter) {
  if (!isBilgeCharacter(value) || typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(BILGE_CHARACTER_KEY, value)
    volatileChoice = null
  } catch {
    volatileChoice = value
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
  return true
}

export function useBilgeCharacter() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { ...state, setCharacter: setBilgeCharacter }
}
