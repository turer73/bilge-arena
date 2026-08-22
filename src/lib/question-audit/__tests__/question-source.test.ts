import { describe, expect, it } from 'vitest'
import { contentHash, expectedOptionCount, partitionRows, toDraft, type QuestionRow } from '../question-source'

function row(content: Record<string, unknown>, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: 'q1',
    game: 'matematik',
    category: 'turev',
    exam_ref: 'TYT',
    content,
    ...overrides,
  }
}

const validContent = {
  question: "f(x)=x^2 icin f'(3)?",
  options: ['3', '5', '6', '9', '12'],
  answer: 2,
  solution: "f'(x)=2x, f'(3)=6.",
}

describe('gecerli satir', () => {
  it('draft e cevrilir ve alanlar dogru esler', () => {
    const r = toDraft(row(validContent, { topic: 'Turev kurallari', published_revision_id: 'rev-9' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft).toMatchObject({
      questionId: 'q1',
      revisionId: 'rev-9',
      examRef: 'TYT',
      subject: 'turev',
      topic: 'Turev kurallari',
      markedAnswerIndex: 2,
      passage: null,
    })
    expect(r.draft.options).toHaveLength(5)
    expect(r.draft.solutionText).toContain("f'(3)=6")
    expect(r.draft.contentSha256).toHaveLength(64)
  })

  it('governance kapaliyken revisionId questionId ye duser', () => {
    const r = toDraft(row(validContent))
    expect(r.ok && r.draft.revisionId).toBe('q1')
  })

  it('wordquest sentence alanini soru kokü olarak kullanir', () => {
    const r = toDraft(
      row({ sentence: 'By the time we ___', options: ['a', 'b', 'c', 'd', 'e'], answer: 0 }, { game: 'wordquest', exam_ref: null }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.questionText).toBe('By the time we ___')
    expect(r.draft.examRef).toBe('YKS')
  })

  it('bos cozum null olur (ajan atlanacak, soru ceza almayacak)', () => {
    const r = toDraft(row({ ...validContent, solution: '   ' }))
    expect(r.ok && r.draft.solutionText).toBeNull()
  })
})

describe('deterministik kapi — LLM den ONCE eler', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['bos soru metni', { ...validContent, question: '  ' }, 'question_text_missing'],
    ['options dizi degil', { ...validContent, options: 'abc' }, 'options_not_array'],
    ['bos sik', { ...validContent, options: ['3', '', '6', '9', '12'] }, 'option_empty'],
    ['birebir ayni sik', { ...validContent, options: ['3', '6', '6', '9', '12'] }, 'option_duplicate'],
    ['esdeger kesir', { ...validContent, options: ['1/4', '1/5', '3/20', '4/20', '1/20'] }, 'option_value_equivalent'],
    ['rasyonellestirilmis kok', { ...validContent, options: ['21/(2√5)', '21√5/10', '9√5/4', '21/√5', '9/√5'] }, 'option_value_equivalent'],
    ['esdeger kesir', { ...validContent, options: ['1/4', '1/5', '3/20', '4/20', '1/20'] }, 'option_value_equivalent'],
    ['rasyonellestirilmis kok', { ...validContent, options: ['21/(2√5)', '21√5/10', '9√5/4', '21/√5', '9/√5'] }, 'option_value_equivalent'],
    ['answer tam sayi degil', { ...validContent, answer: '2' }, 'answer_not_integer'],
    ['answer aralik disi', { ...validContent, answer: 7 }, 'answer_out_of_range'],
    ['answer negatif', { ...validContent, answer: -1 }, 'answer_out_of_range'],
  ]

  for (const [label, content, reason] of cases) {
    it(`${label} -> ${reason}`, () => {
      const r = toDraft(row(content))
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.reason).toBe(reason)
    })
  }

  it('content yoksa reddedilir', () => {
    const r = toDraft({ id: 'q1', game: 'matematik', category: 'x', content: null })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('content_missing')
  })
})

/**
 * Bu blok kapinin YANLIS-POZITIF uretmedigini kilitler. Esdeger-deger kontrolu
 * reddettigi soruyu denetim disi birakir; asiri hevesli bir sayisallastirici
 * saglam sorulari olcumden dusururdu. Ilk canli taramada tam bu oldu:
 * "1914-1918" tire eksi sanilip -4, "2-8-8-1" elektron dizilimi -15,
 * "(-3,-7)" koordinat ikilisi bozularak sahte esitlik uretti.
 */
describe('esdeger-deger kontrolu supheli bicimlere DOKUNMAZ', () => {
  const safe: Array<[string, string[]]> = [
    ['tarih araliklari', ['1912-1916', '1914-1918', '1918-1922', '1923-1927', '1930-1934']],
    ['elektron dizilimleri', ['2-8-8-1', '2-8-9', '2-8-7-2', '2-8-8-2', '2-8-6-3']],
    ['koordinat ikilileri', ['(-3,-7)', '(3,7)', '(-7,-3)', '(7,3)', '(0,0)']],
    ['binlik ayracli sayilar', ['100', '1.000', '10.000', '100.000', '1.000.000']],
    ['birimli degerler', ['5 mol', '10 mol', '15 mol', '20 mol', '25 mol']],
  ]
  for (const [label, options] of safe) {
    it(`${label} -> gecer`, () => {
      expect(toDraft(row({ ...validContent, options })).ok).toBe(true)
    })
  }
})

/**
 * Bu blok kapinin YANLIS-POZITIF uretmedigini kilitler. Esdeger-deger kontrolu
 * reddettigi soruyu denetim disi birakir; asiri hevesli bir sayisallastirici
 * saglam sorulari olcumden dusururdu. Ilk canli taramada tam bu oldu: tarih
 * araliklarinda tire eksi sanildi ("1914-1918" -> -4), elektron dizilimleri
 * ("2-8-8-1" -> -15) ve koordinat ikilileri ("(-3,-7)") sahte esitlik uretti.
 */
