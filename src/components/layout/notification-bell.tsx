'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import {
  isCurrentBrowserPathSensitive,
  isSensitiveWorkspacePath,
} from '@/lib/privacy/telemetry-policy'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

/**
 * Navbar bildirim zili — okunmamış rozeti + açılır panel.
 * Mount'ta + panel açılışında /api/notifications çeker. Bildirime tıklayınca
 * okundu işaretler ve link'e gider; "tümünü okundu" toplu işaretler.
 */
function localNotificationPath(link: string): string | null {
  try {
    const target = new URL(link, window.location.href)
    if (target.origin !== window.location.origin) return null
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}

export function NotificationBell({
  navigateDocument = (path) => window.location.assign(path),
}: {
  navigateDocument?: (path: string) => void
} = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications ?? [])
      setUnread(data.unread ?? 0)
    } catch {
      /* sessiz — bildirim opsiyonel */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Dışarı tıkla → kapat
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) load()
  }

  const markAll = async () => {
    if (unread === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnread(0)
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {}
  }

  const onItemClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
      try {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        })
      } catch {}
    }
    setOpen(false)
    if (n.link) {
      const localPath = localNotificationPath(n.link)
      if (!localPath) return
      if (isSensitiveWorkspacePath(localPath) !== isCurrentBrowserPathSensitive()) {
        navigateDocument(localPath)
      } else {
        router.push(localPath)
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label={`Bildirimler${unread > 0 ? ` (${unread} okunmamış)` : ''}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--urgency)] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[300px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-bold text-[var(--text)]">Bildirimler</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-[10px] text-[var(--focus)] hover:underline">
                Tümünü okundu işaretle
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--text-sub)]">
                Henüz bildirimin yok 🔔
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--card)] ${
                    n.is_read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex w-full items-center gap-1.5">
                    {!n.is_read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--focus)]" />
                    )}
                    <span className="text-xs font-bold text-[var(--text)]">{n.title}</span>
                  </div>
                  {n.body && <span className="text-[11px] leading-snug text-[var(--text-sub)]">{n.body}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
