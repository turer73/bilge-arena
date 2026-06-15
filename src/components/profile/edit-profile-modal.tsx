'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { refreshProfile } from '@/lib/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { trUpper } from '@/lib/utils/tr-text'
import { X, Trash2 } from 'lucide-react'
import { AVATAR_GROUPS } from '@/lib/constants/avatars'

interface EditProfileModalProps {
  open: boolean
  onClose: () => void
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { profile } = useAuthStore()
  const [displayName, setDisplayName] = useState(profile?.username || profile?.display_name || '')
  const [city, setCity] = useState(profile?.city || '')
  const [grade, setGrade] = useState(profile?.grade || '')
  const [examType, setExamType] = useState<'yks' | 'lgs' | ''>(profile?.exam_type ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [selectingAvatar, setSelectingAvatar] = useState(false)

  if (!open || !profile) return null

  const currentAvatar = profile.avatar_url

  // NOT: Serbest foto yükleme güvenlik nedeniyle kaldırıldı (cinsel-içerik/CSAM
  // riski, moderasyon yoktu). Avatar = Google fotoğrafı / baş-harf; küratörlü
  // hazır-avatar seti yakında. Kullanıcı yalnız mevcut avatarını kaldırabilir.
  const handleRemoveAvatar = async () => {
    setRemoving(true)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
      if (res.ok) {
        toast.success('Avatar kaldırıldı')
        await refreshProfile()
      } else {
        toast.error('Avatar kaldırılamadı')
      }
    } catch {
      toast.error('Bir hata oluştu')
    }
    setRemoving(false)
  }

  // Küratörlü hazır-avatar seçimi (CC0 set). Sunucu yalnız bilinen preset-id'yi
  // kabul eder; rastgele URL yok (serbest yükleme yerine güvenli yol).
  const selectPreset = async (presetId: string) => {
    setSelectingAvatar(true)
    try {
      const res = await fetch('/api/profile/avatar/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      })
      if (res.ok) {
        toast.success('Avatar seçildi')
        setGalleryOpen(false)
        await refreshProfile()
      } else {
        toast.error('Avatar seçilemedi')
      }
    } catch {
      toast.error('Bir hata oluştu')
    }
    setSelectingAvatar(false)
  }

  const handleSave = async () => {
    if (displayName.trim().length < 2) {
      toast.error('İsim en az 2 karakter olmalı')
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: displayName.trim(),
          city: city.trim() || undefined,
          grade: grade || undefined,
          exam_type: examType || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Profil güncellendi')
        await refreshProfile()
        onClose()
      } else {
        toast.error(data.error || 'Profil güncellenemedi')
      }
    } catch {
      toast.error('Bir hata oluştu')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-bold">Profili Düzenle</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--surface)]">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Avatar — serbest yükleme yok (güvenlik). Hazır-avatar seti yakında. */}
          <div className="flex flex-col items-center gap-2">
            {currentAvatar ? (
              <img
                src={currentAvatar}
                alt="Avatar"
                className="h-20 w-20 rounded-full border-[3px] border-[var(--focus-border)] object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-[var(--border)] bg-[var(--surface)] text-3xl">
                {trUpper((displayName || 'A').charAt(0))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setGalleryOpen((v) => !v)}
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-[11px] font-bold text-[var(--focus)] transition-colors hover:border-[var(--focus)]"
              >
                🎨 Hazır Avatar
              </button>
              {currentAvatar && (
                <button
                  onClick={handleRemoveAvatar}
                  disabled={removing}
                  className="flex items-center gap-1 text-[10px] text-[var(--urgency)] hover:underline disabled:opacity-50"
                >
                  <Trash2 size={10} />
                  Kaldır
                </button>
              )}
            </div>
          </div>

          {/* Hazır avatar galerisi — bölümlü: Bilge Chan maskotu (Renderhane 3D) +
              küratörlü DiceBear CC0 set (serbest yükleme yerine güvenli) */}
          {galleryOpen && (
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
              {AVATAR_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-0.5 text-[10px] font-bold text-[var(--text-sub)]">{group.label}</p>
                  <div className="grid grid-cols-6 gap-2">
                    {group.items.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectPreset(a.id)}
                        disabled={selectingAvatar}
                        title={a.label}
                        aria-label={`${a.label} avatar`}
                        className="rounded-full p-0.5 transition-all hover:ring-2 hover:ring-[var(--focus)] disabled:opacity-50"
                      >
                        <img
                          src={a.path}
                          alt=""
                          className="h-10 w-10 rounded-full bg-[var(--card-bg)] object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* İsim */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SİTE İÇİ AD</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
            />
            <p className="mt-0.5 text-[9px] text-[var(--text-sub)]">{displayName.length}/30</p>
          </div>

          {/* Şehir */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">ŞEHİR</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="İstanbul, Ankara..."
              maxLength={50}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
            />
          </div>

          {/* Sınıf */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SINIF</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Seçin...</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
              <option value="mezun">Mezun</option>
            </select>
          </div>

          {/* Sınav türü — içerik (dersler + sorular) buna göre filtrelenir */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SINAV TÜRÜ</label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value as 'yks' | 'lgs' | '')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Seçin...</option>
              <option value="yks">YKS — Üniversite</option>
              <option value="lgs">LGS — Lise</option>
            </select>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Dersler ve sorular sınavına göre gelir.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-sub)] hover:bg-[var(--surface)]"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || removing}
            className="rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
