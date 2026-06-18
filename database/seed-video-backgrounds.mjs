/**
 * Arka plan videolarını (Ensar "Arkaplanlar Vol 1" + AI-üretilen lisans-temiz yeniler) web-loop'a optimize edip Supabase
 * video-backgrounds bucket'a yükler ve background_assets'e (is_published=true)
 * yazar. Idempotent (slug upsert + storage upsert).
 *
 * Kullanım: node database/seed-video-backgrounds.mjs [--limit N]
 * .env.local'den NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY okur.
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Path'ler env ile override edilebilir (Codex P2: tek-makine bağımlılığı).
// Windows default'lar geriye uyumluluk için; CI/Linux'ta env ile verilir.
const FFMPEG =
  process.env.FFMPEG_PATH ||
  'C:\\Users\\sevdi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe'
const SRC =
  process.env.ENSAR_SRC || 'F:\\projelerim\\bilge-arena-assets\\ensar-videos\\Arkaplanlar Vol 1'
const OUT =
  process.env.ENSAR_OUT || 'F:\\projelerim\\bilge-arena-assets\\ensar-videos\\optimized'
// AI-üretilen (lisans-temiz) kaynaklar bilge-arena-assets kökünde (Ensar dışı pipeline).
// Telifli Ensar pixel orijinalleri (Chainsaw/Elden/Itachi vb.) AI ile yeniden üretildi;
// aşağıda bu item'lar aiFile ile AI_SRC'deki temiz kaynaklara map edilir.
const AI_SRC =
  process.env.AI_SRC || 'F:\\projelerim\\bilge-arena-assets'

// ── .env.local parse (dotenv'siz) ──
const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
// URL .env.local'de yok (Vercel'de) — proje ref public, fallback
const URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co'
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('HATA: SUPABASE_SERVICE_KEY/SERVICE_ROLE_KEY .env.local de yok')
  process.exit(1)
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// ── Katalog mapping (24 video) ──
const ITEMS = [
  { file: '(Lo-Fi) Kız Ders Çalışma.mp4', slug: 'lofi-ders-calisma', name: 'Ders Çalışma', category: 'lofi', rarity: 'rare', coin_cost: 1200, description: 'Lo-fi eşliğinde sakin ders ortamı' },
  { file: '(Lo-Fi) Kedi Dinleniyor.mp4', slug: 'lofi-kedi', name: 'Tembel Kedi', category: 'lofi', rarity: 'rare', coin_cost: 1200, description: 'Pencere kenarında dinlenen kedi' },
  { file: '(Lo-Fi) Kız Tren Yolculuğu.mp4', slug: 'lofi-tren', name: 'Tren Yolculuğu', category: 'lofi', rarity: 'epic', coin_cost: 1400, description: 'Pencereden akan manzara, lo-fi tren' },
  { file: '(Lo-Fi) Kız ve Kedi Dinleniyorlar 2.mp4', slug: 'lofi-kiz-kedi-2', name: 'Huzurlu Mola II', category: 'lofi', rarity: 'epic', coin_cost: 1400, description: 'Kız ve kedi birlikte dinleniyor' },
  { file: '(Lo-Fi) Kız ve Kedi Dinleniyorlar.mp4', slug: 'lofi-kiz-kedi', name: 'Huzurlu Mola', category: 'lofi', rarity: 'epic', coin_cost: 1400, description: 'Sıcak ışıkta dinlenme anı' },
  { file: '(Lo-Fi) Manzara.mp4', slug: 'lofi-manzara', name: 'Lo-Fi Manzara', category: 'lofi', rarity: 'rare', coin_cost: 1200, description: 'Yumuşak renkli lo-fi manzara' },

  { file: '(Cyberpunk) Car.mp4', slug: 'cyberpunk-car', name: 'Neon Sürüş', category: 'cyberpunk', rarity: 'epic', coin_cost: 1500, description: 'Yağmurlu neon caddede araba' },
  { file: '(Cyberpunk) City 2.mp4', slug: 'cyberpunk-city-2', name: 'Siber Şehir II', category: 'cyberpunk', rarity: 'epic', coin_cost: 1500, description: 'Gökdelenler arası neon panorama' },
  { file: '(Cyberpunk) City.mp4', slug: 'cyberpunk-city', name: 'Siber Şehir', category: 'cyberpunk', rarity: 'rare', coin_cost: 1300, description: 'Cyberpunk şehir silüeti' },

  { file: '(Manzara)  Sakin ve Huzurlu Göl.mp4', slug: 'manzara-gol', name: 'Huzurlu Göl', category: 'manzara', rarity: 'rare', coin_cost: 1300, description: 'Sakin dağ gölü' },
  { file: '(Manzara) Doğayla İç İçe Ev Ortamı.mp4', slug: 'manzara-ev', name: 'Doğa Evi', category: 'manzara', rarity: 'rare', coin_cost: 1300, description: 'Doğayla iç içe huzurlu ev' },
  { file: '(Manzara) Fuji Dağı.mp4', slug: 'manzara-fuji', name: 'Fuji Dağı', category: 'manzara', rarity: 'epic', coin_cost: 1500, description: 'Karlı Fuji zirvesi' },
  { file: '(Manzara) Gece Treni.mp4', slug: 'manzara-gece-treni', name: 'Gece Treni', category: 'manzara', rarity: 'rare', coin_cost: 1300, description: 'Yıldızlı gökyüzünde gece treni' },
  { file: '(Manzara) Rahatlatıcı Şelale.mp4', slug: 'manzara-selale', name: 'Şelale', category: 'manzara', rarity: 'epic', coin_cost: 1500, description: 'Rahatlatıcı orman şelalesi' },
  { file: '(Manzara) Sakin ve Huzurlu Göl 2.mp4', slug: 'manzara-gol-2', name: 'Huzurlu Göl II', category: 'manzara', rarity: 'rare', coin_cost: 1300, description: 'Yansımalı sakin göl' },
  { file: '(Manzara) Su Altı Manzarası.mp4', slug: 'manzara-su-alti', name: 'Su Altı', category: 'manzara', rarity: 'epic', coin_cost: 1500, description: 'Derin mavi su altı manzarası' },

  // TELİF NOTU: pixel-adventure tek telifli-orijinal (Adventure Time / Cartoon Network);
  // AI-temiz versiyonu YOK. Kullanıcı telif riskini kabul edip yayınladı (2026-06-18).
  { file: '(Pixel Art) Adventure Time.mp4', slug: 'pixel-adventure', name: 'Pixel Macera', category: 'pixel', rarity: 'rare', coin_cost: 1400, description: 'Renkli piksel macera dünyası' },
  // Aşağıdaki 6 pixel: AI ile yeniden üretilmiş lisans-temiz versiyonlar (AI_SRC).
  { aiFile: 'pixel_chainsawSeamless_loopin.mp4', slug: 'pixel-chainsaw', name: 'Pixel Aksiyon', category: 'pixel', rarity: 'epic', coin_cost: 1600, description: 'Aksiyon temalı piksel sahne' },
  { aiFile: 'pixel_cyberpunk_citySeamless_l.mp4', slug: 'pixel-cyberpunk-city', name: 'Pixel Siber Şehir', category: 'pixel', rarity: 'epic', coin_cost: 1600, description: '8-bit cyberpunk şehir' },
  { aiFile: 'pixel_cyberpunkSeamless_loopin.mp4', slug: 'pixel-cyberpunk', name: 'Pixel Cyberpunk', category: 'pixel', rarity: 'rare', coin_cost: 1400, description: 'Piksel neon atmosfer' },
  { aiFile: 'pixel_eldenSeamless_looping_pi.mp4', slug: 'pixel-elden', name: 'Pixel Diyar', category: 'pixel', rarity: 'rare', coin_cost: 1400, description: 'Fantastik piksel diyarı' },
  { aiFile: 'pixel_ukinamiSeamless_looping.mp4', slug: 'pixel-ukinami', name: 'Pixel Sahil', category: 'pixel', rarity: 'epic', coin_cost: 1600, description: 'Piksel sahil esintisi' },
  { aiFile: 'pixel_itachiSeamless_looping.mp4', slug: 'pixel-itachi', name: 'Pixel Savaşçı', category: 'pixel', rarity: 'rare', coin_cost: 1400, description: 'Piksel savaşçı sahnesi' },

  // AI-üretilen lisans-temiz yeni arka planlar (06-17 yayınlandı):
  { aiFile: 'comic_book_graphic_novel_art.mp4', slug: 'cizgi-roman', name: 'Çizgi Roman', category: 'cizgi-roman', rarity: 'epic', coin_cost: 1600, description: 'Cizgi roman / graphic novel tarzi dinamik arka plan' },
  // NOT: pixel-doga kaynağı varsayım (tek kalan generic AI dosyası); seed çalıştırılırken doğrula.
  { aiFile: 'user-ai-generation-sO01qxqp3reA-1080p.mp4', slug: 'pixel-doga', name: 'Pixel Doğa', category: 'pixel', rarity: 'rare', coin_cost: 1400, description: 'Pixel sanat dogal manzara - cayir, daglar, bulutlar' },

  { file: '(Boşluk) Uzay Bükülmesi.mp4', slug: 'kozmik-uzay-bukulmesi', name: 'Uzay Bükülmesi', category: 'kozmik', rarity: 'legendary', coin_cost: 2000, description: 'Yıldızlar arası uzay-zaman bükülmesi' },
]

const limitIdx = process.argv.indexOf('--limit')
const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : ITEMS.length
const list = ITEMS.slice(0, limit)

const VF = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1'

async function main() {
  const results = []
  let uploadErrors = 0
  for (const it of list) {
    const inFile = it.aiFile ? path.join(AI_SRC, it.aiFile) : path.join(SRC, it.file)
    if (!fs.existsSync(inFile)) {
      console.error('ATLA (dosya yok):', it.aiFile || it.file)
      continue
    }
    const outDir = path.join(OUT, it.slug)
    fs.mkdirSync(outDir, { recursive: true })
    const hd = path.join(outDir, 'hd.mp4')
    const poster = path.join(outDir, 'poster.jpg')

    console.log('▶ TRANSCODE', it.slug)
    execFileSync(FFMPEG, [
      '-y', '-i', inFile, '-t', '15', '-vf', VF, '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '32',
      '-maxrate', '4000k', '-bufsize', '8000k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', hd,
    ], { stdio: 'ignore' })
    execFileSync(FFMPEG, [
      '-y', '-ss', '3', '-i', inFile, '-vframes', '1',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease', '-q:v', '5', poster,
    ], { stdio: 'ignore' })

    const hdMB = (fs.statSync(hd).size / 1048576).toFixed(2)
    console.log(`  hd=${hdMB}MB`)

    const hdBuf = fs.readFileSync(hd)
    const posterBuf = fs.readFileSync(poster)
    const up1 = await supabase.storage.from('video-backgrounds').upload(`${it.slug}/hd.mp4`, hdBuf, { contentType: 'video/mp4', upsert: true })
    const up2 = await supabase.storage.from('video-backgrounds').upload(`${it.slug}/poster.jpg`, posterBuf, { contentType: 'image/jpeg', upsert: true })
    if (up1.error || up2.error) {
      console.error('  UPLOAD HATA:', up1.error?.message || up2.error?.message)
      uploadErrors++
      continue
    }
    const hdUrl = supabase.storage.from('video-backgrounds').getPublicUrl(`${it.slug}/hd.mp4`).data.publicUrl
    const posterUrl = supabase.storage.from('video-backgrounds').getPublicUrl(`${it.slug}/poster.jpg`).data.publicUrl
    results.push({ ...it, hdUrl, posterUrl })
    console.log('  ✓ uploaded')
  }

  let ok = 0
  for (const r of results) {
    const { error } = await supabase.from('background_assets').upsert(
      {
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        category: r.category,
        rarity: r.rarity,
        coin_cost: r.coin_cost,
        variants: { hd: r.hdUrl },
        poster_url: r.posterUrl,
        is_published: true,
      },
      { onConflict: 'slug' },
    )
    if (error) console.error('  DB HATA', r.slug, error.message)
    else { ok++; console.log('  DB ✓', r.slug) }
  }
  console.log(`\nTAMAM: ${results.length} işlendi, ${ok} DB kaydı.`)
  // Upload reddedilmişse seed'i başarısız say (Codex P2: sessiz veri kaybı önle)
  if (uploadErrors > 0) {
    console.error(`HATA: ${uploadErrors} dosya yüklenemedi — seed eksik.`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
