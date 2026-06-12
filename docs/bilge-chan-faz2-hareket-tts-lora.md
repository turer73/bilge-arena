# Bilge Chan Faz 2 — Hareket + TTS + LoRA Kararları (2026-06-12)

Bu doküman 05-13 karakter-tasarım fazında açık bırakılan üç kararı kapatır
(hafıza: "Bilge Chan kalan işler" — animation, TTS, kaynak/maliyet).

## 1. Hareket: CSS sprite < **CSS idle (BU PR)** < Lottie < Live2D

| Seçenek | Maliyet | Asset ihtiyacı | Etki | Karar |
|---|---|---|---|---|
| **CSS idle/nefes (bu PR)** | ~0 | Yok (mevcut 8 webp) | Orta — karakter "canlı" hissi | ✅ Hemen |
| Sprite-sheet frame anim. | Düşük | Pose başına 4-8 ara kare | Orta+ | ❌ Ara kareler elde yok; LoRA sonrası anlamlı |
| Lottie (vektör) | Orta | Karakterin vektör yeniden çizimi | Yüksek | ⏸ Vektörleştirme maliyeti raster LoRA hattıyla çelişiyor |
| Live2D Cubism | Yüksek (lisans+rigging) | PSD katmanlı kaynak | En yüksek | ⏸ Kaynak PSD yok; ticari lisans; bundle +~300KB |

**Karar:** Bugün CSS idle (`animate-chan-idle`, 5s nefes+salınım, `motion-reduce` guard'lı).
Gerçek animasyon kararı LoRA hattına bağlandı: LoRA ile ara kareler üretilebilirse
**sprite-sheet** en ucuz ikinci adım; Live2D ancak maskot kanıtlanmış engagement
sürücüsü olursa (ölçüm: quiz-tamamlama oranında Chan'lı/Chan'sız A-B).

## 2. TTS: **Web Speech API (BU PR)** → Faz-3'te sunucu TTS opsiyonu

- **Bu PR:** `chan-tts.ts` — tarayıcı yerleşik `speechSynthesis`, `tr-TR`,
  pitch 1.15 (genç ton). Sıfır maliyet, sıfır network, KVKK-temiz (metin cihaz
  dışına çıkmaz). Global ses tercihi (SoundToggle) kapalıysa konuşmaz.
  Balonda opt-in 🔉 butonu — otomatik konuşma YOK (ilk sürümde rahatsız etmesin).
- **Bilinen kısıt:** Ses kalitesi cihaza bağlı (Android TR sesi iyi, bazı
  masaüstlerinde robotik). Kabul edilen tradeoff.
- **Faz-3 yükseltme yolu:** Edge-TTS / Piper (klipper SER8'de lokal, ücretsiz)
  ile önceden üretilmiş statik MP3'ler — CHAN_LINES sabit olduğu için replikler
  build-time'da seslendirilollebilir; tek değişim noktası `chan-tts.ts`.

## 3. SDXL LoRA üretim hattı (oturum dışı — RTX 3060 işi)

**Karar: LoRA fine-tune YAPILACAK** (05-13 önerisi onaylandı). Gerekçe: pose
başına <$0.10, stil tutarlılığı, sprite ara-kare üretimini de açar.

Çalıştırılabilir plan (surer RTX 3060 6GB):
1. **Dataset:** `F:\projelerim\bilge-arena-assets\` altındaki kaynak görseller +
   prod 8 webp → ~15-20 görsel, 1024px, BLIP ile otomatik caption + elle düzeltme
   (tetik kelime: `bilgechan`). 6GB VRAM için SDXL yerine **SD1.5 tabanlı
   anime checkpoint** (ör. AnythingV5) + LoRA rank 16 — SDXL 6GB'de ancak
   kohya `--lowram` + gradient checkpointing ile olur, ilk denemede SD1.5 pragmatik.
2. **Eğitim:** kohya_ss, ~1500-2500 step, batch 1-2, ~2-4 saat.
3. **Doğrulama:** 6 mevcut pose'un yeniden üretimi + 2 yeni pose (şaşkın,
   uykulu) — stil sapması elle değerlendirme.
4. **Çıktı:** yeni pose'lar → mevcut `public/chan/*.webp` hattına (boyut tablosu
   `bilge-chan.tsx`'te güncellenir).

**Önemli:** eğitim bu repo/oturum kapsamı dışında; klipper'a görev paketi olarak
verilebilir (GPU surer'da olduğu için koordinasyon: klipper plan → surer çalıştırır).

## Ölçüm (hipotez doğrulama)

Maskot yatırımının devamı şu metriğe bağlı: Plausible'da `GuestQuizStart` →
tamamlama oranı, Chan görünür/gizli segmentinde. Anlamlı fark yoksa Live2D/LoRA
harcaması yapılmaz (Ensar-roadmap "hipotez" notuyla tutarlı).
