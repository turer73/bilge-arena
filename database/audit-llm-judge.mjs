#!/usr/bin/env node
/**
 * @deprecated 2026-08-22
 *
 * Bu tek-model yargici kalibre edilmis soru kalite hatti ile ayni karar
 * sozlesmesini, replay metadata'sini, insan-altin terfi kapisini veya
 * question_validation_decisions otoritesini kullanmiyordu. Paralel kalite
 * karari uretilmesini onlemek icin fail-closed emekliye ayrildi.
 *
 * Yetkili yol:
 *   npm run audit:calibrate -- [secenekler]
 *   npm run audit:benchmark -- --labels <gold.json> --report <run.json>
 *
 * Bu dosya bilerek hicbir API cagrisi ve hicbir veri yazimi yapmaz.
 */
console.error(
  '[DEPRECATED] audit-llm-judge kullanımdan kaldırıldı; tek yetkili hat için audit:calibrate + audit:benchmark kullanın.',
)
process.exitCode = 2
