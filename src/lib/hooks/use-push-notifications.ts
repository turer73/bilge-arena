'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
  return output
}

type PushStatus = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'loading'

/**
 * Push notification abonelik yonetimi hook'u.
 * VAPID key yoksa 'unsupported' doner.
 */
export function usePushNotifications() {
  const { user } = useAuthStore()
  const [status, setStatus] = useState<PushStatus>('loading')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC) {
      setStatus('unsupported')
      return
    }

    const check = async () => {
      const permission = Notification.permission
      if (permission === 'denied') {
        setStatus('denied')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'subscribed' : 'prompt')
    }

    check()
  }, [])

  const subscribe = useCallback(async () => {
    if (!user || !VAPID_PUBLIC) return false

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return false
      }

      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      })

      const json = subscription.toJSON()
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      })

      if (res.ok) {
        setStatus('subscribed')
        return true
      }
      return false
    } catch (err) {
      console.error('[Push] Abone olma hatasi:', err)
      return false
    }
  }, [user])

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('prompt')
    } catch (err) {
      console.error('[Push] Abonelik iptal hatasi:', err)
    }
  }, [])

  return { status, subscribe, unsubscribe }
}
