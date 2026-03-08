# 🔍 WordQuest — Lisans Denetim Raporu

**Tarih:** Mart 2026  
**Repo:** github.com/turer73/3d-labx → tech-portal-frontend/public/wordquest  
**Toplam soru:** 635

## Denetim Kriterleri

- 🔴 **Riskli:** `"year"` alanı var → ÖSYM sınavından direkt kopya (YDT 2022/2023/2024)
- 🟢 **Güvenli:** `"year"` alanı yok, sadece `"exam"` etiketi → tarz benzerliği, direkt kopya değil

## Sonuçlar

| Kategori | Soru | Durum | Aksiyon |
|----------|------|-------|---------|
| vocabulary | 295 | 🟢 Güvenli | Kalıyor |
| phrasal_verbs | 69 | 🟢 Güvenli | Kalıyor |
| restatement | 35 | 🔴 Riskli | ✅ 35 orijinal soru yazıldı |
| grammar | 90 | 🔴 Riskli | ✅ 90 orijinal soru yazıldı |
| sentence_completion | 76 | 🔴 Riskli | ✅ 76 orijinal soru yazıldı |
| cloze_test | 35 | 🔴 Riskli | ✅ 35 orijinal soru yazıldı |
| dialogue | 35 | 🔴 Riskli | ✅ 35 orijinal soru yazıldı |

## Final Durum

**635/635 soru temizlendi. ✅ Tüm kategoriler lisans açısından güvenli.**

### Yeni yazılan sorular (271 soru)
- restatement: 35 — B1–C1, YKS formatı
- grammar: 90 — B1–C1, 10 farklı dilbilgisi yapısı
- sentence_completion: 76 — B1–C1, akademik konular
- cloze_test: 35 — B2–C1, 4 sorulu passage formatı
- dialogue: 35 — B1–C1, günlük ve akademik diyaloglar

### Güvenli kalan sorular (364 soru)
- vocabulary: 295
- phrasal_verbs: 69

## Veri Dosyası

`wordquest/data/questions.json` — 635 soru, tam temiz veri seti.

### Şema

```json
{
  "id": "string",
  "sentence": "string",
  "options": ["string × 5"],
  "answer": 0,
  "level": "B1|B2|C1",
  "exam": "YKS",
  "structure": "string (grammar için)",
  "topic": "string (cloze için)"
}
```
