'use client'

import { useState } from 'react'

interface Setting {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number'
  value: boolean | number
  icon: string
}

const INITIAL_SETTINGS: Setting[] = [
  { key: 'maintenance_mode', label: 'Bakim Modu', description: 'Siteyi gecici olarak kapatir', type: 'toggle', value: false, icon: '🔧' },
  { key: 'registration_enabled', label: 'Kayit Acik', description: 'Yeni kullanici kaydi yapilabilir', type: 'toggle', value: true, icon: '📝' },
  { key: 'daily_quest_count', label: 'Gunluk Gorev Sayisi', description: 'Her gun kac gorev verilecek', type: 'number', value: 3, icon: '🎯' },
  { key: 'max_chat_messages_guest', label: 'Misafir Chat Limiti', description: 'Misafirlerin gunluk chat mesaj limiti', type: 'number', value: 5, icon: '💬' },
  { key: 'max_chat_messages_user', label: 'Kullanici Chat Limiti', description: 'Kayitli kullanicilarin gunluk chat mesaj limiti', type: 'number', value: 20, icon: '💬' },
]

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [saved, setSaved] = useState(false)

  const updateSetting = (key: string, value: boolean | number) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value } : s))
    )
    setSaved(false)
  }

  const handleSave = () => {
    // Mock kaydet — Supabase baglaninca gercek olacak
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Site Ayarlari</h1>
        <p className="text-sm text-[var(--text-sub)]">Genel platform yapilandirmasi</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {settings.map((setting, i) => (
          <div
            key={setting.key}
            className={`flex items-center justify-between px-5 py-4 ${
              i < settings.length - 1 ? 'border-b border-[var(--border)]' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{setting.icon}</span>
              <div>
                <div className="text-sm font-bold">{setting.label}</div>
                <div className="text-[11px] text-[var(--text-sub)]">{setting.description}</div>
              </div>
            </div>

            {setting.type === 'toggle' ? (
              <button
                onClick={() => updateSetting(setting.key, !setting.value)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  setting.value ? 'bg-[var(--focus)]' : 'bg-[var(--border)]'
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    setting.value ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            ) : (
              <input
                type="number"
                value={setting.value as number}
                onChange={(e) => updateSetting(setting.key, parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center text-sm font-bold focus:border-[var(--focus)] focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>

      {/* Kaydet butonu */}
      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && (
          <span className="text-xs font-bold text-[var(--growth)]">✓ Kaydedildi</span>
        )}
        <button
          onClick={handleSave}
          className="rounded-lg bg-[var(--focus)] px-6 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
        >
          Kaydet
        </button>
      </div>
    </div>
  )
}
