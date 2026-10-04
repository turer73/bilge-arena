# Mobil akademi görselleri

5 Ekim 2026. Mobil Öğren ve Pratik yüzeylerinde mevcut web sanatını ölçülü kullanır; ders, sınav, günlük plan, soru ve gezinme akışlarını değiştirmez.

## İkon ailesi

`src/components/ui/academy-icon.tsx` içindeki `AcademyIcon`, Bilge Arena için çizilmiş 18 özgün SVG simgesini sunar. 64 birimlik çizim alanı, mavi cam yüzeyler, yumuşak altın vurgular ve koyu kontur ortak görsel dili oluşturur. Sabit renkler marka illüstrasyonuna aittir; etiket, seçili durum ve yüzey renkleri mevcut tema değişkenlerini kullanır.

```tsx
<AcademyIcon name="learn" size={30} muted={!active} />
```

| Grup | İsimler | Kullanım boyutu |
| --- | --- | --- |
| Dersler | matematik, turkce, fen, sosyal, wordquest | 24–28 px |
| Alt menü | learn, practice, arena, league, profile | 30 px |
| Kaynaklar | streak, gem, xp | 22 px |
| Araçlar ve durum | shop, classroom, institution, quality, locked | 24–30 px |

`muted`, seçilmemiş ve kilitli simgelerin doygunluğunu azaltır. Renk tek durum işareti değildir: mevcut metinler, sınırlar, aktif menü çizgisi, `aria-current`, `aria-pressed` ve tamamlanma işaretleri korunur. Simgeler dekoratiftir (`aria-hidden`, `focusable=false`); her kullanımın görünür veya erişilebilir etiketi olmalıdır. 22 px altında kullanmayın. Geri, kapat, açılır menü ve yön okları mevcut yalın simgelerini korur.

Her örneğin SVG geçiş kimliği React `useId` ile benzersizdir. Dış istek, filtre, animasyon veya yeni paket gerekmez. Setin tamamı yerine yalnız seçilen simgenin çizimi DOM'a eklenir.

## Mevcut görseller

- Öğren yol kartı: `public/academy/academy-landscape.png`. Tek bir küçük kart içinde sağa hizalı; koyu örtü başlık ve ilerleme metnini okunur tutar. Ders rengi sınır ve ilerleme çubuğunda korunur.
- Pratik ders özeti: mevcut `subjects/*-magic-v1.png` ve İngilizce için `modes/wordquest-v1.png`. 48 px kare; seçili dersle birlikte değişir. `sizes="128px"`, geniş kaynak görselin kareye sığdırılıp yakınlaştırılmasında düşük çözünürlükte büyütülmesini önler; üstten ölçekleme nesnenin tepesini korur.
- İki kullanım da Next Image üzerinden uygun `sizes` ile sunulur. Kaynak PNG dosyaları çoğaltılmaz veya yeniden üretilmez.
- Günlük plan kupası ve mevcut Bilge karakteri korunur. Yeni tam ekran arka plan veya hareketli efekt eklenmez.

## Doğrulama sınırı

Dar ekranlarda metin taşması, dokunma hedefleri, seçili durum ve açık/koyu yüzeyler tarayıcı önizlemesiyle kontrol edilir. Önizleme gerçek bileşenleri ve örnek veriyi kullanır; canlı hesap veya fiziksel telefon kabulü yerine geçmez. Sürümün somut test ve yayın kanıtları ilgili PR ve yerel handoff kaydında tutulur.
