'use client'

import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { refreshProfile } from '@/lib/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { X, Camera, Trash2 } from 'lucide-react'
import type { Profile } from '@/types/database'

interface EditProfileModalProps {
  open: boolean
  onClose: () => void
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { profile } = useAuthStore()
  const [displayName, setDisplayName] = useState(profile?.username || profile?.display_name || '')
  const [city, setCity] = useState(profile?.city || '')
  const [grade, setGrade] = useState(profile?.grade || '')
  const [saving, setSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open || !profile) return null

  const currentAvatar = avatarPreview || profile.avatar_url

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 1024 * 1024) {
      toast.error('Dosya en fazla 1MB olmali')
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile) return
    setUploadingAvatar(true)

    try {
      const formData = new FormData()
      formData.append('file', avatarFile)

      const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok) {
        toast.success('Avatar guncellendi')
        setAvatarFile(null)
        await refreshProfile()
      } else {
        toast.error(data.error || 'Avatar yuklenemedi')
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setUploadingAvatar(false)
  }

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
      if (res.ok) {
        toast.success('Avatar kaldirildi')
        setAvatarPreview(null)
        setAvatarFile(null)
        await refreshProfile()
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setUploadingAvatar(false)
  }

  const handleSave = async () => {
    if (displayName.trim().length < 2) {
      toast.error('Isim en az 2 karakter olmali')
      return
    }

    setSaving(true)

    // Avatar varsa once yukle
    if (avatarFile) await handleAvatarUpload()

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: displayName.trim(),
          city: city.trim() || undefined,
          grade: grade || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Profil guncellendi')
        await refreshProfile()
        onClose()
      } else {
        toast.error(data.error || 'Profil guncellenemedi')
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-bold">Profili Duzenle</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--surface)]">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt="Avatar"
                  className="h-20 w-20 rounded-full border-[3px] border-[var(--focus-border)] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-[var(--border)] bg-[var(--surface)] text-3xl">
                  {(displayName || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--focus)] text-white shadow-md hover:bg-[var(--focus-dark)]"
              >
                <Camera size={13} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            {currentAvatar && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploadingAvatar}
                className="flex items-center gap-1 text-[10px] text-[var(--urgency)] hover:underline disabled:opacity-50"
              >
                <Trash2 size={10} />
                Avatari Kaldir
              </button>
            )}
          </div>

          {/* Isim */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SITE ICI AD</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
            />
            <p className="mt-0.5 text-[9px] text-[var(--text-sub)]">{displayName.length}/30</p>
          </div>

          {/* Sehir */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SEHIR</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Istanbul, Ankara..."
              maxLength={50}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
            />
          </div>

          {/* Sinif */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SINIF</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Secin...</option>
              <option value="9">9. Sinif</option>
              <option value="10">10. Sinif</option>
              <option value="11">11. Sinif</option>
              <option value="12">12. Sinif</option>
              <option value="mezun">Mezun</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-sub)] hover:bg-[var(--surface)]"
          >
            Iptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploadingAvatar}
            className="rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
