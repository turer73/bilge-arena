import { create } from 'zustand'
import type { HomepageSection, HomepageElement, HomepageSectionConfig } from '@/types/database'

interface HomepageEditorState {
  // Durum
  activeSection: HomepageSection
  sections: Record<string, HomepageSectionConfig>
  elements: HomepageElement[]
  selectedElementId: string | null
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean

  // Bölüm işlemleri
  setActiveSection: (section: HomepageSection) => void
  setSections: (sections: Record<string, HomepageSectionConfig>) => void
  updateSectionConfig: (sectionKey: string, config: Record<string, unknown>) => void

  // Öğe işlemleri
  setElements: (elements: HomepageElement[]) => void
  selectElement: (id: string | null) => void
  addElement: (element: HomepageElement) => void
  updateElement: (id: string, updates: Partial<HomepageElement>) => void
  removeElement: (id: string) => void
  reorderElements: (sectionKey: string, orderedIds: string[]) => void

  // Genel
  setDirty: (dirty: boolean) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  reset: () => void
}

const initialState = {
  activeSection: 'hero' as HomepageSection,
  sections: {} as Record<string, HomepageSectionConfig>,
  elements: [] as HomepageElement[],
  selectedElementId: null as string | null,
  isDirty: false,
  isLoading: true,
  isSaving: false,
}

export const useHomepageEditorStore = create<HomepageEditorState>((set) => ({
  ...initialState,

  setActiveSection: (section) => set({ activeSection: section, selectedElementId: null }),

  setSections: (sections) => set({ sections }),

  updateSectionConfig: (sectionKey, config) =>
    set((state) => ({
      sections: {
        ...state.sections,
        [sectionKey]: {
          ...state.sections[sectionKey],
          config,
        },
      },
      isDirty: true,
    })),

  setElements: (elements) => set({ elements }),

  selectElement: (id) => set({ selectedElementId: id }),

  addElement: (element) =>
    set((state) => ({
      elements: [...state.elements, element],
      selectedElementId: element.id,
      isDirty: true,
    })),

  updateElement: (id, updates) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      ),
      isDirty: true,
    })),

  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      isDirty: true,
    })),

  reorderElements: (sectionKey, orderedIds) =>
    set((state) => {
      const updated = state.elements.map((el) => {
        if (el.section_key !== sectionKey) return el
        const newOrder = orderedIds.indexOf(el.id)
        return newOrder >= 0 ? { ...el, sort_order: newOrder } : el
      })
      return { elements: updated, isDirty: true }
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
  reset: () => set(initialState),
}))
