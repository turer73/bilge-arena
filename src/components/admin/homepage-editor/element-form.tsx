'use client'

import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import type { HomepageElementType, HomepagePlacement, HomepageAlignment, HomepageSize } from '@/types/database'
import { ImageUploader } from './image-uploader'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface ElementFormProps {
  onClose: () => void
}

const TYPE_OPTIONS: { value: HomepageElementType; label: string; icon: string }[] = [
  { value: 'logo', label: 'Logo', icon: '🖼️' },
  { value: 'slogan', label: 'Slogan', icon: '💬' },
  { value: 'banner', label: 'Banner', icon: '📢' },
]

const PLACEMENT_OPTIONS: { value: HomepagePlacement; label: string }[] = [
  { value: 'above', label: 'Üstünde' },
  { value: 'below', label: 'Altında' },
  { value: 'inline', label: 'İçinde' },
]

const ALIGNMENT_OPTIONS: { value: HomepageAlignment; label: string }[] = [
  { value: 'left', label: 'Sol' },
  { value: 'center', label: 'Orta' },
  { value: 'right', label: 'Sağ' },
]

const SIZE_OPTIONS: HomepageSize[] = ['xs', 'sm', 'md', 'lg', 'xl']
const SIZE_LABELS: Record<HomepageSize, string> = { xs: 'XS', sm: 'S', md: 'M', lg: 'L', xl: 'XL' }

export function ElementForm({ onClose }: ElementFormProps) {
  const activeSection = useHomepageEditorStore((s) => s.activeSection)
  const selectedElementId = useHomepageEditorStore((s) => s.selectedElementId)
  const elements = useHomepageEditorStore((s) => s.elements)
  const addElement = useHomepageEditorStore((s) => s.addElement)
  const updateElement = useHomepageEditorStore((s) => s.updateElement)
  const selectElement = useHomepageEditorStore((s) => s.selectElement)

  const existingElement = selectedElementId
    ? elements.find((el) => el.id === selectedElementId)
    : null
  const isEditMode = !!existingElement

  const [elementType, setElementType] = useState<HomepageElementType>(existingElement?.element_type || 'logo')
  const [content, setContent] = useState(existingElement?.content || '')
  const [imageUrl, setImageUrl] = useState(existingElement?.image_url || '')
  const [altText, setAltText] = useState(existingElement?.alt_text || '')
  const [placement, setPlacement] = useState<HomepagePlacement>(existingElement?.placement || 'above')
  const [alignment, setAlignment] = useState<HomepageAlignment>(existingElement?.alignment || 'center')
  const [size, setSize] = useState<HomepageSize>(existingElement?.size || 'md')
  const [stylesJson, setStylesJson] = useState(
    existingElement?.styles ? JSON.stringify(existingElement.styles, null, 2) : ''
  )
  const [isSaving, setIsSaving] = useState(false)

  // Modal kapanınca seçimi temizle
  useEffect(() => {
    return () => selectElement(null)
  }, [selectElement])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      let parsedStyles: Record<string, unknown> = {}
      if (stylesJson.trim()) {
        try {
          parsedStyles = JSON.parse(stylesJson)
        } catch {
          // JSON geçersizse boş bırak
        }
      }

      const body = {
        section_key: activeSection,
        element_type: elementType,
        content: elementType !== 'logo' ? content : null,
        image_url: elementType === 'logo' ? imageUrl : null,
        alt_text: altText,
        placement,
        alignment,
        size,
        styles: parsedStyles,
      }

      if (isEditMode && selectedElementId) {
        const res = await fetch(`/api/admin/homepage/elements/${selectedElementId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          updateElement(selectedElementId, data)
        }
      } else {
        const res = await fetch('/api/admin/homepage/elements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          addElement(data)
        }
      }

      onClose()
    } catch (err) {
      console.error('Kaydetme hatası:', err)
    } finally {
      setIsSaving(false)
    }
  }, [
    activeSection, elementType, content, imageUrl, altText, placement,
    alignment, size, stylesJson, isEditMode, selectedElementId,
    updateElement, addElement, onClose,
  ])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--card)] rounded-t-2xl">
          <h3 className="font-display text-lg font-bold text-[var(--text)]">
            {isEditMode ? 'Öğeyi Düzenle' : 'Yeni Öğe Ekle'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-sub)] hover:bg-[var(--bg)] hover:text-[var(--text)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tip Seçimi */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-2">
              Öğe Türü
            </label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setElementType(opt.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all',
                    elementType === opt.value
                      ? 'bg-[var(--focus-bg)] text-[var(--focus)] border-[var(--focus-border)]'
                      : 'bg-[var(--bg)] text-[var(--text-sub)] border-[var(--border)] hover:border-[var(--focus-border)]'
                  )}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* İçerik */}
          {elementType === 'logo' ? (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-2">
                Logo Görseli
              </label>
              <ImageUploader value={imageUrl} onChange={setImageUrl} />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-1">
                İçerik
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder={elementType === 'slogan' ? 'Slogan metnini girin...' : 'Banner metnini girin...'}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-sub)]/50 focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all resize-y"
              />
            </div>
          )}

          {/* Alt Metin */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-1">
              Alternatif Metin
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Erişilebilirlik için açıklama"
              className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-sub)]/50 focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all"
            />
          </div>

          {/* Yerleşim */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-2">
              Yerleşim
            </label>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as HomepagePlacement)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all"
            >
              {PLACEMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Hizalama */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-2">
              Hizalama
            </label>
            <div className="flex gap-2">
              {ALIGNMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAlignment(opt.value)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                    alignment === opt.value
                      ? 'bg-[var(--focus-bg)] text-[var(--focus)] border-[var(--focus-border)]'
                      : 'bg-[var(--bg)] text-[var(--text-sub)] border-[var(--border)] hover:border-[var(--focus-border)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Boyut */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-2">
              Boyut
            </label>
            <div className="flex gap-1.5">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    'flex-1 px-2 py-2 rounded-xl text-sm font-medium border transition-all',
                    size === s
                      ? 'bg-[var(--focus-bg)] text-[var(--focus)] border-[var(--focus-border)]'
                      : 'bg-[var(--bg)] text-[var(--text-sub)] border-[var(--border)] hover:border-[var(--focus-border)]'
                  )}
                >
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Gelişmiş Stiller */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-1">
              Gelişmiş Stiller (JSON)
            </label>
            <textarea
              value={stylesJson}
              onChange={(e) => setStylesJson(e.target.value)}
              rows={3}
              placeholder='{"color": "#fff", "fontSize": "1.5rem"}'
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-sub)]/50 focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all resize-y"
            />
          </div>
        </div>

        {/* Alt Aksiyonlar */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--card)] rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl text-[var(--text-sub)] border border-[var(--border)] hover:bg-[var(--bg)] transition-all"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'px-5 py-2 text-sm font-semibold rounded-xl transition-all',
              'bg-[var(--focus)] text-white hover:brightness-110 shadow-[0_4px_14px_var(--focus-bg)]',
              isSaving && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isSaving ? 'Kaydediliyor...' : isEditMode ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}
