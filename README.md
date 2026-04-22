# 🏛️ Bilge Arena

> YKS'ye hazırlanan öğrenciler için oyun tabanlı alıştırma platformu.

## 🎯 Vizyon

Sınav kaygısını değil, öğrenme heyecanını ön plana çıkaran, gamification ile desteklenmiş Türkiye'ye özgü bir YKS hazırlık platformu.

## 🎮 Oyunlar

| Oyun | Ders | Durum |
|------|------|-------|
| Kelime Atölyesi (WordQuest) | İngilizce | ✅ Soru bankası hazır |
| Matematik Atölyesi | TYT Matematik | 🔜 Yapılacak |
| Türkçe Atölyesi | TYT Türkçe | 🔜 Yapılacak |
| Fen Atölyesi | TYT Fen | 🔜 Yapılacak |

## 📊 Soru Bankası Durumu

### WordQuest (İngilizce) — 635 soru ✅ Tamamlandı

| Kategori | Soru | Kaynak |
|----------|------|--------|
| vocabulary | 295 | Özgün |
| phrasal_verbs | 69 | Özgün |
| restatement | 35 | Yeni yazıldı |
| grammar | 90 | Yeni yazıldı |
| sentence_completion | 76 | Yeni yazıldı |
| cloze_test | 35 | Yeni yazıldı |
| dialogue | 35 | Yeni yazıldı |

## 🛠️ Teknik Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS + Framer Motion
- **Backend/DB:** Supabase (Auth + Postgres + Realtime)
- **Hosting:** Vercel + Cloudflare CDN
- **Domain:** bilgearena.com (hedef)

## 🎨 Marka

### Renk Paleti

| Renk | Hex | Kullanım |
|------|-----|----------|
| Bilişsel Mavi | `#2563EB` | Ana buton, odak, soru arayüzü |
| Ödül Altını | `#D97706` | XP, rozet, liderboard |
| İlerleme Yeşili | `#059669` | Doğru cevap, streak, progress |
| Bilgelik Moru | `#7C3AED` | Legend seviye, premium |
| Acil Kırmızı | `#DC2626` | Yanlış cevap, son 10 sn |

**Tema:** Çift (karanlık + açık), CSS değişken sistemi.

## 🗺️ Yol Haritası

### Aşama 1 — Temel (Hafta 1–2)
- [ ] Next.js + Supabase kurulum
- [ ] WordQuest entegrasyonu
- [ ] Kullanıcı auth sistemi

### Aşama 2 — Genişleme (Hafta 3–4)
- [ ] Matematik Atölyesi
- [ ] Liderboard sistemi
- [ ] Kullanıcı profili

### Aşama 3 — Tamamlama (Hafta 5–6)
- [ ] Türkçe + Fen Atölyesi
- [ ] XP & rozet sistemi
- [ ] Sosyal özellikler

### Aşama 4 — Lansman (Hafta 7–8)
- [ ] Beta (50–100 kişi)
- [ ] Sosyal medya duyurusu
- [ ] 🚀 Lansman + AdSense başvurusu

## 💰 Gelir Modeli

1. **Aşama 1 (0–6 ay):** Reklamsız, kullanıcı büyümesi
2. **Aşama 2:** Google AdSense
3. **Aşama 3:** Freemium (~₺29/ay reklamsız)
4. **Uzun vade:** B2B dershane/okul lisansı

## 📁 Repo Yapısı

```
bilge-arena/
├── docs/                    # Strateji ve tasarım dokümanları
│   ├── brand.md             # Marka kimliği
│   ├── strategy.md          # Platform stratejisi
│   └── tyt-analysis.md      # TYT konu frekans analizi
├── wordquest/
│   ├── data/
│   │   ├── questions-sample.json  # ~20 soru (public, dev testi için)
│   │   └── questions.json         # 489 soru (git-ignored, private)
│   └── docs/
│       └── license-audit.md       # Lisans denetim raporu
├── database/
│   └── seed.js                    # Supabase seed (sample/full modu)
└── README.md
```

## 🧪 Geliştirme Kurulumu

1. **Bağımlılıklar:** `npm install`
2. **Env dosyası:** `.env.example` → `.env.local` kopyala, Supabase değerlerini doldur
3. **Dev sunucu:** `npm run dev` (http://localhost:3000)

### Soru Bankası Seed

```bash
# Varsayılan: sample dosyası (~20 soru, dev testleri için)
node database/seed.js

# Full dataset (maintainer'dan al, private/questions.json veya custom path)
node database/seed.js --full
QUESTIONS_JSON_PATH=/yol/questions.json node database/seed.js --full
```

Full dataset git'te takip edilmez (`.gitignore` ile `wordquest/data/` ve `/private/` hariç). Yeni gelistiriciler maintainer ile iletisime geçer.

---

**Başlangıç tarihi:** Mart 2026  
**Hedef lansman:** Mayıs 2026
