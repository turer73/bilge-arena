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
    useAuthStore.getState().setProfile(data as Profile)
  }
}

export function useAuth() {
  const { user, profile, loading, setUser, setProfile, setLoading } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    // Mevcut oturumu kontrol et (getUser ile JWT dogrulanir, getSession guvenli degil)
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser ?? null)
      if (authUser) {
        fetchProfile(authUser.id).catch((err) => {
          console.error('[useAuth] fetchProfile hatasi:', err)
        })
      }
      setLoading(false)
    }).catch(() => {
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
    // 1) Profili cek
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!data) return

    // 2) Google hesap bilgilerini senkronize et
    // Her giriste Google'dan gelen ad/avatar farkli olabilir
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const meta = authUser?.user_metadata
    if (meta) {
      const googleName = meta.full_name || meta.name || null
      const googleAvatar = meta.avatar_url || meta.picture || null
      const needsUpdate =
        (googleName && googleName !== data.display_name) ||
        (googleAvatar && googleAvatar !== data.avatar_url)

      if (needsUpdate) {
        const updates: Record<string, string> = {}
        if (googleName && googleName !== data.display_name) updates.display_name = googleName
        if (googleAvatar && googleAvatar !== data.avatar_url) updates.avatar_url = googleAvatar

        const { data: updated } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select('*')
          .single()

        if (updated) {
          setProfile(updated as Profile)
          return
        }
      }
    }

    setProfile(data as Profile)
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
