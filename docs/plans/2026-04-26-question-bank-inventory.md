# Soru Bankası Envanter + Genişletme Önceliklendirmesi

**Tarih:** 2026-04-26
**Snapshot kaynağı:** `database/inventory-questions.mjs` → `database/inventory-snapshot.json`
**Üretim DB:** `lvnmzdowhfzmpkueurih.supabase.co` / `questions` tablosu (is_active=true)

---

## 1. Mevcut Envanter (3737 aktif soru)

| Oyun | Toplam | Kategori dağılımı (en yüksek → en düşük) |
| --- | ---: | --- |
| **matematik** | **966** | problemler 281 · geometri 283 · sayılar 162 · olasılık 80 · denklemler 80 · fonksiyonlar 80 |
| **türkçe** | **919** | paragraf 320 · dil_bilgisi 280 · sözcük 210 · anlam_bilgisi 70 · yazım_kuralları 39 |
| **wordquest** | **640** | vocabulary 295 · grammar 90 · sentence_completion 81 · phrasal_verbs 69 · restatement 35 · dialogue 35 · cloze_test 35 |
| **fen** | **608** | fizik 207 · kimya 202 · biyoloji 199 |
| **sosyal** | **604** | tarih 202 · coğrafya 201 · felsefe 188 · sosyoloji 13 |

### Zorluk dağılımı (1-5)

```
matematik   : 1=76    2=309   3=429   4=94    5=58
türkçe      : 1=120   2=263   3=305   4=146   5=85
wordquest   : 1=0     2=364   3=241   4=35    5=0      ← kolay/boss eksik
fen         : 1=48    2=274   3=170   4=70    5=46
sosyal      : 1=100   2=211   3=149   4=88    5=56
```

### Wordquest CEFR seviyesi

```
B1=85    B2=364   C1=186   ← A1/A2/C2 yok
```

---

## 2. Talep Sinyali (son 30 gün, status=completed)

| Oyun | Tamamlanan oturum | Mevcut soru | Plays/soru oranı |
| --- | ---: | ---: | ---: |
| **sosyal** | **61** | 604 | **0.101** |
| fen | 17 | 608 | 0.028 |
| türkçe | 17 | 919 | 0.018 |
| matematik | 16 | 966 | 0.017 |
| wordquest | 2 | 640 | 0.003 |

**Toplam:** 113 tamamlanmış oturum (yaklaşık 4/gün).

### Plausible Goals (üretim, ekran görüntüsünden)

```
GuestQuizStart      105 unique / 257 total / %24.9
GuestQuizComplete    63 unique / 156 total / %14.9
PromptShown          46 unique /  84 total / %10.9
PromptDismissed      39 unique /  52 total / % 9.2
QuizComplete         25 unique / 103 total / % 5.9
Day2Return           25 unique /  25 total / % 5.9
UserQuizStart        24 unique / 130 total / % 5.7
Signup               22 unique /  37 total / % 5.2
PromptCtaClicked     13 unique /  27 total / % 3.1
```

Funnel okuması (rakam değil oran):

- **Guest oyun başlatma → tamamlama %60** (105 → 63) — guest deneyim sağlam.
- **Tamamlama → prompt görme %73** (63 → 46) — gösterim doğru tetiklenmiş.
- **Prompt görme → CTA tık %28** (46 → 13) — ama dismiss %85 (39/46) — onarılması gereken UX.
- **Plausible QuizComplete (103) ≠ DB tamamlama (113)** — Plausible deneme modu da sayar; DB sadece classic/blitz/marathon. Tutarlı, beklenen sapma.

---

## 3. Tespit Edilen Boşluklar

### A. Kritik / Yüksek ROI

