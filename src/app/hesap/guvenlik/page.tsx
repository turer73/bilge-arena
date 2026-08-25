import type { Metadata } from 'next'
import { MfaSecurityClient } from '@/components/auth/mfa-security-client'
import { safeMfaReturnPath } from '@/lib/auth/aal2'

export const metadata: Metadata = {
  title: 'Hesap Güvenliği',
  robots: { index: false, follow: false },
}

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  return <MfaSecurityClient returnPath={safeMfaReturnPath(params.next)} />
}
