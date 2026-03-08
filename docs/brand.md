# 🎨 Bilge Arena — Marka Kimliği

## İsim

**Bilge Arena**

- "Bilge" → Türkçe: akıllı, bilgili, hikmetli
- "Arena" → rekabet, oyun, meydan
- Birlikte: bilginin yarışıldığı alan

## Slogan Adayları

- "Öğren. Kazan. Yüksel."
- "Bilgi Senin Silahın"
- "Her Soru Bir Adım"
- "Sınavı Oyna, Hayatı Kazan"

## Renk Paleti

Psikolojik araştırmaya dayalı, gamification için optimize edilmiş.

### Birincil Renkler

| Renk | Karanlık Tema | Açık Tema | Psikoloji | Kullanım |
|------|--------------|-----------|-----------|----------|
| Bilişsel Mavi | `#2563EB` | `#1D4ED8` | Güven, odak, netlik | Ana buton, soru arayüzü |
| Ödül Altını | `#D97706` | `#B45309` | Motivasyon, başarı | XP, rozet, liderboard |
| İlerleme Yeşili | `#059669` | `#047857` | Büyüme, doğruluk | Doğru cevap, streak |

### İkincil Renkler

| Renk | Karanlık Tema | Açık Tema | Kullanım |
|------|--------------|-----------|----------|
| Bilgelik Moru | `#7C3AED` | `#6D28D9` | Legend seviye, premium |
| Acil Kırmızı | `#DC2626` | `#B91C1C` | Yanlış cevap, son 10 sn |

### Arka Plan / Nötr

| | Karanlık | Açık |
|--|---------|------|
| Arka plan | `#0F172A` | `#F8FAFC` |
| Kart | `#1E293B` | `#FFFFFF` |
| Kenarlık | `#334155` | `#E2E8F0` |
| Metin (ana) | `#F1F5F9` | `#0F172A` |
| Metin (ikincil) | `#94A3B8` | `#475569` |

## Tema Sistemi

CSS değişken tabanlı çift tema:

```css
[data-theme="dark"] {
  --color-primary: #2563EB;
  --color-reward: #D97706;
  --color-success: #059669;
  --color-premium: #7C3AED;
  --color-danger: #DC2626;
  --bg-base: #0F172A;
  --bg-card: #1E293B;
}

[data-theme="light"] {
  --color-primary: #1D4ED8;
  --color-reward: #B45309;
  --color-success: #047857;
  --color-premium: #6D28D9;
  --color-danger: #B91C1C;
  --bg-base: #F8FAFC;
  --bg-card: #FFFFFF;
}
```

## Tipografi

- **Başlıklar:** Inter veya Poppins (Bold)
- **Gövde:** Inter (Regular/Medium)
- **Sayılar/XP:** Monospace veya tabular nums

## Logo Konsepti

- Sembol: Kalkan + kitap veya beyin + yıldırım
- Renk: Bilişsel Mavi + Ödül Altını
- His: Güçlü, genç, dinamik

## Hedef Kitle Tonu

- **Yaş:** 15–23
- **Ton:** Enerjik, arkadaşça, motive edici
- **Kaçınılanlar:** Kurumsal dil, aşırı ciddiyet, paternalizm
- **Örnekler:** "Harika iş!", "Seriye devam!", "Boss soruyu geçtin!"
