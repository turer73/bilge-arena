import { describe, expect, it } from 'vitest'
import { deriveVerdict } from '../verdict'
import type {
  AdversarialPayload,
  AgentOutcome,
  AgentTelemetry,
  AuditRun,
  BlindSolverPayload,
  SolutionVerifierPayload,
} from '../types'

const telemetry: AgentTelemetry = {
  providerId: 'test-provider',
  modelId: 'test-model',
  promptVersion: 'test@1',
  latencyMs: 10,
  inputTokens: null,
  outputTokens: null,
  finishReason: 'STOP',
}

function ok<T>(data: T): AgentOutcome<T> {
  return { status: 'ok', data, telemetry, raw: '{}' }
}
function failed<T>(kind: 'transport' | 'schema' | 'truncated' | 'blocked' | 'timeout' = 'transport'): AgentOutcome<T> {
  return { status: 'failed', error: { kind, message: 'boom', retryable: true }, telemetry, raw: null }
}
function skipped<T>(reason = 'cozum metni yok'): AgentOutcome<T> {
  return { status: 'skipped', reason }
}

const blind = (index: number | null, computedValue: string | null = null): AgentOutcome<BlindSolverPayload> =>
  ok({ reasoning: 'r', predictedAnswerIndex: index, computedValue })

const clean: AgentOutcome<AdversarialPayload> = ok({ reasoning: 'r', findings: [] })

const verifierOk = (index: number | null, completeness: 'adequate' | 'terse' = 'adequate') =>
  ok<SolutionVerifierPayload>({ reasoning: 'r', solutionConcludesIndex: index, solutionCompleteness: completeness })

