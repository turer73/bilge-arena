'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Target, UserPlus, Wrench, type LucideIcon } from 'lucide-react'

interface SettingDef {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number'
  defaultValue: boolean | number
  Icon: LucideIcon
}

const SETTING_DEFS: SettingDef[] = [
  { key: 'maintenance_mode', label: 'Bakım modu', description: 'Siteyi geçici olarak kapatır', type: 'toggle', defaultValue: false, Icon: Wrench },
  { key: 'registration_enabled', label: 'Kayıt açık', description: 'Yeni kullanıcı kaydı yapılabilir', type: 'toggle', defaultValue: true, Icon: UserPlus },
  { key: 'daily_quest_count', label: 'Günlük görev sayısı', description: 'Her gün kaç görev verilecek', type: 'number', defaultValue: 3, Icon: Target },
  { key: 'max_chat_messages_guest', label: 'Misafir sohbet limiti', description: 'Misafirlerin günlük sohbet mesaj limiti', type: 'number', defaultValue: 5, Icon: MessageSquare },
  { key: 'max_chat_messages_user', label: 'Kullanıcı sohbet limiti', description: 'Kayıtlı kullanıcıların günlük sohbet mesaj limiti', type: 'number', defaultValue: 20, Icon: MessageSquare },
]

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, boolean | number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) throw new Error('Ayarlar yüklenemedi')
      const data = await res.json()
      const serverValues: Record<string, boolean | number> = {}
      // Sunucudan gelen degerleri parse et, yoksa default kullan
      for (const def of SETTING_DEFS) {
        const raw = data.settings?.[def.key]
        if (raw !== undefined && raw !== null) {
          try {
            serverValues[def.key] = JSON.parse(raw)
          } catch {
            serverValues[def.key] = def.defaultValue
          }
        } else {
          serverValues[def.key] = def.defaultValue
        }
      }
      setValues(serverValues)
    } catch (err) {
      console.error('Ayar yükleme hatası:', err)
      // Hata durumunda default degerleri kullan
      const defaults: Record<string, boolean | number> = {}
      for (const def of SETTING_DEFS) {
        defaults[def.key] = def.defaultValue
      }
      setValues(defaults)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateSetting = async (key: string, value: boolean | number) => {
    // İyimser güncelleme
    const prev = values[key]
    setValues((v) => ({ ...v, [key]: value }))
    setSaving(key)

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (!res.ok) {
        // Hata durumunda geri al
        setValues((v) => ({ ...v, [key]: prev }))
        return
      }
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 1500)
    } catch {
      setValues((v) => ({ ...v, [key]: prev }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Site Ayarları</h1>
        <p className="text-sm text-[var(--text-sub)]">Genel platform yapılandırması</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--border)]" />
            ))}
          </div>
        ) : (
          SETTING_DEFS.map((setting, i) => {
            const val = values[setting.key] ?? setting.defaultValue
            const isSaving = saving === setting.key
            const justSaved = savedKey === setting.key

            return (
              <div
                key={setting.key}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < SETTING_DEFS.length - 1 ? 'border-b border-[var(--border)]' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <setting.Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--focus)]" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{setting.label}</span>
                      {isSaving && (
                        <span className="text-xs text-[var(--text-sub)]">kaydediliyor…</span>
                      )}
                      {justSaved && (
                        <span className="text-xs font-bold text-[var(--growth)]">✓</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-sub)]">{setting.description}</div>
                  </div>
                </div>

                {setting.type === 'toggle' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(val)}
                    aria-label={setting.label}
                    onClick={() => updateSetting(setting.key, !val)}
                    disabled={isSaving}
                    className="flex min-h-11 min-w-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-60"
                  >
                    <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition-colors ${val ? 'bg-[var(--focus)]' : 'bg-[var(--border)]'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                ) : (
                  <input
                    type="number"
                    value={val as number}
                    onChange={(e) => {
                      const num = parseInt(e.target.value) || 0
                      setValues((v) => ({ ...v, [setting.key]: num }))
                    }}
                    onBlur={(e) => {
                      const num = parseInt(e.target.value) || 0
                      if (num !== values[setting.key]) {
                        updateSetting(setting.key, num)
                      }
                    }}
                    min={0}
                    max={100}
                    disabled={isSaving}
                    className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center text-sm font-bold focus:border-[var(--focus)] focus:outline-none disabled:opacity-60"
                  />
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 text-center text-xs text-[var(--text-sub)]">
        Değişiklikler otomatik olarak kaydedilir
      </div>
    </div>
  )
}
