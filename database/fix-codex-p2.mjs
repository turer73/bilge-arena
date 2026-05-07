#!/usr/bin/env node
/**
 * Codex P2 Fix — PR #125 + #127 inline review bulgulari
 * --------------------------------------------------------------
 * 5 soruyu DB'de UPDATE et, JSON dosyalariyla senkronize tut.
 * Sorular zaten is_active=false durumunda; aktivasyondan once duzeltme.
 *
 * Kullanim: node database/fix-codex-p2.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, 'utf-8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Fix listesi: question prefix + yeni content
const fixes = [
  {
    label: 'PR #125: Misak-i Milli multi-correct fix',
    matchPrefix: 'misak-i milli ile ilgili asagidaki ifadelerden',
    newContent: {
      question: "Misak-i Milli ile ilgili asagidaki ifadelerden hangisi yanlistir?",
      options: [
        "Son Osmanli Mebusan Meclisi'nde kabul edilmistir",
        "Erzurum ve Sivas Kongresi kararlari temelinde olusturulmustur",
        "Vatanin sinirlarini cizen siyasi bir karardir",
        "Lozan Antlasmasi'nin temelini olusturmustur",
        "Yeni TBMM tarafindan reddedilmistir"
      ],
      answer: 4,
      solution: "Misak-i Milli 28 Ocak 1920'de Son Osmanli Mebusan Meclisi'nde kabul edildi ve TBMM tarafindan benimsendi; reddedilmedi. Lozan Antlasmasi'nin temelini olusturdu.",
      topic: "Misak-i Milli"
    }
  },
  {
    label: 'PR #125: Tanzimat ilk anayasal belge fix',
    matchPrefix: "tanzimat fermani'nin (1839) en temel ozelligi",
    newContent: {
      question: "Tanzimat Fermani'nin (1839) en temel ozelligi asagidakilerden hangisidir?",
      options: [
        "Tum tebaaya can, mal ve namus guvencesi taninarak hukuk onunde esitlik ilkesinin kabulu",
        "Cumhuriyetin ilan edilmesi",
        "Dogu Anadolu'ya ozel statu tanimasi",
        "Mutlak monarsiyi guclendirmesi",
        "Saltanati lagvetmesi"
      ],
      answer: 0,
      solution: "Tanzimat Fermani 1839'da Sultan Abdulmecid tarafindan yayimlanmis; tum Osmanli tebaasina (Musluman-gayrimuslim) can, mal ve namus guvencesi tanimis ve hukuk onunde esitlik ilkesini benimsemistir. Padisah yetkisini sinirlandiran ilk belge ise 1808 Sened-i Ittifak kabul edilir.",
      topic: "Tanzimat"
    }
  },
  {
    label: 'PR #125: 1924 Anayasasi hatali cevap fix',
    matchPrefix: 'cumhuriyet doneminde 1924 anayasasi ile gerceklestirilen',
    newContent: {
      question: "1924 Anayasasi'nin getirdigi temel duzenlemelerden biri asagidakilerden hangisidir?",
      options: [
        "Egemenligin kayitsiz sartsiz millete ait oldugu ilkesinin yeniden teyit edilmesi",
        "Saltanat'in kaldirilmasi",
        "Halifelik'in kaldirilmasi",
        "Cok partili sistemin guvence altina alinmasi",
        "Soyadi Kanunu'nun cikarilmasi"
      ],
      answer: 0,
      solution: "20 Nisan 1924'te kabul edilen 1924 Anayasasi, egemenligin kayitsiz sartsiz millete ait oldugu ilkesini ve TBMM'nin yasama-yurutme uzerindeki ustunlugunu pekistirmistir. Saltanat 1922'de TBMM kararıyla, halifelik 3 Mart 1924'te ayri bir kanunla kaldirildi (anayasa oncesi); soyadi 1934, cok partili sistem fiilen 1946 sonrasidir.",
      topic: "Cumhuriyet inkilaplari"
    }
  },
  {
    label: 'PR #127: Paragraf multi-correct fix',
    matchPrefix: 'kis aylarinda insanlar daha sik hasta olur',
    newContent: {
      question: "Kis aylarinda insanlar daha sik hasta olur. Soguk hava bagisiklik sistemini zayiflatir, viruslerin yayilmasini kolaylastirir. Bu yuzden kis aylarinda saglikli beslenmek, vitamin almak ve hijyen kurallarina dikkat etmek onemlidir.\n\nBu parcaya gore kis aylarinda hastaliktan korunmak icin parcada onerilen davranislardan biri asagidakilerden hangisidir?",
      options: [
        "Bagisiklik sistemini gucsuz tutmak",
        "Sicak iklimlere yolculuk yapmak",
        "Hijyen kurallarina dikkat etmek",
        "Spor yapmamak",
        "Sicak su icmek"
      ],
      answer: 2,
      solution: "Parca acikca uc oneri sunar: saglikli beslenmek, vitamin almak ve hijyen kurallarina dikkat etmek. C secenegi (hijyen kurallarina dikkat etmek) parcada birebir onerilen davranistir. Diger secenekler parcada yer almaz veya tersini ifade eder.",
      topic: "Detay anlam cikarma"
    }
  },
  {
    label: 'PR #127: Sosyoloji garbled stem fix',
    matchPrefix: 'bir kisi belirli bir donmeyi',
    newContent: {
      question: "Bireyin icinde yasadigi toplumun bilgi, deger, norm ve davranis kaliplarini aile, okul, medya gibi sosyal kontrol araclari yoluyla ogrenip benimsemesi surecini en iyi aciklayan kavram asagidakilerden hangisidir?",
      options: [
        "Asimile olma",
        "Sosyalizasyon",
        "Modernlesme",
        "Endustrilesme",
        "Marjinallesme"
      ],
      answer: 1,
      solution: "Sosyalizasyon (toplumsallasma) bireyin icinde bulundugu cevrenin (aile, okul, medya gibi) bilgi, deger, norm, davranis ve rolleri ogrenip icsellestirme surecidir. Asimile olma ise farkli bir kulture donusum, cogunluk kulturune erime anlami tasir.",
      topic: "Sosyalizasyon"
    }
  }
]

// Mevcut sorulari cek
const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, content')
    .eq('source', 'ai_claude_v4')
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`Toplam ai_claude_v4: ${all.length}\n`)

// Each fix icin match + update
for (const fix of fixes) {
  const matches = all.filter(r => {
    const q = (r.content?.question || '').toLowerCase()
    return q.startsWith(fix.matchPrefix.toLowerCase())
  })
  console.log(`[${fix.label}] match: ${matches.length}`)
  if (matches.length === 0) {
    console.log('  NOT FOUND, skipping')
    continue
  }
  if (matches.length > 1) {
    console.log('  MULTIPLE MATCH, skipping (manual review needed)')
    for (const m of matches) console.log('   -', m.id, m.content.question.slice(0, 80))
    continue
  }
  const target = matches[0]
  // Eski content'i koruyup sadece field'lari override et (level_tag, vs.)
  const newContent = { ...target.content, ...fix.newContent }
  const { error } = await supabase.from('questions').update({ content: newContent }).eq('id', target.id)
  if (error) {
    console.log('  UPDATE FAIL:', error.message)
  } else {
    console.log(`  UPDATED id=${target.id}`)
  }
}

console.log('\nFix tamamlandi.')
