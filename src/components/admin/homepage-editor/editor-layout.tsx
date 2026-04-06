'use client'

import { useEffect, useState, useCallback } from 'react'
import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import { SectionSelector } from './section-selector'
import { SectionEditor } from './section-editor'
import { ElementsList } from './elements-list'
import { ElementForm } from './element-form'
import { PublishBar } from './publish-bar'

export function EditorLayout() {
  const setLoading = useHomepageEditorStore((s) => s.setLoading)
  const isLoading = useHomepageEditorStore((s) => s.isLoading)
  const setSections = useHomepageEditorStore((s) => s.setSections)
  const setElements = useHomepageEditorStore((s) => s.setElements)
  const selectedElementId = useHomepageEditorStore((s) => s.selectedElementId)
  const selectElement = useHomepageEditorStore((s) => s.selectElement)

  const [showAddForm, setShowAddForm] = useState(false)

  // Verileri API'den yükle
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [sectionsRes, elementsRes] = await Promise.all([
          fetch('/api/admin/homepage/sections'),
          fetch('/api/admin/homepage/elements'),
        ])

        if (sectionsRes.ok) {
          const { sections: sectionsArr } = await sectionsRes.json()
          const sectionsMap: Record<string, unknown> = {}
          if (Array.isArray(sectionsArr)) {
            for (const s of sectionsArr) {
              sectionsMap[s.section_key] = s
            }
          }
          setSections(sectionsMap as Record<string, never>)
        }

        if (elementsRes.ok) {
          const { elements: elementsArr } = await elementsRes.json()
          setElements(Array.isArray(elementsArr) ? elementsArr : [])
        }
      } catch (err) {
        console.error('Veri yükleme hatası:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setLoading, setSections, setElements])

  const handleAddClick = useCallback(() => {
    selectElement(null)
    setShowAddForm(true)
  }, [selectElement])

  const handleCloseForm = useCallback(() => {
    selectElement(null)
    setShowAddForm(false)
  }, [selectElement])

  // Düzenleme moduna geçilince form aç
  const isFormOpen = showAddForm || selectedElementId !== null

  if (isLoading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--text-sub)]">
          <svg className="animate-spin h-8 w-8 text-[var(--focus)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Başlık */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] rounded-t-2xl">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Anasayfa Editörü</h1>
        <p className="text-sm text-[var(--text-sub)] mt-1">
          Anasayfa bölümlerini ve öğelerini düzenleyin.
        </p>
      </div>

      {/* Ana icerik */}
      <div className="flex border-x border-[var(--border)] min-h-[500px]">
        {/* Sol: Bolum sekmeleri */}
        <SectionSelector />

        {/* Sag: Editor alani */}
        <div className="flex-1 flex flex-col">
          {/* Bolum editoru */}
          <div className="flex-1 p-5 overflow-y-auto border-b border-[var(--border)]">
            <SectionEditor />
          </div>

          {/* Ogeler listesi */}
          <div className="p-5 bg-[var(--bg)]">
            <ElementsList onAdd={handleAddClick} />
          </div>
        </div>
      </div>

      {/* Alt aksiyon cubugu */}
      <PublishBar />

      {/* Oge formu (modal) */}
      {isFormOpen && <ElementForm onClose={handleCloseForm} />}
    </div>
  )
}
