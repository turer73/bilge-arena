# 📋 Bilge Arena — Platform Stratejisi

## Özet

YKS'ye hazırlanan Türk öğrenciler için gamification tabanlı ücretsiz alıştırma platformu.

## Hedef Kitle

- TYT + AYT hazırlayan lise öğrencileri (10–12. sınıf)
- Tekrar sınava girecek mezunlar
- Yaş aralığı: 15–23

## Dersler & Oyunlar

| Oyun | Ders | Format |
|------|------|--------|
| Kelime Atölyesi | İngilizce | Çoktan seçmeli quiz |
| Matematik Atölyesi | TYT Mat | Çoktan seçmeli quiz |
| Türkçe Atölyesi | TYT Türkçe | Çoktan seçmeli quiz |
| Fen Atölyesi | TYT Fen/Sosyal | Çoktan seçmeli quiz |

## Gamification Elementleri

- XP sistemi (zorluk × 10 puan)
- Streak (günlük seri)
- Rozetler (başarı tabanlı)
- Liderboard (haftalık/aylık)
- Seviye sistemi (Başlangıç → Efsane)
- Boss sorular (yüksek zorluk, yüksek ödül)

## Teknik Altyapı

### Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS + Framer Motion
- **Backend:** Supabase (Auth + PostgreSQL + Realtime)
- **Hosting:** Vercel (ücretsiz tier)
- **CDN:** Cloudflare
- **Domain:** bilgearena.com

### Başlangıç Maliyeti
- Domain: ~$12/yıl
- Supabase: Ücretsiz (500MB, 50k kullanıcı)
- Vercel: Ücretsiz
- **Toplam: ~$12/yıl**

## Gelir Modeli

### Aşama 1 — Büyüme (0–6 ay)
- Tamamen ücretsiz, reklamsız
- Kullanıcı tabanı oluştur
- Hedef: 1.000 aktif kullanıcı

### Aşama 2 — Monetizasyon (6–12 ay)
- Google AdSense
  - Oyun bitişi: interstitial
  - Liderboard altı: banner
- Türkiye RPM: $0.5–2 (gerçekçi beklenti)
- 10.000 aktif kullanıcı → anlamlı gelir

### Aşama 3 — Freemium (12+ ay)
- Reklamsız deneyim: ~₺29/ay
- Ekstra içerik, detaylı analitik

### Uzun Vade — B2B
- Dershane/okul lisansı
- Toplu kullanıcı yönetimi
- Öğretmen paneli

## 8 Haftalık Lansman Takvimi

| Hafta | Görev |
|-------|-------|
| 1–2 | Next.js + Supabase kurulum, WordQuest entegrasyonu |
| 3–4 | Matematik Atölyesi + kullanıcı auth |
| 5–6 | Türkçe + Fen Atölyesi, liderboard, profil |
| 7 | Beta (50–100 kişi), sosyal medya duyurusu |
| 8 | 🚀 Lansman + AdSense başvurusu |

## Rekabet Analizi

| Platform | Güçlü | Zayıf |
|----------|-------|-------|
| Vitamin | Marka bilinirliği | Pahalı, eğlencesiz |
| Çalış Kazan | Gamification var | Soru kalitesi düşük |
| Khan Academy | İçerik kalitesi | Türkçe YKS odaklı değil |
| **Bilge Arena** | Ücretsiz + oyun + YKS odaklı | Yeni, bilinmiyor |

## Başarı Kriterleri

- Ay 1: 100 kayıtlı kullanıcı
- Ay 3: 1.000 aktif kullanıcı
- Ay 6: 5.000 aktif kullanıcı
- Ay 12: AdSense onayı + ilk gelir