describe('esdeger-deger kontrolu supheli bicimlere DOKUNMAZ', () => {
  const safe: Array<[string, string[]]> = [
    ['tarih araliklari', ['1912-1916', '1914-1918', '1918-1922', '1923-1927', '1930-1934']],
    ['elektron dizilimleri', ['2-8-8-1', '2-8-9', '2-8-7-2', '2-8-8-2', '2-8-6-3']],
    ['koordinat ikilileri', ['(-3,-7)', '(3,7)', '(-7,-3)', '(7,3)', '(0,0)']],
    ['binlik ayracli sayilar', ['100', '1.000', '10.000', '100.000', '1.000.000']],
    ['birimli degerler', ['5 mol', '10 mol', '15 mol', '20 mol', '25 mol']],
  ]
  for (const [label, options] of safe) {
    it(`${label} -> gecer`, () => {
      expect(toDraft(row({ ...validContent, options })).ok).toBe(true)
    })
  }
})

describe('sinav-sik uyumu', () => {
  it('canli DB de gorulen tum exam_ref degerlerini tanir', () => {
    expect(expectedOptionCount('LGS')).toBe(4)
    expect(expectedOptionCount('TYT')).toBe(5)
    expect(expectedOptionCount('AYT')).toBe(5)
    // Canli DB'de AYT-SAY / AYT-EA / AYT-SOZ varyantlari var
    expect(expectedOptionCount('AYT-SAY')).toBe(5)
    expect(expectedOptionCount('AYT-EA')).toBe(5)
    expect(expectedOptionCount('AYT-SOZ')).toBe(5)
    expect(expectedOptionCount(null)).toBeNull()
    expect(expectedOptionCount('BILINMEYEN')).toBeNull()
  })

  it('LGS de 4 sikli soru uyarisiz gecer', () => {
    const r = toDraft(row({ question: 's', options: ['2', '4', '6', '8'], answer: 1 }, { exam_ref: 'LGS' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warnings).toEqual([])
  })

  /**
   * Canli DB'de exam_ref='LGS' etiketli 105 soru 5 sikli. Bunlari REDDETMEK
   * bankanin ~%10'unu olcum disi birakirdi; kusur icerikte degil etikette.
   */
  it('LGS de 5 sikli soru DENETIME GIRER, yalniz uyari alir', () => {
    const r = toDraft(row(validContent, { exam_ref: 'LGS' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warnings.map((w) => w.code)).toEqual(['option_count_exam_mismatch'])
    expect(r.warnings[0].detail).toContain('5 sik')
  })

  it('yayin adayi LGS sorusunda 5 sik hard fail olur', () => {
    const r = toDraft(row(validContent, { exam_ref: 'LGS' }), { strictExamOptionCount: true })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('option_count_exam_mismatch')
  })

  it('exam_ref bilinmiyorsa uyari da uretilmez (uydurma varsayim yok)', () => {
    const four = toDraft(row({ question: 's', options: ['a', 'b', 'c', 'd'], answer: 0 }, { exam_ref: null }))
    const five = toDraft(row(validContent, { exam_ref: null }))
    expect(four.ok && four.warnings).toEqual([])
    expect(five.ok && five.warnings).toEqual([])
  })
})

describe('contentHash', () => {
  it('governance tarafindan verilen kanonik hash yeniden hesaplanmaz', () => {
    const dbHash = 'f'.repeat(64)
    const r = toDraft(row(validContent, { content_sha256: dbHash }))
    expect(r.ok && r.draft.contentSha256).toBe(dbHash)
  })
  it('anahtar sirasindan BAGIMSIZ — ayni icerik ayni hash', () => {
    const a = { question: 's', options: ['1', '2'], answer: 0 }
    const b = { answer: 0, options: ['1', '2'], question: 's' }
    expect(contentHash(a)).toBe(contentHash(b))
  })

  it('icerik degisince hash degisir', () => {
    expect(contentHash({ q: 'a' })).not.toBe(contentHash({ q: 'b' }))
  })

  it('ic ice nesnelerde de sira bagimsiz', () => {
    expect(contentHash({ x: { a: 1, b: 2 } })).toBe(contentHash({ x: { b: 2, a: 1 } }))
  })
})

describe('partitionRows', () => {
  it('gecerli ve reddedilenleri ayirir, gerekce sayar', () => {
    const rows = [
      row(validContent, { id: 'ok1' }),
      row({ ...validContent, answer: 9 }, { id: 'bad1' }),
      row({ ...validContent, answer: 9 }, { id: 'bad2' }),
      row(validContent, { id: 'ok2' }),
    ]
    const p = partitionRows(rows)
    expect(p.drafts.map((d) => d.questionId)).toEqual(['ok1', 'ok2'])
    expect(p.rejected).toHaveLength(2)
    expect(p.byReason.answer_out_of_range).toBe(2)
  })

  it('metadata uyarisi olan soru drafts icinde KALIR ve ayrica sayilir', () => {
    const p = partitionRows([
      row(validContent, { id: 'ok1' }),
      row(validContent, { id: 'lgs5', exam_ref: 'LGS' }),
    ])
    expect(p.drafts.map((d) => d.questionId)).toEqual(['ok1', 'lgs5'])
    expect(p.rejected).toHaveLength(0)
    expect(p.byWarning.option_count_exam_mismatch).toBe(1)
    expect(p.warned[0].questionId).toBe('lgs5')
  })
})
