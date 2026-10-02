/**
 * Tartisma prompt'lari.
 *
 * PROMPT_VERSION HER DEGISIKLIKTE ARTAR. Onsuz bir kosunun sonucundaki
 * degisimin konudan mi prompt'tan mi geldigi asla bilinemez — kayitli kosular
 * karsilastirilamaz hale gelir.
 */

import type { ConversationalProvider } from './transport'
import type { CouncilTopic, ParticipantId } from './types'

export const PROMPT_VERSION = {
  councilTurn: 'council-turn@1',
} as const

export interface ParticipantBrief {
  id: ParticipantId
  displayName: string
  role: string
}

/**
 * ALAN SIRASI ZORUNLU maddesi kozmetik degil:
 * OpenAI-uyumlu `json_object` ve Anthropic'in prompt-tabanli JSON'u alan
 * URETIM SIRASINI sabitlemez. `stance` once uretilirse `reasoning` o karari
 * savunan bir sonradan-yazim olur — yani gerekce karari degil, karar gerekceyi
 * belirler. Bu SESSIZCE olur: cikti gecerli, sema yesil, muhakeme tersine
 * donmus. Tek savunma bu talimat.
 */
export function buildCouncilSystemPrompt(
  self: ParticipantBrief,
  others: readonly ParticipantBrief[],
  topic: CouncilTopic,
): string {
  const roster = others.map((p) => `- ${p.displayName} (rol: ${p.role})`).join('\n')

  return `Sen bir MODEL KURULUNUN uyesisin. Kuruldaki her uye farkli bir yapay zeka modelidir ve hepiniz ayni tutanaga yazarak tek bir isi birlikte tamamliyorsunuz.

SENIN KIMLIGIN
Ad: ${self.displayName}
Rol: ${self.role}

DIGER UYELER
${roster || '(su an tek uyesin)'}

ISIN
Baslik: ${topic.title}
${topic.brief}
${topic.successCriteria.length > 0 ? `\nTAMAMLANMA OLCUTLERI\n${topic.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

NASIL KATILIRSIN
1. Sirasi sana geldiginde tutanagi bastan okursun ve KENDI turunu yazarsin.
2. Bir uyenin sozune itiraz ediyorsan veya onu gelistiriyorsan, o mesajin
   kimligini "respondsTo" alanina yaz (ornek: "r1-codex"). Atifsiz itiraz
   kuruldaki kimseye ulasmaz.
3. Katilmiyorsan KATILMA. Nezaket icin onay verme; yanlis bir onerinin
   uzerinde uzlasmak, uzlasamamaktan daha pahalidir.
4. Bir onceki turunda soyledigini degistirebilirsin — ikna oldugunu yazman
   kurulun ilerlemesidir, tutarsizlik degildir.
5. Isin bu haliyle tamamlandigina inaniyorsan "agree" ver. Yon dogru ama
   eksik varsa "refine" ver ve NEYIN degismesi gerektigini yaz.

DURUS DEGERLERI
- "propose"  : yeni bir oneri koyuyorsun
- "agree"    : oneri bu haliyle tamam, is bitti
- "refine"   : yon dogru, su degisiklik gerekli (is BITMEDI)
- "disagree" : oneriyi reddediyorsun
- "abstain"  : konu senin alanin disinda

CIKTI BICIMI
Yalnizca tek bir JSON nesnesi dondur. Markdown kod bloklari, aciklama metni,
selamlama YOK.

ALAN SIRASI ZORUNLU — asagidaki sirayla uret:
{
  "reasoning": "once dusun: tutanakta ne var, neyi degistiriyorsun, neden",
  "stance": "propose | agree | refine | disagree | abstain",
  "position": "gerekcen degil, NET pozisyonun. Tek basina okunabilir olsun.",
  "respondsTo": ["yanit verdigin mesaj kimlikleri"],
  "openQuestions": ["cozulmeden is tamamlanamaz dedigin sorular"],
  "blocking": false
}

"blocking" yalnizca "bu haliyle devam edilemez" dedigin durumda true olsun;
kucuk itirazlar icin degil.`
}

/** Bir turun kullanici mesaji: tutanak + sira bildirimi. */
export function buildCouncilTurnPrompt(args: {
  round: number
  maxRounds: number
  renderedTranscript: string
  topicContext: string | null
}): string {
  const parts: string[] = []

  if (args.topicContext) {
    parts.push(`BAGLAM (degistirilmeden verildi)\n${args.topicContext}`)
  }

  parts.push(`TUTANAK\n${args.renderedTranscript}`)

  const isLast = args.round >= args.maxRounds
  parts.push(
    `SIRA SENDE — tur ${args.round}/${args.maxRounds}.` +
      (isLast
        ? ' BU SON TUR: pozisyonunu kapat. Hala "refine" diyorsan neyin eksik kaldigini "openQuestions" alanina yaz.'
        : ''),
  )

  return parts.join('\n\n')
}

/**
 * JSON modu OLMAYAN saglayicilar icin (Anthropic) sistem prompt'una eklenen
 * pekistirme. Yetenek farki `capabilities.jsonMode` ile GORUNUR; burada da
 * telafi ediliyor. Tek garanti yine Zod (schemas.ts).
 */
export const JSON_ONLY_REMINDER =
  '\n\nUYARI: Yanitin TAMAMI tek bir JSON nesnesi olmalidir. Ilk karakter "{", son karakter "}" olsun. Kod bloku isareti (```) kullanma.'

/** Kayitli kosunun hangi kurulla uretildigini damgalar. */
export function participantIdentity(p: {
  id: ParticipantId
  role: string
  provider: ConversationalProvider
}) {
  return { id: p.id, role: p.role, providerId: p.provider.id, modelId: p.provider.modelId }
}
