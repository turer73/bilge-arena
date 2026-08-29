'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentPropsWithoutRef } from 'react'
import { isSensitiveWorkspacePath } from '@/lib/privacy/telemetry-policy'

export function requiresDocumentNavigation(currentPathname: string, href: string): boolean {
  // Next Link is only appropriate for same-origin application paths. Native
  // navigation also keeps external/protocol-relative URLs out of router APIs.
  if (!href.startsWith('/') || href.startsWith('//')) return true
  return isSensitiveWorkspacePath(currentPathname) !== isSensitiveWorkspacePath(href)
}

/**
 * Keeps public telemetry code and sensitive workspace RSC payloads in separate
 * browser documents. A native anchor has no App Router viewport/hover prefetch,
 * so the sensitive request cannot start while the public document is alive.
 */
export function DocumentBoundaryLink({
  href,
  ...props
}: ComponentPropsWithoutRef<'a'> & { href: string }) {
  const pathname = usePathname()

  if (requiresDocumentNavigation(pathname, href)) {
    return <a href={href} {...props} />
  }

  return <Link href={href} {...props} />
}
