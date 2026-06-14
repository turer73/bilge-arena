/**
 * Profil Arka Planı Mağazası — katalog (Faz-1).
 *
 * Bilinçli mimari: tüm arka planlar CSS (gradient + animasyon) — dosya yok,
 * CDN yok, LİSANS RİSKİ YOK. Video/görsel arka planlar Faz-2'de Supabase
 * Storage + lisans doğrulamasıyla gelir (Drive'daki derleme MP4'ler üçüncü
 * şahıs eserleri olabilir; krediyle satmadan önce kaynak/lisans şart).
 * Çözünürlük seçimi (HD/2K/4K) CSS asset'te anlamsız — video fazına ertelendi.
 */

export type BackgroundCategory = 'kozmik' | 'cyberpunk' | 'manzara' | 'lofi' | 'pixel'

export const BACKGROUND_CATEGORIES: { id: BackgroundCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Tümü', icon: '✨' },
  { id: 'kozmik', label: 'Kozmik', icon: '🌌' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🌃' },
  { id: 'manzara', label: 'Manzara', icon: '🏔️' },
  { id: 'lofi', label: 'Lo-Fi', icon: '🎧' },
  { id: 'pixel', label: 'Pixel', icon: '👾' },
]

export type BackgroundRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface ProfileBackgroundDef {
  id: string
  name: string
  description: string
  category: BackgroundCategory
  rarity: BackgroundRarity
  /** CSS background değeri (gradient katmanları) */
  css: string
  /** Hareket efekti: globals.css'teki bg-anim-* sınıfı (opsiyonel) */
  animClass?: string
  /** Coin bedeli — undefined = ücretsiz başlangıç */
  coinCost?: number
}

export const PROFILE_BACKGROUNDS: ProfileBackgroundDef[] = [
  {
    id: 'none',
    name: 'Sade',
    description: 'Standart kart görünümü',
    category: 'kozmik',
    rarity: 'common',
    css: 'var(--card-bg)',
  },
  {
    id: 'gece-mavisi',
    name: 'Gece Mavisi',
    description: 'Arena ruhuna uygun derin mavi geçiş',
    category: 'kozmik',
    rarity: 'common',
    css: 'linear-gradient(135deg, #0B1026 0%, #16224E 55%, #1E3A8A 100%)',
  },
  {
    id: 'nebula',
    name: 'Nebula',
    description: 'Mor-eflatun yıldız tozu bulutu',
    category: 'kozmik',
    rarity: 'rare',
    coinCost: 400,
    css: 'radial-gradient(ellipse at 20% 20%, #7C3AED55 0%, transparent 50%), radial-gradient(ellipse at 80% 60%, #DB277755 0%, transparent 55%), linear-gradient(160deg, #0F0524 0%, #1E1B4B 100%)',
    animClass: 'bg-anim-drift',
  },
  {
    id: 'gunes-patlamasi',
    name: 'Güneş Patlaması',
    description: 'Alevli turuncu-kızıl enerji dalgası',
    category: 'kozmik',
    rarity: 'epic',
    coinCost: 900,
    css: 'radial-gradient(circle at 70% 30%, #F9731680 0%, transparent 45%), linear-gradient(200deg, #450A0A 0%, #7C2D12 50%, #1C0A00 100%)',
    animClass: 'bg-anim-pulse',
  },
  {
    id: 'neon-sokak',
    name: 'Neon Sokak',
    description: 'Yağmurlu gece, cam-mor neon yansımaları',
    category: 'cyberpunk',
    rarity: 'rare',
    coinCost: 500,
    css: 'linear-gradient(115deg, #0A0118 0%, #1A0533 45%, #06B6D433 100%), linear-gradient(295deg, #EC489933 0%, transparent 40%), #0A0118',
    animClass: 'bg-anim-drift',
  },
  {
    id: 'siber-izgara',
    name: 'Siber Izgara',
    description: 'Retro-futurist ufuk çizgisi ızgarası',
    category: 'cyberpunk',
    rarity: 'epic',
    coinCost: 900,
    css: 'repeating-linear-gradient(0deg, transparent 0 23px, #06B6D422 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, #06B6D422 23px 24px), linear-gradient(180deg, #18062E 0%, #0E7490 160%)',
  },
  {
    id: 'sis-vadisi',
    name: 'Sis Vadisi',
    description: 'Şafakta katmanlı dağ silüetleri',
    category: 'manzara',
    rarity: 'rare',
    coinCost: 400,
    css: 'linear-gradient(180deg, #FDBA7433 0%, transparent 35%), linear-gradient(170deg, #134E4A 0%, #0F2E2B 55%, #062423 100%)',
  },
  {
    id: 'fuji-gunbatimi',
    name: 'Fuji Günbatımı',
    description: 'Pembe-turuncu gökyüzü, mor dağ silüeti',
    category: 'manzara',
    rarity: 'epic',
    coinCost: 800,
    css: 'linear-gradient(180deg, #F472B6 0%, #FB923C 35%, #7C3AED66 70%, #1E1B4B 100%)',
    animClass: 'bg-anim-drift',
  },
  {
    id: 'yagmurlu-cam',
    name: 'Yağmurlu Cam',
    description: 'Çalışma masası ambiyansı, loş sıcak ışık',
    category: 'lofi',
    rarity: 'rare',
    coinCost: 500,
    css: 'radial-gradient(circle at 25% 30%, #F59E0B33 0%, transparent 40%), linear-gradient(200deg, #1C1917 0%, #292524 60%, #0C0A09 100%)',
    animClass: 'bg-anim-pulse',
  },
  {
    id: 'gece-treni',
    name: 'Gece Treni',
    description: 'Pencereden akan şehir ışıkları',
    category: 'lofi',
    rarity: 'epic',
    coinCost: 800,
    css: 'repeating-linear-gradient(100deg, transparent 0 38px, #F59E0B22 38px 41px, transparent 41px 78px, #60A5FA22 78px 80px), linear-gradient(180deg, #0F172A 0%, #020617 100%)',
    animClass: 'bg-anim-slide',
  },
  {
    id: 'piksel-gunbatimi',
    name: 'Piksel Günbatımı',
    description: '8-bit ufukta basamaklı güneş',
    category: 'pixel',
    rarity: 'rare',
    coinCost: 500,
    css: 'linear-gradient(180deg, #7C3AED 0 20%, #DB2777 20% 40%, #F97316 40% 55%, #FBBF24 55% 65%, #1E1B4B 65% 100%)',
  },
  {
    id: 'piksel-okyanus',
    name: 'Piksel Okyanus',
    description: 'Katman katman gece okyanusu',
    category: 'pixel',
    rarity: 'legendary',
    coinCost: 1500,
    css: 'linear-gradient(180deg, #0EA5E9 0 18%, #0284C7 18% 36%, #0369A1 36% 54%, #075985 54% 72%, #0C4A6E 72% 100%)',
    animClass: 'bg-anim-pulse',
  },
]

/** Profil KARTI arka planı (yalnız profil başlık kartında görünür). */
export const BACKGROUND_STORAGE_KEY = 'bilge-arena-profile-background-v1'

/**
 * Sayfa ZEMİNİ arka planı (tüm arena sayfalarının arkasında). Karttan AYRI:
 * kullanıcı kişiselleştirme stüdyosundan bilinçli olarak seçer (varsayılan
 * 'none' = zemin sade). Eskiden kart seçimi otomatik tüm zemine uygulanıyordu;
 * bu davranış kaldırıldı (kullanıcı kontrolü).
 */
export const ZEMIN_STORAGE_KEY = 'bilge-arena-zemin-v1'

export const BACKGROUND_RARITY_LABEL: Record<BackgroundRarity, string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
}

export function getBackgroundById(id: string): ProfileBackgroundDef {
  return PROFILE_BACKGROUNDS.find((b) => b.id === id) ?? PROFILE_BACKGROUNDS[0]
}
