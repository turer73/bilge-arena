'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { BilgeGallery } from './bilge-gallery'
import styles from './academy.module.css'

export function BilgePersonalization() {
  const { character } = useBilgeCharacter()
  const [open, setOpen] = useState(false)
  return <section id="bilge-rehber" className={styles.guideSettings} aria-label="Bilge rehberini kişiselleştir">
    <Image src={bilgeImage(character)} alt={character === 'male' ? 'Erkek Bilge' : 'Kadın Bilge'} width={112} height={112} sizes="112px" />
    <div><h2>Bilge rehberin</h2><p>Kadın veya erkek Bilge’yi seç, 12 ifadesini keşfet. Profil fotoğrafın ayrı kalır.</p>
      <button type="button" className={styles.textLink} onClick={() => setOpen(true)}>Karakter ve ifadeler <ChevronRight size={18} /></button>
    </div>
    {open && <BilgeGallery onClose={() => setOpen(false)} />}
  </section>
}
