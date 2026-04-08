'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
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
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .limit(1)

    const profileWithRole = {
      ...data,
      role: (userRoles && userRoles.length > 0) ? 'admin' : (data.role || 'user'),
    }
    useAuthStore.getState().setProfile(profileWithRole as Profile)
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
        Sentry.setUser({ id: authUser.id, email: authUser.email })
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
        Sentry.setUser({ id: session.user.id, email: session.user.email })
        fetchProfile(session.user.id)
      } else {
        Sentry.setUser(null)
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
    // display_name ve avatar_url her zaman Google'dan guncellenir
    // Kullanicinin site ici adi: username (ayri alan)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const meta = authUser?.user_metadata
    if (meta) {
      const googleName = meta.full_name || meta.name || null
      const googleAvatar = meta.avatar_url || meta.picture || null
      // Sadece custom avatar yoksa Google avatari kullan
      const hasCustomAvatar = data.avatar_url?.includes('/avatars/') ?? false
      const needsUpdate =
        (googleName && googleName !== data.display_name) ||
        (!hasCustomAvatar && googleAvatar && googleAvatar !== data.avatar_url)

      if (needsUpdate) {
        const updates: Record<string, string> = {}
        if (googleName && googleName !== data.display_name) updates.display_name = googleName
        if (!hasCustomAvatar && googleAvatar && googleAvatar !== data.avatar_url) updates.avatar_url = googleAvatar

        const { data: updated } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select('*')
          .single()

        if (updated) {
          const { data: ur } = await supabase
            .from('user_roles')
            .select('role_id')
            .eq('user_id', userId)
            .limit(1)
          setProfile({
            ...updated,
            role: (ur && ur.length > 0) ? 'admin' : (updated.role || 'user'),
          } as Profile)
          return
        }
      }
    }

    // RBAC: user_roles tablosunda rolu varsa admin erisimi var
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .limit(1)

    const profileWithRole = {
      ...data,
      role: (userRoles && userRoles.length > 0) ? 'admin' : (data.role || 'user'),
    }

    setProfile(profileWithRole as Profile)
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
