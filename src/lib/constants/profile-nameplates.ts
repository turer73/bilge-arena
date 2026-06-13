/**
 * Profil İsim Paneli (Nameplate) — katalog.
 *
 * Discord'un en yüksek-görünürlük kozmetiği: ismin arkasındaki renkli/gradient
 * panel. Sıralama, düello ve profilde GÖRÜNÜR — yani başkaları da görür. Bu
 * yüzden seçim localStorage'da DEĞİL, `profiles.selected_nameplate` (DB) tutulur
 * (frames/backgrounds'tan kasıtlı sapma — sosyal görünürlük + bypass-güvenli).
 *
 * Tümü CSS (gradient) — dosya/CDN yok, LİSANS RİSKİ YOK (frames deseni).
 */

export type NameplateRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface NameplateDef {
  id: string
  name: string
  description: string
  rarity: NameplateRarity
  /** Panel arka planı (CSS gradient/renk) — id='none' ise panel çizilmez */
  css: string
  /** Panel üstündeki isim metni rengi (kontrast) */
  textColor: string
  /** globals.css bg-anim-* sınıfı (opsiyonel hareket) */
  animClass?: string
  /** Coin bedeli — undefined = ücretsiz başlangıç */
  coinCost?: number
}

export const NAMEPLATE_CATEGORIES: { id: NameplateRarity | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Tümü', icon: '✨' },
  { id: 'common', label: 'Sıradan', icon: '◽' },
  { id: 'rare', label: 'Nadir', icon: '🔷' },
  { id: 'epic', label: 'Epik', icon: '🟣' },
  { id: 'legendary', label: 'Efsanevi', icon: '🌟' },
]

export const PROFILE_NAMEPLATES: NameplateDef[] = [
  {
    id: 'none',
    name: 'Panelsiz',
    description: 'Standart isim görünümü',
    rarity: 'common',
    css: 'transparent',
    textColor: 'inherit',
  },
  {
    id: 'gece',
    name: 'Gece',
    description: 'Sade lacivert panel',
    rarity: 'common',
    css: 'linear-gradient(90deg, #0F172A 0%, #334155 100%)',
    textColor: '#F8FAFC',
  },
  {
    id: 'mavi-akim',
    name: 'Mavi Akım',
    description: 'Arena mavisi geçiş',
    rarity: 'rare',
    coinCost: 250,
    css: 'linear-gradient(90deg, #1E3A8A 0%, #3B82F6 100%)',
    textColor: '#FFFFFF',
  },
  {
    id: 'zumrut',
    name: 'Zümrüt',
    description: 'Canlı yeşil panel',
    rarity: 'rare',
    coinCost: 250,
    css: 'linear-gradient(90deg, #064E3B 0%, #10B981 100%)',
    textColor: '#FFFFFF',
  },
  {
    id: 'gun-batimi',
    name: 'Gün Batımı',
    description: 'Turuncu-pembe ufuk',
    rarity: 'epic',
    coinCost: 500,
    css: 'linear-gradient(90deg, #7C2D12 0%, #F97316 55%, #F472B6 100%)',
    textColor: '#FFFFFF',
  },
  {
    id: 'neon',
    name: 'Neon Gece',
    description: 'Cyberpunk pembe-camgöbeği',
    rarity: 'epic',
    coinCost: 500,
    css: 'linear-gradient(90deg, #DB2777 0%, #7C3AED 50%, #06B6D4 100%)',
    textColor: '#FFFFFF',
    animClass: 'bg-anim-drift',
  },
  {
    id: 'gold',
    name: 'Altın Şerit',
    description: 'Şampiyon parıltısı',
    rarity: 'epic',
    coinCost: 650,
    css: 'linear-gradient(90deg, #78350F 0%, #FBBF24 50%, #78350F 100%)',
    textColor: '#1C1917',
    animClass: 'bg-anim-pulse',
  },
  {
    id: 'okyanus',
    name: 'Derin Okyanus',
    description: 'Katmanlı mavi-camgöbeği',
    rarity: 'rare',
    coinCost: 300,
    css: 'linear-gradient(90deg, #0C4A6E 0%, #0EA5E9 100%)',
    textColor: '#FFFFFF',
  },
  {
    id: 'efsane',
    name: 'Efsanevi Aura',
    description: 'Dönen spektrum — efsane statüsü',
    rarity: 'legendary',
    coinCost: 1200,
    css: 'conic-gradient(from 0deg, #3B0764, #A855F7, #C4B5FD, #06B6D4, #EC4899, #3B0764)',
    textColor: '#FFFFFF',
    animClass: 'bg-anim-pulse',
  },
  {
    id: 'evren',
    name: 'Evren',
    description: 'Galaktik gökkuşağı — en üst prestij',
    rarity: 'legendary',
    coinCost: 1500,
    css: 'conic-gradient(from 0deg, #0E1A4A, #06B6D4, #8B5CF6, #EC4899, #F59E0B, #10B981, #0E1A4A)',
    textColor: '#FFFFFF',
    animClass: 'bg-anim-drift',
  },
]

export const NAMEPLATE_RARITY_LABEL: Record<NameplateRarity, string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
}

export function getNameplateById(id: string | null | undefined): NameplateDef {
  return PROFILE_NAMEPLATES.find((n) => n.id === id) ?? PROFILE_NAMEPLATES[0]
}
