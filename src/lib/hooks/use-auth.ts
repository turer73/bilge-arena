'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { Profile } from '@/types/database'

/**
 * Profil verisini Supabase'den yeniden ceker ve auth-store'u gunceller.
 * Hook disinda da cagirilabilir (ornegin session save sonrasi).
 * DB trigger'lari XP/level/streak guncelledikten sonra cagrilmali.
 */
export async function refreshProfile(): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (data) {
    useAuthStore.getState().setProfile(data as unknown as Profile)
  }
}

export function useAuth() {
  const { user, profile, loading, setUser, setProfile, setLoading } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    // Mevcut oturumu kontrol et
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    // Auth degisikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) setProfile(data as unknown as import('@/types/database').Profile)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    useAuthStore.getState().signOut()
  }

  return { user, profile, loading, signInWithGoogle, signOut }
}
