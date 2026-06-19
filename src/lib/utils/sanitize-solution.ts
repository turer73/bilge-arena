/**
 * Çözüm metnindeki ŞIK-HARFİ referanslarını temizler.
 *
 * UI seçenekleri karıştırarak gösterir (correct_index pozisyon-biası önleme), bu yüzden
 * "Seçenek B", "Doğru cevap C", "B şıkkı" gibi harfe dayalı ifadeler kullanıcıya YANLIŞ
 * görünür. Codex PR#250: üretim prompt'undaki "şık-harfi yasak" kuralı tek başına
 * ADVISORY — model uymazsa harf-referanslı çözüm yine kaydedilir; ayrıca few-shot örnekleri
 * mevcut harf-referanslı çözümleri Gemini'ye PRIMING eder.
 *
 * Defense-in-depth backstop: (1) insert öncesi üretilen çözümü sterilize eder, (2) few-shot
 * örneklerinin çözümlerini temizleyip priming'i keser. Kusursuz değil (asıl savunma prompt
 * kuralı) ama en yaygın kalıpları nötrler.
 *
 * NOT: JS `\b` ASCII-temelli; Türkçe harflerle ("ı", "ş", k→ğ mutasyonu) bozulur. Bu yüzden
 * Türkçe-harf negatif-lookahead/behind sınırı + kök ("seçeneğ"/"şıkk") kullanılır.
 */
const TL = 'a-zA-ZçğıöşüÇĞİÖŞÜ'

export function stripSolutionLetterRefs(text: string): string {
  if (!text) return text
  return text
    // "Doğru cevap B seçeneğidir." / "Doğru yanıt C şıkkıdır" — gereksiz (UI doğruyu işaretler)
    .replace(new RegExp(`\\s*do[ğg]ru\\s+(cevap|yanıt|seçenek)\\s+[A-Ea-e]\\s*(seçeneğidir|şıkkıdır|seçenektir)?\\s*\\.?`, 'gi'), ' ')
    // "B seçeneği(+ek)" / "C şıkkı(+ek)" → "ilgili seçenek" (kök + Türkçe ek)
    .replace(new RegExp(`(?<![${TL}])[A-Ea-e]\\s+(seçeneğ|şıkk)[${TL}]*`, 'gi'), 'ilgili seçenek')
    // "Seçenek B" / "Şık C" → "ilgili seçenek"
    .replace(new RegExp(`(?<![${TL}])(seçenek|şık)\\s+[A-Ea-e](?![${TL}])`, 'gi'), 'ilgili seçenek')
    // "cevap B" → "doğru cevap" (sonrası Türkçe harf değilse — "cevap doğrudur" eşleşmez)
    .replace(new RegExp(`(?<![${TL}])cevap\\s+[A-Ea-e](?![${TL}])`, 'gi'), 'doğru cevap')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