1. **sosyal/sosyoloji** — 13 soru. Kategori akranları (tarih/coğrafya/felsefe) ortalama 200. **+187 soru** ile pariteye gelir. **Sosyal en çok oynanan oyun (61 oturum/30g, hepsinin 4×'ı)** olduğu için bu boşluk kullanıcının derhal hissettiği bir boşluk.
2. **wordquest CEFR seviye boşlukları** — A1/A2 (başlangıç) ve C2 (ileri) tamamen boş. B2 ağırlıklı (%57). **Başlangıç seviyesi öğrencisi yeni hesap açtığında uygun zorluk göremiyor.** Difficulty 1 ve 5 de boş.
3. **türkçe/yazım_kuralları** — 39 soru. Akran kategoriler 70-320 arası. **+50 soru** önerisi.

### B. Orta öncelikli (denge düzeltme)

4. **matematik/{olasılık, denklemler, fonksiyonlar}** — Üçü de tam **80** soruda durmuş; bu doğal dağılım değil, seed cap. **Her birine +50 soru** parite için yeterli (problemler/geometri ~280 seviyesinde).
5. **fen/{fizik, kimya, biyoloji}** — ~200 dolayında dengeli; öncelik düşük. Sadece zorluk 5 (boss) sayısı düşük (46) — boss soru takviyesi dengeyi iyileştirir.
6. **türkçe/anlam_bilgisi** — 70 soru, 280 olan dil_bilgisi'ne göre düşük. Düşük öncelik.

### C. Yapısal sinyal (içerik değil)

7. **wordquest 2 oyun/30g** — 640 soru var ama kullanılmıyor. **Bu içerik problemi değil, keşif/UX problemi.** Olası nedenler:
   - Anasayfada wordquest tanıtımı zayıf
   - Header/menü prominence düşük
   - Türk öğrenci YKS konularını öne alıyor
   - Onboarding'de wordquest "biraz farklı" hissettiriyor
   Aksiyonsuz: yeni soru eklemek bu bottleneck'i kırmaz. Ayrı keşif sprintinde ele alınacak konu.

---

## 4. Önerilen Genişletme Planı (öncelik sırası)

### Sprint 1 — sosyoloji boşluğu (kritik)
- **Hedef:** +187 sosyoloji sorusu
- **Yöntem:** AI üretimi (Gemini 2.5 Pro, mevcut Google Generative AI key kullanımda) → admin onay akışı → batch insert
- **Neden:** Tek hareketle en yüksek kullanıcı etkisi (en çok oynanan oyun, en eksik kategori)
- **Risk:** Sosyoloji konuları subjektif; içerik kalite kontrolü manuel review gerektirir

### Sprint 2 — wordquest A1/A2 + difficulty 1
- **Hedef:** +200 A1, +200 A2 (her biri difficulty 1-2 ağırlıklı)
- **Yöntem:** AI üretimi + native speaker review (gerekirse outsource)
- **Neden:** Yeni başlayan ESL öğrencisi için içerik yokluğu = anında bounce. Plausible'da wordquest'in 2 oyun olmasına bu da katkıda olabilir.

### Sprint 3 — yazım kuralları + matematik denge
- **Hedef:**
  - +50 türkçe/yazım_kuralları (boss zorluk dahil)
  - +50 matematik/olasılık, +50 denklemler, +50 fonksiyonlar
- **Yöntem:** AI üretimi + matematik öğretmen review
- **Neden:** YKS hazırlık için bu üç kategori coverage zorunlu; "geometri kolay yine geometri geliyor" deneyimi monoton.

### Sprint 4 — wordquest C2 + boss difficulty
- **Hedef:** +100 C2, +100 difficulty 5 (boss) tüm oyunlarda toplam
- **Yöntem:** Manuel (kalite > miktar), gerekirse upwork freelancer
- **Neden:** İleri öğrenci ve premium dönüşüm ürünü için boss soruları kritik

---

## 5. Uygulama Çerçevesi — Mevcut Altyapı + Boşluklar

### 5.1 Zaten Hazır Olan (planı yazarken bilmiyordum, sonra keşfettim)

Aşağıdaki altyapı **production'da hazır:**

| Bileşen | Konum | Durum |
| --- | --- | --- |
| AI üretim API'si | `src/app/api/admin/generate-questions/route.ts` (421 LOC) | Gemini 2.5 Flash Lite, Zod validation, duplicate detection (50-char prefix), few-shot (mevcut 3 sorudan), `source='ai_generated'` + `is_active=false` ile insert |
| Admin üretici UI | `src/components/admin/ai-question-generator.tsx` (361 LOC) | Game/category/difficulty/topic seçimi, bilgi card'ı, üretim butonu |
| Admin onay sırası | `src/app/admin/sorular/page.tsx` (419 LOC) | `is_active` toggle (Pasif → Aktif), edit, sil |
| RBAC permission | `admin.questions.generate` | `checkPermission` ile guarded |
| RLS migration 029 | `database/migrations/029_questions_admin_rls_policies.sql` | Admin INSERT/UPDATE/DELETE açık |
| TOPIC_MAP | route.ts:11-46 | 5 oyun × 3-7 kategori, YKS konuları |

**Pratik anlamı:** Tier B "araç inşa etme" işi DEĞİL. Mevcut araç çalışıyor; eksik olan **konfigürasyon** + **batch çalıştırma** + **manuel review iterasyonları**.

### 5.2 Mevcut Araçtaki Boşluklar (eklenmeli)

1. **`TOPIC_MAP.sosyal` sosyoloji eksik** (route.ts:32-36) — sadece tarih/coğrafya/felsefe var. Kritik bulgu (sosyoloji kategorisi 13 soru ile en sıkışık), AI generator bu boşluğu doldurmak için **çalıştırılamıyor**. Eklenmeli: `sosyoloji: ['Toplum ve Birey', 'Sosyal Yapı', 'Toplumsal Değişme', 'Aile', 'Kültür', ...]`.
2. **Wordquest CEFR seviye filtresi yok** — route body sadece `{game, category, difficulty, topic}` alıyor; A1/A2/C2 hedeflemek için `level_tag` eklenmeli ve hem prompt'a hem insert'e (`level_tag` kolonu) yazılmalı.
3. **Wordquest difficulty 1 ve 5 dağılım eksik** — UI varsayılan difficulty 2-4 öneriyor olabilir; `<AiQuestionGenerator />` component'i kontrol edilmeli.
4. **Batch UX** — UI tek seferde N (default 5) soru üretiyor. 187 sosyoloji için ~38 run gerekir; UI'da queue/loop yok. Manuel iterasyon → admin sıkılır. **Opsiyon:** "5×10=50 soru bir komut" multi-batch UI eklemek.

### 5.3 Karar Çatalları (planlama)

1. **CEFR + difficulty 5 (boss) için ek sütun?** Schema'da `level_tag` zaten var (questions:66). Insert'e eklenmesi yeterli, schema değişikliği gerekmiyor.
2. **Telif:** AI prompt'unda "YKS sorularını birebir kopyalama, özgün üret" satırı **var mı**? `QUESTION_GEN_PROMPT_FALLBACK` içinde yok. Production env `QUESTION_GEN_PROMPT_TEMPLATE` daha sıkı olabilir (görünmez). Kontrol edilmeli.
3. **Onay batch'i:** 187 sorunun manuel review süresi ~3-5 saat. **AI ön-filtre** (Gemini'ye "bu kalitede mi?" sorusu) maliyeti düşürür ama kalite riski açar. Manuel default tercih.
4. **Wordquest UX boşluğu**: Tier B kapsamında DEĞİL (Section 3.C). Ayrı bir keşif/sprint.

