#!/usr/bin/env node
/**
 * @deprecated 2026-08-22
 *
 * Bu arac dogrudan public.questions INSERT ediyordu. Canli sistemde 106
 * numarali migration'in yonetisim kapisi etkindir ve dogrudan insert bilerek
 * yasaktir. Eski `--judge` secenegi de emekliye ayrilan paralel tek-model
 * yargiciyi calistiriyordu.
 *
 * Yeni sorular su iki yetkili yoldan biriyle taslak olarak olusturulmalidir:
 *   - Admin Soru Uretici / manuel editor API'si
 *   - create_governed_question RPC'sini kullanan, actor + kazanim + kaynak
 *     lisansi/provenansi acik bir yonetimli importer
 *
 * Bu fail-closed kopru eski otomasyonlarin sessizce ikinci bir kalite hatti
 * acmasini veya yonetisimi bypass etmeye calismasini engeller.
 */
console.error(
  '[DEPRECATED] Doğrudan JSON importu kapatıldı; yönetimli taslak oluşturma akışını kullanın. Hiçbir veri yazılmadı.',
)
process.exitCode = 2
