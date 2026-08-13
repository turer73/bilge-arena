'use client'

import { useEffect, useState } from 'react'

export function isBilgeTahtaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED === 'true'
}

/**
 * Global preview flag stays available for isolated QA builds. Production demo
 * access is resolved server-side from an active Institution Lite membership so
 * user ids never become part of the public bundle.
 */
export function useBilgeTahtaEnabled(): boolean {
  const globallyEnabled = isBilgeTahtaEnabled()
  const [cohortEnabled, setCohortEnabled] = useState(false)

  useEffect(() => {
    if (globallyEnabled) return

    const controller = new AbortController()
    void fetch('/api/bilge-tahta/access', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false
        const payload: unknown = await response.json()
        return Boolean(
          payload
          && typeof payload === 'object'
          && 'enabled' in payload
          && payload.enabled === true,
        )
      })
      .then((enabled) => setCohortEnabled(enabled))
      .catch(() => setCohortEnabled(false))

    return () => controller.abort()
  }, [globallyEnabled])

  return globallyEnabled || cohortEnabled
}
