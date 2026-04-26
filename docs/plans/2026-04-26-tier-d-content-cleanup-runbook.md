# Tier D Content Cleanup — Runbook

> **For Claude:** Bu plan artifact, gercek calismayi yapacak admin (kullanici) icindir. Tum ozet adimlar burada.

**Goal:** wordquest level_tag temizligi + C2 drift cleanup + sosyoloji 13 to 40 olcekleme.

**Architecture:** Migration 038 (UPDATE+DELETE) + run-generation.mjs CLI batch'leri.

**Tech Stack:** Postgres SQL, node CLI (Gemini 2.5 Flash Lite + Supabase service role).

---

## Onkosul

- `.env.local` icinde `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` set.
- Bu commit branch'inde: `dba9b95` veya sonrasi (Tier C drift fix dahil).
- Mevcut envanter (snapshot): `database/inventory-snapshot.json`.

---

## Adim 1: Migration 038 uygula

**Dosya:** `database/migrations/038_wordquest_level_tag_cleanup.sql`

**Beklenen etki (snapshot 2026-04-26T08:18 referansi):**
- `UPDATE`: 5 satir (wordquest level_tag NULL -> 'B2')
- `DELETE`: 5 satir (wordquest C2 inactive ai_generated 2026-04-26 batch)

**Uygulama:**

Supabase Dashboard yoluyla:
```
1) Supabase project -> SQL Editor
2) Migration dosyasinin icerigini paste'le
3) Run; once-only command
4) Output'ta "UPDATE 5" ve "DELETE 5" satirlarini gor
```

veya supabase CLI:
```bash
supabase db execute --file database/migrations/038_wordquest_level_tag_cleanup.sql
```

**Dogrulama (uygulama sonrasi):**
```sql
-- 1) NULL kalmamali
SELECT COUNT(*) FROM questions WHERE game='wordquest' AND level_tag IS NULL;
-- Beklenen: 0

-- 2) Drift batch silindi mi?
SELECT COUNT(*) FROM questions
WHERE game='wordquest' AND level_tag='C2' AND is_active=false
  AND source='ai_generated'
  AND created_at >= '2026-04-26 08:00:00+00'
  AND created_at <  '2026-04-26 09:00:00+00';
-- Beklenen: 0

-- 3) wordquest toplam aktif (635 idi, ayni kalmali — silinen rows zaten inactive)
SELECT COUNT(*) FROM questions WHERE game='wordquest' AND is_active=true;
-- Beklenen: 640 (5 satir B2 backfill ile aktif veya inactive durumlari korunur)
```

Idempotent: migration tekrar uygulanabilir, ikinci kosumda 0 satir etkilenir.

---

## Adim 2: Sosyoloji 13 to 40 olcek

Hedef: 27 yeni soru, 6 batch (toplam 27 soru).

**Difficulty dagilimi:**
- difficulty 2 (kolay): 7 soru
- difficulty 3 (orta): 15 soru
- difficulty 4 (zor): 5 soru

**Tek tek batch komutlari:**

```bash
cd F:\projelerim\bilge-arena

# Batch 1 (kolay, 5 soru)
node database/run-generation.mjs sosyal sosyoloji 2 -- 5

# Batch 2 (orta, 5 soru)
node database/run-generation.mjs sosyal sosyoloji 3 -- 5

# Batch 3 (orta, 5 soru)
node database/run-generation.mjs sosyal sosyoloji 3 -- 5

# Batch 4 (zor, 5 soru)
node database/run-generation.mjs sosyal sosyoloji 4 -- 5

# Batch 5 (orta, 5 soru)
node database/run-generation.mjs sosyal sosyoloji 3 -- 5

# Batch 6 (kolay, 2 soru — toplam 27)
node database/run-generation.mjs sosyal sosyoloji 2 -- 2
```

**Her batch sonrasi:**
- `database/generated/<timestamp>-sosyal-sosyoloji.json` dosyasi olusur (audit + reproduce).
- DB'ye `is_active=false` ile insert edilir.

**Beklenen toplam yeni satir:** 27. Duplicate filtre ile 27'den az olabilir (dedup ayni-prefix engeller).

**Quota uyarisi:** Gemini 2.5 Flash Lite ucretsiz katmanda dakika basi limit var. Batch'ler arasi 10-15 saniye bekle.

---

## Adim 3: Manuel review (admin UI)

Tum yeni `is_active=false` sorular admin paneli uzerinden incelenmeli:

```
http://localhost:3000/admin/sorular
Filter: is_active=false, source=ai_generated
```

Her soru icin:
- Icerik dogru mu (TR dilbilgisi + sosyoloji muhtevasi)
- Secenekler 5 tane (A-E), tek dogru cevap mantikli
- Cozum aciklayici (tekrar AI uretimi degil insan kontrolu)

Onaylananlar: `is_active=true` toggle.
Reddedilenler: silebilir veya `is_active=false` birakabilir (latent).

---

## Adim 4: Final envanter dogrulama

```bash
node database/inventory-questions.mjs
```

**Beklenen yeni snapshot:**
- `byGame.sosyal.byCategory.sosyoloji`: 13 -> hedef 40 (admin onayi sonrasi)
- `byGame.wordquest.byLevel.B2`: 364 -> 369 (5 backfill aktif sayilir)
- `byGame.wordquest` toplam aktif: hala 640 (silinen 5 rows zaten inactive idi)

---

## Risk Notlari

- **Drift quota:** Sosyoloji game wordquest degil; CEFR rubrik etkisinde drift gozlemlenmedi onceki batch'lerde. Yine de runtime drift filter wordquest'e ozel — sosyal/sosyoloji'de uygulanmaz. Gerek yok cunku Turkce dogal cikti.
- **Duplicate riski:** Mevcut 13 sosyoloji satirin question prefix'leri `existingPrefixes` set'inde olur. Yeni 27 batch icin Gemini ayni soruyu uretirse otomatik filtrelenir.
- **Topic dagilimi:** TOPIC_MAP.sosyal.sosyoloji 10 alt-konu icerir. Gemini bu listeden secim yapacak. Manuel reviewde dengeli dagilim umut edilir; degilse ek hedefli batch (--topic CLI arg eklenebilir, su an yok).

---

## Checklist

- [ ] Migration 038 uygulandi (UPDATE 5 + DELETE 5)
- [ ] inventory-questions.mjs ile dogrulama (level_tag NULL = 0)
- [ ] 6 sosyoloji batch calistirildi (database/generated/ icinde 6 yeni JSON)
- [ ] Admin UI'da yeni 27 soru review edildi (is_active=true toggled)
- [ ] Final inventory snapshot'i alindi
- [ ] Klipper memory: bu Tier D taskleri completed olarak post edildi
