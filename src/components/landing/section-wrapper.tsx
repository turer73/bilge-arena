import { DynamicElement } from './dynamic-element'
import type { HomepageElement } from '@/types/database'

interface SectionWrapperProps {
  section: string
  elements: HomepageElement[]
  children: React.ReactNode
}

export function SectionWrapper({ section, elements, children }: SectionWrapperProps) {
  const sectionElements = elements.filter(e => e.section_key === section)
  const above = sectionElements.filter(e => e.placement === 'above').sort((a, b) => a.sort_order - b.sort_order)
  const below = sectionElements.filter(e => e.placement === 'below').sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="relative">
      {above.length > 0 && (
        <div className="flex flex-col items-center gap-4 py-4">
          {above.map(el => <DynamicElement key={el.id} element={el} />)}
        </div>
      )}
      {children}
      {below.length > 0 && (
        <div className="flex flex-col items-center gap-4 py-4">
          {below.map(el => <DynamicElement key={el.id} element={el} />)}
        </div>
      )}
    </div>
  )
}
