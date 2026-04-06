import Image from 'next/image'
import type { HomepageElement } from '@/types/database'

// Size map for images
const SIZE_MAP: Record<string, number> = { xs: 40, sm: 64, md: 96, lg: 128, xl: 192 }

// Size map for text
const TEXT_SIZE_MAP: Record<string, string> = { xs: 'text-sm', sm: 'text-base', md: 'text-lg', lg: 'text-2xl', xl: 'text-4xl' }

export function DynamicElement({ element }: { element: HomepageElement }) {
  const alignClass = element.alignment === 'left' ? 'self-start' : element.alignment === 'right' ? 'self-end' : 'self-center'
  const customStyles = (element.styles || {}) as React.CSSProperties

  if (element.element_type === 'logo' && element.image_url) {
    const size = SIZE_MAP[element.size] || 96
    return (
      <div className={`${alignClass} px-4`} style={customStyles}>
        <Image
          src={element.image_url}
          alt={element.alt_text || 'Logo'}
          width={size}
          height={size}
          className="object-contain"
        />
      </div>
    )
  }

  if (element.element_type === 'slogan' || element.element_type === 'banner') {
    const textClass = TEXT_SIZE_MAP[element.size] || 'text-lg'
    return (
      <div className={`${alignClass} px-4 ${textClass} font-medium text-[var(--text)]`} style={customStyles}>
        {element.content}
      </div>
    )
  }

  return null
}