### 5.4 Revize Edilmiş Sprint Tahminleri

Eski tahminler "yeni araç inşa et" varsayımıyla idi; mevcut araç bilgisi ışığında:

| Sprint | İş | Yeni süre tahmini |
| --- | --- | --- |
| 1: sosyoloji +187 | TOPIC_MAP'e konu ekle (10 dk) → 38 üretim run × 30 sn (~20 dk) → 187 manuel review (~3 saat) → Aktif et | **~4 saat tek mühendis** |
| 2: wordquest A1+A2 +400 | Route'a level_tag desteği (~1 saat dev) → 80 üretim run (~45 dk) → review (~5 saat) | **~7 saat** |
| 3: yazım kuralları + matematik denge +200 | TOPIC_MAP zaten var → 40 üretim run → review (~3 saat) | **~4 saat** |
| 4: C2 + boss difficulty +200 | Manuel curate veya AI + sıkı review | **~6 saat** |

**Toplam:** ~21 saat tek mühendis = 3 iş günü dağıtık. Kalite kontrol ana darboğaz, otomasyon değil.

---

## 6. Honest Açık Konular

- **wordquest düşük play sayısı** içerik eklenmesiyle düzelmeyecek. Ayrı UX sprintinde araştırılmalı: hero CTA, onboarding game seçimi, marketing.
- **Plausible Day2Return = 25** (Signup = 22) — Day2Return Signup'tan büyük çıkıyor; bu Plausible event mismatch (Day2Return guest+user'ı sayıyor olabilir). Doğrulanmalı, ama bu envanter raporunun konusu değil.
- **Production data taze değil** — Snapshot anı: 2026-04-26 22:39 UTC. Sprintler başlamadan re-run gerekir.
- **Plan hatası (kendine karşı dürüstlük):** İlk sürümde "AI üretim arayüzü yok" yazmıştım. Yanlış. Repo'yu önceden taramadım; lint çıktısında `ai-question-generator.tsx` görünce farkettim. Section 5 baştan yazıldı. Ders: planlama öncesi `find src -name '*generate*'` 5 saniyelik komut, varsayım üretmekten çok daha sağlam.
- **`QUESTION_GEN_PROMPT_TEMPLATE` env**: Production'da hangi prompt kullanılıyor görünmüyor (env'de saklı). Telif riski + kalite kalibrasyonu burada gizli; admin onayı sırasında dikkat etmek gerek.

---

## 7. Yan Çıktılar (zaten commit'te)

- `database/inventory-questions.mjs` — Yeniden çalıştırılabilir envanter aracı (read-only, service key gerekli)
- `database/inventory-snapshot.json` — Bu raporun temel aldığı ham veri