function run(overrides: Partial<AuditRun> = {}): AuditRun {
  const inputSnapshot = {
    questionId: 'q1', revisionId: 'r1', contentSha256: 'a'.repeat(64), examRef: 'TYT',
    subject: 'matematik', topic: null, questionText: '2+2?', passage: null,
    options: ['1', '2', '4', '5', '6'], markedAnswerIndex: 2, solutionText: '4',
  }
  return {
    questionId: 'q1',
    revisionId: 'r1',
    contentSha256: 'a'.repeat(64),
    optionCount: 5,
    markedAnswerIndex: 2,
    inputSnapshot,
    execution: {
      policyVersion: 'question-quality@1', generationConfigSha256: 'b'.repeat(64), generationConfig: {},
      providerIds: { blind: 'test-provider', adversarial: 'test-provider', verifier: 'test-provider' },
      modelIds: { blind: 'test-model', adversarial: 'test-model', verifier: 'test-model' },
      promptVersions: { blind: 'test@1', adversarial: 'test@1', verifier: 'test@1' },
    },
    blind: [blind(2), blind(2), blind(2)],
    adversarial: clean,
    verifier: verifierOk(2),
    executedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('mutlu yol', () => {
  it('uc kanit olumluysa APPROVED', () => {
    const r = deriveVerdict(run())
    expect(r.verdict).toBe('APPROVED')
    expect(r.findings).toEqual([])
    expect(r.blindConsensusIndex).toBe(2)
    expect(r.blindAgreementRatio).toBe(1)
  })
})

/**
 * ANA REGRESYON KILIDI.
 * Onceki taslakta her ajanin catch blogu uydurma bir icerik kusuru donduruyor
 * ve kusursuz soru REJECTED oluyordu. Olculen provider hata orani %54 — yani
 * bu, nadir bir kenar durum degil ana yoldu.
 */
describe('ariza != kusur', () => {
  it('kor cozucu tamamen arizaliysa INCONCLUSIVE (REJECTED degil)', () => {
    const r = deriveVerdict(run({ blind: [failed(), failed(), failed()] }))
    expect(r.verdict).toBe('INCONCLUSIVE')
    expect(r.findings).toEqual([])
  })

  it('adversarial arizaliysa INCONCLUSIVE', () => {
    expect(deriveVerdict(run({ adversarial: failed() })).verdict).toBe('INCONCLUSIVE')
  })

  it('cozum denetcisi arizaliysa INCONCLUSIVE', () => {
    expect(deriveVerdict(run({ verifier: failed('timeout') })).verdict).toBe('INCONCLUSIVE')
  })

  it('ariza hicbir zaman uydurma finding uretmez', () => {
    const r = deriveVerdict(run({ blind: [failed()], adversarial: failed(), verifier: failed() }))
    expect(r.findings).toEqual([])
    expect(r.verdict).toBe('INCONCLUSIVE')
  })

  it('kismi ariza: gecerli ornekler yine de degerlendirilir', () => {
    const r = deriveVerdict(run({ blind: [failed(), blind(2), blind(2)] }))
    expect(r.blindConsensusIndex).toBe(2)
    expect(r.verdict).toBe('APPROVED')
  })
})

describe('oncelik sirasi', () => {
  it('blocking kanit varken baska ajanin arizasi REJECTED\'i bozmaz', () => {
    const r = deriveVerdict(
      run({ blind: [blind(4), blind(4), blind(4)], verifier: verifierOk(4), adversarial: failed() }),
    )
    expect(r.verdict).toBe('REJECTED')
    expect(r.findings.map((f) => f.code)).toContain('WRONG_KEY_SUSPECTED')
  })

  it('INCONCLUSIVE, NEEDS_REVIEW\'un onunde (once yeniden kos, sonra insana goturt)', () => {
    const advisoryOnly: AgentOutcome<AdversarialPayload> = ok({
      reasoning: 'r',
      findings: [{ code: 'AMBIGUOUS_WORDING', evidence: 'e' }],
    })
    expect(deriveVerdict(run({ adversarial: advisoryOnly })).verdict).toBe('NEEDS_REVIEW')
    expect(deriveVerdict(run({ adversarial: advisoryOnly, verifier: failed() })).verdict).toBe('INCONCLUSIVE')
  })
})

/**
 * DOGRULAMA KURALI — 4434 soruluk tam banka kosusunda olculdu:
 *   kor cozucu + cozum denetcisi birlikte -> 6/6 dogru
 *   yalniz kor cozucu -> 10 ornekte 5 kesin yanlis pozitif
 * Tek tanik yeterli degil; sorunun KENDI cozum metni ikinci taniktir.
 */
describe('dogrulama kurali (corroboration)', () => {
  it('DESTEKSIZ WRONG_KEY_SUSPECTED reddetmez, NEEDS_REVIEW verir', () => {
    // Cozum denetcisi isaretli cevabi destekliyor (celiski YOK)
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(4)], verifier: verifierOk(2) }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toContain('WRONG_KEY_SUSPECTED')
  })

  it('cozum denetcisi DOGRULARSA REJECTED olur', () => {
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(4)], verifier: verifierOk(4) }))
    expect(r.verdict).toBe('REJECTED')
    expect(r.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['WRONG_KEY_SUSPECTED', 'SOLUTION_CONTRADICTS_ANSWER']),
    )
  })

  it('cozum metni yoksa (denetci atlandi) tek tanikla reddetmez', () => {
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(4)], verifier: skipped() }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
  })

  it('iki ajan farkli alternatif siklara varirsa reddetmez', () => {
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(4)], verifier: verifierOk(1) }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
  })

  /**
   * Tam banka kosusu: computedValue ILE 3 bulgu -> 3/3 dogru;
   * computedValue OLMADAN 10 bulgu -> incelenen 3'u yanlis pozitif.
   * Somut deger iddiayi deterministik kontrol edilebilir kilar.
   */
  it('NO_CORRECT_OPTION somut degerle de insan incelemesine gider', () => {
    const r = deriveVerdict(
      run({ blind: [blind(null, '-2'), blind(null, '-2'), blind(null, '-2')], verifier: verifierOk(2) }),
    )
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings[0].evidence).toContain('-2')
  })

  it('NO_CORRECT_OPTION somut deger YOKSA reddetmez', () => {
    const r = deriveVerdict(
      run({ blind: [blind(null), blind(null), blind(null)], verifier: verifierOk(2) }),
    )
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toContain('NO_CORRECT_OPTION')
  })
})

describe('kor cozucu bulgulari', () => {
  it('uzlasan indeks isaretliden farkliysa WRONG_KEY_SUSPECTED uretir', () => {
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(4)] }))
    expect(r.findings[0].code).toBe('WRONG_KEY_SUSPECTED')
    expect(r.findings[0].optionIndexes).toEqual([4, 2])
  })

  it('hicbir sikla eslesmiyorsa NO_CORRECT_OPTION -> NEEDS_REVIEW', () => {
    const r = deriveVerdict(
      run({ blind: [blind(null, '61'), blind(null, '61'), blind(null, '61')], verifier: verifierOk(null) }),
    )
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toContain('NO_CORRECT_OPTION')
    expect(r.findings[0].evidence).toContain('61')
  })

  it('ornekler bolunduyse REJECTED degil NEEDS_REVIEW', () => {
    const r = deriveVerdict(run({ blind: [blind(2), blind(4), blind(1)] }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.blindConsensusIndex).toBeNull()
    expect(r.blindAgreementRatio).toBe(0)
  })

  it('mutabakat esigin altindaysa REJECTED degil NEEDS_REVIEW', () => {
    // 2/3 idx4 diyor ama esik 1.0 -> tek stokastik cogunlukla soru reddedilmez
    const r = deriveVerdict(run({ blind: [blind(4), blind(4), blind(2)] }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.blindAgreementRatio).toBeCloseTo(2 / 3)
  })

  it('varsayilan esik 2/3: uc ornekten ikisi yeterli', () => {
    // 2/3 = 0.667 >= varsayilan 2/3 -> mutabakat GECERLI sayilir.
    // Esik 1.0 iken bu kosu NEEDS_REVIEW'du; olcum 1.0'in bir gercek hatayi
    // kacirdigini gosterdi (bkz. DEFAULT_DERIVE_OPTIONS yorumu).
    const r = deriveVerdict(run({ blind: [blind(2), blind(2), blind(4)] }))
    expect(r.verdict).toBe('APPROVED')
    expect(r.blindAgreementRatio).toBeCloseTo(2 / 3)
  })

  it('esik degisince AYNI kosu farkli verdict verir — gecmis para harcamadan yeniden puanlanir', () => {
    // 5 ornekten 3'u uyusuyor -> oran 0.6, varsayilan 2/3'un ALTINDA.
    const sameRun = run({ blind: [blind(2), blind(2), blind(2), blind(4), blind(1)] })
    expect(deriveVerdict(sameRun).verdict).toBe('NEEDS_REVIEW')
    expect(deriveVerdict(sameRun, { minBlindAgreement: 0.5 }).verdict).toBe('APPROVED')
  })
})

