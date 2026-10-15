export const BILGE_CHARACTERS = [
  { id: 'female', label: 'Kadın Bilge' },
  { id: 'male', label: 'Erkek Bilge' },
] as const

export type BilgeCharacter = (typeof BILGE_CHARACTERS)[number]['id']

export const BILGE_EXPRESSIONS = [
  { id: 'neseli', label: 'Neşeli', message: 'Bir adım daha attın. Devam edelim mi?', context: 'İlerleme fark edildiğinde' },
  { id: 'kutlayan', label: 'Kutlayan', message: 'Bu tur tamam! Emeğini bir anlığına kutlayalım.', context: 'Bir tur tamamlandığında' },
  { id: 'kararli', label: 'Kararlı', message: 'Zor olabilir. Küçük bir adımla başlayalım.', context: 'Zor bir konuya başlarken' },
  { id: 'odaklanmis', label: 'Odaklanmış', message: 'Önce sorunun ne istediğini bulalım.', context: 'Soruyu dikkatle okurken' },
  { id: 'dusunen', label: 'Düşünen', message: 'Cevaba geçmeden bir başka yol deneyelim.', context: 'Farklı bir çözüm yolu ararken' },
  { id: 'merakli', label: 'Meraklı', message: 'Burada hangi ipucu işimize yarar?', context: 'Yeni bir konuyu keşfederken' },
  { id: 'saskin', label: 'Şaşkın', message: 'Yeni bir bağlantı bulduk! Birlikte inceleyelim.', context: 'Yeni bir ilişki keşfedildiğinde' },
  { id: 'utangac', label: 'Utangaç', message: 'Her şeyi ilk seferde bilmek zorunda değilsin.', context: 'İlk tanışma ve yumuşak geçişlerde' },
  { id: 'uzgun', label: 'Üzgün', message: 'İstediğin gibi gitmemiş olabilir. Yeniden deneyebiliriz.', context: 'Öğrenci hayal kırıklığını dile getirdiğinde' },
  { id: 'yorgun', label: 'Yorgun', message: 'Kısa bir mola verebilirsin. Hazır olduğunda devam ederiz.', context: 'Öğrenci yorulduğunu söylediğinde' },
  { id: 'destekleyici', label: 'Destekleyici', message: 'Burada bir ipucu var; birlikte bakalım.', context: 'Bir ipucuna ihtiyaç duyulduğunda' },
  { id: 'hafif-kizgin', label: 'Hafif kızgın', message: 'Bu soru biraz inatçı çıktı. Başka bir yol deneyelim.', context: 'Zor soruya karşı tatlı bir meydan okumada; öğrenciye karşı değil' },
] as const

export type BilgeExpression = (typeof BILGE_EXPRESSIONS)[number]['id']
export const isBilgeCharacter = (value: unknown): value is BilgeCharacter => value === 'female' || value === 'male'
export const bilgeImage = (character: BilgeCharacter, expression: BilgeExpression | 'portrait' = 'portrait') =>
  `/academy/bilge/${character}/${expression}.png`
