import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.client'

export type Aal2Status = {
  currentLevel: string | null
  nextLevel: string | null
  isAal2: boolean
}

export async function getAal2Status(
  supabase: SupabaseClient<Database>,
): Promise<Aal2Status> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) {
    return { currentLevel: null, nextLevel: null, isAal2: false }
  }

  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    isAal2: data.currentLevel === 'aal2',
  }
}

export function permissionRequiresAal2(permission: string): boolean {
  return permission.startsWith('admin.')
    || permission.startsWith('institution.')
    || permission.startsWith('teacher.')
}

export function safeMfaReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/arena'
  try {
    const parsed = new URL(value, 'https://bilgearena.com')
    if (parsed.origin !== 'https://bilgearena.com') return '/arena'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/arena'
  }
}

export function mfaSecurityPath(returnPath: string | null | undefined): string {
  return `/hesap/guvenlik?next=${encodeURIComponent(safeMfaReturnPath(returnPath))}`
}

export function mfaLoginPath(returnPath: string | null | undefined): string {
  return `/giris?next=${encodeURIComponent(mfaSecurityPath(returnPath))}`
}