describe('cozum denetcisi', () => {
  it('cozum baska sikka variyorsa tek tanikla NEEDS_REVIEW', () => {
    const r = deriveVerdict(run({ verifier: verifierOk(1) }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toContain('SOLUTION_CONTRADICTS_ANSWER')
  })

  it('kisa cozum REJECTED degil NEEDS_REVIEW (bankanin %17\'si boyle)', () => {
    const r = deriveVerdict(run({ verifier: verifierOk(2, 'terse') }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toEqual(['INCOMPLETE_SOLUTION'])
  })

  it('cozum metni yoksa ajan atlanir ve soru bundan CEZA ALMAZ', () => {
    const r = deriveVerdict(run({ verifier: skipped() }))
    expect(r.verdict).toBe('APPROVED')
    expect(r.findings).toEqual([])
  })
})

describe('adversarial bulgulari', () => {
  /**
   * 200 soruluk kalibrasyonda MULTIPLE_CORRECT ~%75 yanlis pozitif verdi
   * (flash-lite). Advisory'ye alindi: bulgu kaybolmaz, insana gider, ama tek
   * basina soru oldurmez. Daha guclu modelde yeniden olculup geri alinabilir.
   *
   * YAPISAL SONUC: adversarial ajanin uretebildigi UC kodun ucu de artik
   * advisory — yani bu ajan tek basina hicbir soruyu REDDEDEMEZ. Blocking
   * yetkisi yalniz kor cozucude (WRONG_KEY_SUSPECTED, NO_CORRECT_OPTION) ve
   * cozum denetcisinde (SOLUTION_CONTRADICTS_ANSWER).
   */
  it('MULTIPLE_CORRECT artik advisory -> NEEDS_REVIEW', () => {
    const adv: AgentOutcome<AdversarialPayload> = ok({
      reasoning: 'r',
      findings: [{ code: 'MULTIPLE_CORRECT', evidence: 'B ve D ayni sonucu veriyor', optionIndexes: [1, 3] }],
    })
    const r = deriveVerdict(run({ adversarial: adv }))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.findings.map((f) => f.code)).toEqual(['MULTIPLE_CORRECT'])
  })

  it('adversarial ajan TEK BASINA hicbir soruyu reddedemez', () => {
    const codes = ['MULTIPLE_CORRECT', 'MISSING_PREMISE', 'AMBIGUOUS_WORDING'] as const
    for (const code of codes) {
      const adv: AgentOutcome<AdversarialPayload> = ok({ reasoning: 'r', findings: [{ code, evidence: 'e' }] })
      expect(deriveVerdict(run({ adversarial: adv })).verdict).toBe('NEEDS_REVIEW')
    }
  })

  it('MISSING_PREMISE advisory -> NEEDS_REVIEW', () => {
    const adv: AgentOutcome<AdversarialPayload> = ok({
      reasoning: 'r',
      findings: [{ code: 'MISSING_PREMISE', evidence: 'x tam sayi denmemis' }],
    })
    expect(deriveVerdict(run({ adversarial: adv })).verdict).toBe('NEEDS_REVIEW')
  })
})

describe('4 sikli soru', () => {
  it('LGS sorusu ayni mantikla degerlendirilir', () => {
    const r = deriveVerdict(
      run({ optionCount: 4, markedAnswerIndex: 3, blind: [blind(3), blind(3)], verifier: verifierOk(3) }),
    )
    expect(r.verdict).toBe('APPROVED')
  })
})
