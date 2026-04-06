'use client'

import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import type { HomepageElement } from '@/types/database'
import { useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS as dndCSS } from '@dnd-kit/utilities'

const TYPE_ICONS: Record<string, string> = {
  logo: '🖼️',
  slogan: '💬',
  banner: '📢',
}

const PLACEMENT_LABELS: Record<string, string> = {
  above: 'Üstünde',
  below: 'Altında',
  inline: 'İçinde',
}

/* ─── Sortable Row ────────────────────────────────────── */

function SortableRow({
  element,
  onEdit,
  onDelete,
}: {
  element: HomepageElement
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.id,
  })

  const style = {
    transform: dndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const preview =
    element.element_type === 'logo' && element.image_url
      ? element.image_url
      : element.content || '—'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--focus-border)] transition-all group"
    >
      {/* Sürükle tutamacı */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--text-sub)] hover:text-[var(--text)] shrink-0"
        aria-label="Sürükle"
      >
        ☰
      </button>

      {/* Tip ikonu */}
      <span className="text-lg shrink-0">{TYPE_ICONS[element.element_type] || '📄'}</span>

      {/* İçerik önizleme */}
      <div className="flex-1 min-w-0">
        {element.element_type === 'logo' && element.image_url ? (
          <img
            src={element.image_url}
            alt={element.alt_text}
            className="h-8 w-auto rounded object-contain"
          />
        ) : (
          <p className="text-sm text-[var(--text)] truncate">{preview}</p>
        )}
      </div>

      {/* Yerleşim rozeti */}
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--focus-bg)] text-[var(--focus)] border border-[var(--focus-border)] shrink-0">
        {PLACEMENT_LABELS[element.placement] || element.placement}
      </span>

      {/* Aksiyonlar */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--focus-bg)] text-[var(--focus)] hover:bg-[var(--focus)] hover:text-white transition-all"
        >
          Düzenle
        </button>
        <button
          onClick={onDelete}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--urgency)]/10 text-[var(--urgency)] hover:bg-[var(--urgency)] hover:text-white transition-all"
        >
          Sil
        </button>
      </div>
    </div>
  )
}

/* ─── Ana Liste ───────────────────────────────────────── */

export function ElementsList({ onAdd }: { onAdd: () => void }) {
  const activeSection = useHomepageEditorStore((s) => s.activeSection)
  const elements = useHomepageEditorStore((s) => s.elements)
  const selectElement = useHomepageEditorStore((s) => s.selectElement)
  const removeElement = useHomepageEditorStore((s) => s.removeElement)
  const setElements = useHomepageEditorStore((s) => s.setElements)
  const reorderElements = useHomepageEditorStore((s) => s.reorderElements)

  const safeElements = Array.isArray(elements) ? elements : []
  const sectionElements = safeElements
    .filter((el) => el.section_key === activeSection)
    .sort((a, b) => a.sort_order - b.sort_order)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = sectionElements.findIndex((el) => el.id === active.id)
      const newIndex = sectionElements.findIndex((el) => el.id === over.id)
      const reordered = arrayMove(sectionElements, oldIndex, newIndex)

      // Tüm elemanları güncelle
      const otherElements = safeElements.filter((el) => el.section_key !== activeSection)
      const updatedSection = reordered.map((el, i) => ({ ...el, sort_order: i }))
      setElements([...otherElements, ...updatedSection])
      reorderElements(activeSection, reordered.map((el) => el.id))
    },
    [sectionElements, safeElements, activeSection, setElements, reorderElements]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/admin/homepage/elements/${id}`, { method: 'DELETE' })
        removeElement(id)
      } catch (err) {
        console.error('Silme hatası:', err)
      }
    },
    [removeElement]
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-sub)] uppercase tracking-wide">
          Öğeler ({sectionElements.length})
        </h4>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--focus)] text-white hover:brightness-110 transition-all"
        >
          <span>+</span> Ekle
        </button>
      </div>

      {sectionElements.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--text-sub)] opacity-60">
          Bu bölümde henüz öğe yok.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sectionElements.map((el) => el.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {sectionElements.map((el) => (
                <SortableRow
                  key={el.id}
                  element={el}
                  onEdit={() => selectElement(el.id)}
                  onDelete={() => handleDelete(el.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
