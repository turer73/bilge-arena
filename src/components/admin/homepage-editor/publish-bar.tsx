'use client'

import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import { cn } from '@/lib/utils/cn'
import { useCallback } from 'react'

export function PublishBar() {
  const isDirty = useHomepageEditorStore((s) => s.isDirty)
  const isSaving = useHomepageEditorStore((s) => s.isSaving)
  const sections = useHomepageEditorStore((s) => s.sections)
  const elements = useHomepageEditorStore((s) => s.elements)
  const setSaving = useHomepageEditorStore((s) => s.setSaving)
  const setDirty = useHomepageEditorStore((s) => s.setDirty)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Her bölüm konfigürasyonunu kaydet
      const sectionEntries = Object.entries(sections)
      await Promise.all(
        sectionEntries.map(([key, section]) =>
          fetch(`/api/admin/homepage/sections/${key}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: section.config }),
          })
        )
      )

      // Eleman sıralamasını güncelle
      const sectionGroups = new Map<string, string[]>()
      for (const el of elements) {
        const group = sectionGroups.get(el.section_key) || []
        group.push(el.id)
        sectionGroups.set(el.section_key, group)
      }

      await Promise.all(
        Array.from(sectionGroups.entries()).map(([sectionKey, ids]) =>
          fetch(`/api/admin/homepage/elements/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section_key: sectionKey, ordered_ids: ids }),
          })
        )
      )

      setDirty(false)
    } catch (err) {
      console.error('Kaydetme hatası:', err)
    } finally {
      setSaving(false)
    }
  }, [sections, elements, setSaving, setDirty])

  const handlePublish = useCallback(async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/homepage/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      })
    } catch (err) {
      console.error('Yayınlama hatası:', err)
    } finally {
      setSaving(false)
    }
  }, [setSaving])

  const handleUnpublish = useCallback(async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/homepage/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpublish' }),
      })
    } catch (err) {
      console.error('Taslağa alma hatası:', err)
    } finally {
      setSaving(false)
    }
  }, [setSaving])

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[var(--border)] bg-[var(--surface)] rounded-b-2xl">
      <div className="flex items-center gap-3">
        {isDirty && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--reward)] font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--reward)] animate-pulse" />
            Kaydedilmemiş değişiklikler
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-sm font-medium text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
        >
          Önizle ↗
        </a>

        <button
          onClick={handleUnpublish}
          disabled={isSaving}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200',
            'text-[var(--text-sub)] border border-[var(--border)] hover:bg-[var(--bg)]',
            isSaving && 'opacity-50 cursor-not-allowed'
          )}
        >
          Taslağa Al
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className={cn(
            'px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200',
            'bg-[var(--focus)] text-white hover:brightness-110 shadow-[0_4px_14px_var(--focus-bg)]',
            (isSaving || !isDirty) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Kaydediliyor...
            </span>
          ) : (
            'Kaydet'
          )}
        </button>

        <button
          onClick={handlePublish}
          disabled={isSaving}
          className={cn(
            'px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200',
            'bg-[var(--growth)] text-white hover:brightness-110 shadow-[0_4px_14px_rgba(34,197,94,0.2)]',
            isSaving && 'opacity-50 cursor-not-allowed'
          )}
        >
          Yayınla
        </button>
      </div>
    </div>
  )
}
