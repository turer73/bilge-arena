#!/usr/bin/env node
// 2 aktif soru "Hiçbiri" çeldiricisi (079-guard yasaklı) — soru çalışıyor, sadece
// 5. şık kural-dışı. Doğru-cevap index'i KORUNUR, yalnız "Hiçbiri" değiştirilir.
import { config } from 'dotenv'; import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url'
config({ path: join(dirname(fileURLToPath(import.meta.url)),'..','.env.local') })
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://lvnmzdowhfzmpkueurih.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY=process.argv.includes('--apply')
// pfx -> "Hiçbiri" yerine gelecek geçerli çeldirici
const REPL={
  'b/0429e707':'Endomitoz',   // fen/biyoloji: hücre bölünme tipi çeldiricisi
  'k/d97ef2a0':'O₂',          // fen/kimya: redoks bağlamında oksijen çeldiricisi
}
console.log(`Mod: ${APPLY?'APPLY':'DRY-RUN'}\n`)
const {data}=await s.from('questions').select('id,content').eq('game','fen')
for(const [key,repl] of Object.entries(REPL)){
  const pfx=key.split('/')[1]
  const r=data.find(x=>x.id.startsWith(pfx))
  if(!r){console.log(pfx,'YOK');continue}
  const c=r.content, opts=[...c.options], hi=opts.findIndex(o=>o.toLowerCase().trim()==='hiçbiri')
  console.log(`${pfx}: answer=${c.answer} ("${opts[c.answer]}") | "Hiçbiri"@${hi} -> "${repl}"`)
  if(hi<0){console.log('  Hiçbiri bulunamadı, atla');continue}
  if(hi===c.answer){console.log('  ⚠️ Hiçbiri DOĞRU-CEVAP, elle bakılmalı, atla');continue}
  opts[hi]=repl
  if(APPLY){
    const {error}=await s.from('questions').update({content:{...c,options:opts}}).eq('id',r.id)
    console.log(error?`  HATA: ${error.message}`:'  ✅ düzeltildi')
  }
}
if(!APPLY)console.log('\n(DRY-RUN — --apply)')
