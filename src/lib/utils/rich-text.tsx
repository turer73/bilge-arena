import React from 'react'

/**
 * Soru metnindeki <u>...</u> markup'ini GUVENLI sekilde altcizili render eder.
 *
 * dangerouslySetInnerHTML KULLANMAZ: yalniz <u>...</u> tokenleri React <u>
 * elementine donusur; geri kalan her sey React text-node olarak (kacisli) basilir
 * → keyfi icerikte bile XSS yuzeyi yok. (Soru bankasinda "alti cizili sozcuk"
 * tipli sorular icin hedef kelime <u>...</u> ile isaretlenir.)
 *
 * Markup yoksa string'i oldugu gibi dondurur (mevcut sorular ayni render olur).
 */
export function renderRichText(text: string | null | undefined): React.ReactNode {
  if (!text || !text.includes('<u>')) return text ?? ''
  const parts = text.split(/(<u>[\s\S]*?<\/u>)/g)
  return parts.map((part, i) => {
    const m = /^<u>([\s\S]*?)<\/u>$/.exec(part)
    if (m) {
      return (
        <u key={i} className="underline decoration-[var(--focus)] decoration-2 underline-offset-2">
          {m[1]}
        </u>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/**
 * <u>...</u> markup'ini cikarip duz metin dondurur. Metin gereken yerlerde
 * (AI asistan baglami, plain-text export, admin liste) kullanilir — boylece
 * ham <u> etiketi gorunmez/AI'ya gitmez.
 */
export function stripRichText(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/<\/?u>/g, '')
}
