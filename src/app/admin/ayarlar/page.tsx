'use client'

import { useCallback, useEffect, useState } from 'react'

interface SettingDef {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number'
  defaultValue: boolean | number
  icon: string
}

const SETTING_DEFS: SettingDef[] = [
  { key: 'maintenance_mode', label: 'Bakim Modu', description: 'Siteyi gecici olarak kapatir', type: 'toggle', defaultValue: false, icon: '🔧' },
  { key: 'registration_enabled', label: 'Kayit Acik', description: 'Yeni kullanici kaydi yapilabilir', type: 'toggle', defaultValue: true, icon: '📝' },
  { key: 'daily_quest_count', label: 'Gunluk Gorev Sayisi', description: 'Her gun kac gorev verilecek', type: 'number', defaultValue: 3, icon: '🎯' },
  { key: 'max_chat_messages_guest', label: 'Misafir Chat Limiti', description: 'Misafirlerin gunluk chat mesaj limiti', type: 'number', defaultValue: 5, icon: '💬' },
  { key: 'max_chat_messages_user', label: 'Kullanici Chat Limiti', description: 'Kayitli kullanicilarin gunluk chat mesaj limiti', type: 'number', defaultValue: 20, icon: '💬' },
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
      if (!res.ok) throw new Error('Ayarlar yuklenemedi')
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
      console.error('Ayar yukleme hatasi:', err)
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
    // Iyimser guncelleme
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
        <h1 className="text-2xl font-bold">Site Ayarlari</h1>
        <p className="text-sm text-[var(--text-sub)]">Genel platform yapilandirmasi</p>
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
                  <span className="text-xl">{setting.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{setting.label}</span>
                      {isSaving && (
                        <span className="text-[10px] text-[var(--text-sub)]">kaydediliyor...</span>
                      )}
                      {justSaved && (
                        <span className="text-[10px] font-bold text-[var(--growth)]">✓</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-sub)]">{setting.description}</div>
                  </div>
                </div>

                {setting.type === 'toggle' ? (
                  <button
                    onClick={() => updateSetting(setting.key, !val)}
                    disabled={isSaving}
                    className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${
                      val ? 'bg-[var(--focus)]' : 'bg-[var(--border)]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        val ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
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

      <div className="mt-4 text-center text-[11px] text-[var(--text-sub)]">
        Degisiklikler otomatik olarak kaydedilir
      </div>
    </div>
  )
}
