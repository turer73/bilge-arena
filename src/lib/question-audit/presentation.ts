/** Yönetim ekranlarında teknik bulguları insan incelemesi diliyle gösterir. */
const FINDING_LABELS: Record<string, string> = {
  WRONG_KEY_SUSPECTED: 'Cevap anahtarı uyuşmazlığı şüphesi',
  NO_CORRECT_OPTION: 'Doğru seçenek bulunamadı şüphesi',
  MULTIPLE_CORRECT: 'Birden fazla doğru seçenek olasılığı',
  MISSING_PREMISE: 'Eksik öncül veya koşul',
  AMBIGUOUS_WORDING: 'Birden fazla yorumlanabilen ifade',
  STEM_MISSING_TOKEN: 'Soru kökünde eksik sözcük',
  SOLUTION_CONTRADICTS_ANSWER: 'Çözüm ve cevap uyuşmuyor',
  INCOMPLETE_SOLUTION: 'Çözüm açıklaması eksik olabilir',
  LOGICAL_FALLACY: 'Mantık tutarsızlığı olasılığı',
}

const VERDICT_LABELS: Record<string, string> = {
  NEEDS_REVIEW: 'İnsan incelemesi gerekiyor',
  REJECTED: 'Yayın engeli',
  INCONCLUSIVE: 'Kontrol tamamlanamadı',
  APPROVED: 'Otomatik kontrol geçti',
}

export function findingLabel(code: string): string {
  return FINDING_LABELS[code] ?? 'Tanımlanmamış bulgu'
}

export function verdictLabel(code: string): string {
  return VERDICT_LABELS[code] ?? 'Bilinmeyen doğrulama sonucu'
}
