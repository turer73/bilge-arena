#!/usr/bin/env node
/**
 * Judge + surer-verify süzgecinden geçen answer-key düzeltmelerini uygular.
 * İdempotent: answer zaten hedef değerdeyse / soru zaten pasifse dokunmaz.
 * Her işlem sonrası geri-okuma (count-verify) yapar.
 *
 * node database/apply-keybug-fixes.mjs          # dry-run (yazmaz)
 * node database/apply-keybug-fixes.mjs --apply  # gerçek yazma
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// surer-verify hükümleri (2026-07-25, judge=deepseek-v4-flash kör-çözüm + insan-verify):
const ANSWER_FIXES = [
  {
    id: '4f9ad35c-b2af-49f4-b0ee-78e50891595f',
    newAnswer: 0,
    newSolution: "'Gülmek' isim-fiildir (fiilimsi) — çekimli fiil sayılmaz; cümledeki tek fiil 'eder'dir. Cevap: 1. (2026-07-25 anahtar-düzeltmesi: eski anahtar fiilimsiyi fiil sayıyordu.)",
    why: 'Okul dilbilgisinde fiilimsi fiil sayilmaz; dogru cevap 1 (index 0). Judge + surer mutabik.',
  },
]
const DEACTIVATE = [
  { id: '63b1e589-dd82-43a1-a422-3502da41c715', why: 'Celiskili soru: "savasi sonlandiran" hicbir sikka uymuyor; "zemin hazirlayan" Yalta, kayitli cevap San Francisco. PR#261 belirsiz-deaktive emsali.' },
  { id: '7715a36d-3f27-4aec-85bf-00b1ff7e598d', why: 'Cift-savunulabilir anlatim-bozuklugu sorusu (bozukluk-yok vs gereksiz-sozcuk); 5-oynanis istatistigi zayif.' },
  { id: '1800b618-fc89-48f8-bb25-99cfef841a0b', why: 'Tirnak-isareti sorusu cift-dogru: A (aktarilan soz) ve E (siir adi tirnagi) ikisi de TDK-dogru; acc %0/9.' },
  { id: '4f9b0869-16ff-4948-b183-1c93bb2489fb', why: 'Yazim sorusunda 4 sik da dogru yazim (yalniz basina, bas basa, yanlislikla, altust).' },
  { id: '46a915d2-eca2-4fe0-ba3d-7644d58c1230', why: 'Buyuk unlu uyumu: 3 sik uymuyor (kitaplik, kalemlik, insan) - coklu dogru.' },
  { id: 'd403942b-e72a-45d7-95d1-01358251265f', why: 'Yapim eki: MEB yaklasiminda okumak (isim-fiil eki) de yapim eki - cift dogru (calis-kan + oku-mak).' },
  { id: '2db691cd-4743-4732-9a9a-4db687f3ccfa', why: 'Ozne-yuklem: "Annesi ve babasi geldi" Turkcede dogru kullanim; hicbir sikta zorunlu uyumsuzluk yok (acc %0/6).' },
  { id: 'f6281911-f63a-47d6-94ec-9e2047acae6d', why: 'Periyodik-tablo: X grubunu sabitleyen bilgi eksik - BES sik da verilen kosullari sagliyor.' },
  { id: 'd52adf9c-d0c3-4088-b8cf-20da815ef20f', why: 'Kesmek-anlam: cift-savunulabilir (aralarini kesmek vs bulutlar gunesi kesti); acc %0/5.' },
  { id: 'a8310fda-f0cf-4b27-9505-d5d1c95d0585', why: 'Kalabalik-nicel: birden cok sikta nicel kullanim var; acc %0/5.' },
  { id: '45bb60c9-2564-43ac-8fd7-d400b3096355', why: 'Kesme-isareti: TDK Van Golu\'ne emsaline gore Istanbul Bogazi\'nda DOGRU - yanlis sik yok; solution gerekce de hatali; acc %0/5.' },
]

for (const f of ANSWER_FIXES) {
  const { data: row, error } = await s.from('questions').select('id,content,is_active').eq('id', f.id).single()
  if (error) { console.error(f.id, 'FETCH HATA:', error.message); continue }
  const cur = row.content?.answer
  if (cur === f.newAnswer) { console.log(f.id, 'zaten', f.newAnswer, '- atlandi'); continue }
  console.log(`${f.id}: answer ${cur} -> ${f.newAnswer}${APPLY ? '' : ' (dry-run)'}  // ${f.why}`)
  if (APPLY) {
    const newContent = { ...row.content, answer: f.newAnswer, solution: f.newSolution }
    const { error: e2 } = await s.from('questions').update({ content: newContent }).eq('id', f.id)
    if (e2) { console.error(f.id, 'UPDATE HATA:', e2.message); continue }
    const { data: check } = await s.from('questions').select('content').eq('id', f.id).single()
    console.log(`  verify: answer=${check.content.answer} ${check.content.answer === f.newAnswer ? 'OK' : 'FAIL!'}`)
  }
}

for (const d of DEACTIVATE) {
  const { data: row, error } = await s.from('questions').select('id,is_active').eq('id', d.id).single()
  if (error) { console.error(d.id, 'FETCH HATA:', error.message); continue }
  if (!row.is_active) { console.log(d.id, 'zaten pasif - atlandi'); continue }
  console.log(`${d.id}: DEAKTIVE${APPLY ? '' : ' (dry-run)'}  // ${d.why}`)
  if (APPLY) {
    const { error: e2 } = await s.from('questions').update({ is_active: false }).eq('id', d.id)
    if (e2) { console.error(d.id, 'UPDATE HATA:', e2.message); continue }
    const { data: check } = await s.from('questions').select('is_active').eq('id', d.id).single()
    console.log(`  verify: is_active=${check.is_active} ${check.is_active === false ? 'OK' : 'FAIL!'}`)
  }
}
console.log(APPLY ? 'UYGULANDI' : 'DRY-RUN bitti (--apply ile yaz)')
