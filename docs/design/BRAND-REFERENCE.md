# Referans logo web uyarlaması

Kaynak: kullanıcının sağladığı `ChatGPT Image 12 Eyl 2026 16_41_48.png` marka panosunun üst solundaki büyük amblem. Yeni bir marka yönü değil; bu panodaki taçlı, yörüngeli B kalkanının web uyarlamasıdır.

Güncel çıktı: `dist/brand-crest-orbit.png`, 1254 × 1254 RGBA PNG; dört köşe alfa değeri 0. Açık/koyu zemin üzerinde ve 52 px boyutta dosya önizlemesi incelendi. Tarayıcı görsel testi yapılmadı. Bu, üretken araçtan geçirilmiş bir uyarlamadır; kaynak görüntüden piksel piksel kayıpsız kesim veya vektör asıl dosya olduğu iddia edilmez. Büyük boyutta ince kenar saçakları bulunur.

Başlık yazısı HTML/CSS ile `BİLGE ARENA`, alt satır `ÖĞREN · KAZAN · YÜKSEL` olarak oluşturulur. Koyu temalarda beyaz/turkuaz, açık temada koyu lacivert/mavi yazı kullanılır; amblem renkleri sabittir. CSS yalnızca 768 px ve üzeri için uygulanır. Eski logo dosyaları ve mobil önizleme davranışı korunur. Canlı Bilge Arena değişmedi.

## Araç

Yerleşik OpenAI imagegen. CLI/API anahtarı, Renderhane veya başka üretim servisi kullanılmadı. Yerel dosya okumasındaki cwd sorunu nedeniyle ilk dosya-yolu çağrısı üretim başlamadan başarısız oldu. Aynı referansın dosya yolu olmayan bellek içi konuşma önizlemesiyle bir çıkarım ve ardından tek hedefli arka plan onarımı yapıldı. İlk çıktının damalı zemini gerçek alfa değildi ve Site'ye alınmadı.

## Çıkarım promptu

Use case: background-extraction. Asset type: ONE transparent crest-only PNG for a website header displayed at 52–64 px. Input image 1 is the EDIT TARGET. Extract the prominent large upper-left Bilge Arena crest from this exact reference sheet, located above the external BILGE ARENA wordmark and to the left of the anime boy. This is a faithful background-removal/extraction edit, not a logo redesign. Preserve that exact crest identity, silhouette, proportions, placement, colors, glossy highlights and fine geometry: a glossy navy shield with thick blue/cyan/violet beveled edge; a GOLD three-point crown above the shield; a single large WHITE serif capital B inside; a diagonal orbital swoosh curving from cyan on the lower-left across toward gold on the upper-right; one small GOLD four-point star inside the shield below the B. Keep the visual layering of the orbit, B, shield and crown exactly as in that prominent upper-left logo. Do not substitute the simplified Sade/Ikon crest or any smaller logo from the sheet. Remove everything outside the crest itself: all surrounding dark background, all external wordmark and slogan text, anime boy, phones, design-sheet boxes, explanatory text, other icons and other logos. No external text at all; the B inside the crest is the only text. Output: one centered, square, high-resolution PNG with a genuinely transparent alpha background and clean antialiased cutout edges, with only approximately 5% empty margin around the outermost crest/orbit/crown. Preserve the reference design, do not invent details, and do not generate alternatives. No checkerboard pattern, no white/black/color rectangle, no background, no drop-shadow canvas.

## Tek arka plan onarımı

Remove ONLY the baked gray checkerboard around this existing crest. Output actual transparent PNG alpha; no simulated transparency, no checkerboard, no white/black matte. Preserve every crest pixel/shape, gold crown, cyan-gold orbit, white B, small star and existing framing. Transparent background.
