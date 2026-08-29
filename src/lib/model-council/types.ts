/**
 * Modeller Arasi Tartisma (Model Council) — sozlesmeler.
 *
 * NE ISE YARAR: Birden fazla model (Codex, Claude, Gemini, DeepSeek) AYNI
 * kayda yazip birbirinin turunu okuyarak bir isi ortak tamamlar. Cikti tek bir
 * modelin cevabi degil, tur tur ilerleyen bir tartisma kaydi + o kayittan
 * KODDA turetilen bir sonuctur.
 *
 * TASARIM KARARLARI (gerekce burada, cunku kod bunlari soylemiyor):
 *
 * 1. NEDEN `question-audit` ORKESTRATORU KULLANILMIYOR. O orkestrator uc ajani
 *    BILEREK paralel ve birbirinden habersiz kosturur: kor cozucu adversarial'in
 *    ne dedigini gorse mutabakat sinyali coker (korele hata). Orada capraz
 *    konusma bir kusur, burada urunun kendisi. Ayni dosyada iki zit gereksinim
 *    tutulamaz; bu yuzden ayri modul, paylasilan tek sey tasima katmani
 *    (`@/lib/llm/transport-core`).
 *
 * 2. TURLER SIRALI, SIRA HER TURDA DONER. Paralel tur, katilimcilarin
 *    birbirini gormesini engeller — tartisma olmaz. Sirali olunca da son
 *    konusan digerlerinin hepsini okumus olur (bilgi avantaji + capa etkisi).
 *    `turnOrder` her turda bir kaydirilir ki hicbir katilimci kalici olarak
 *    ilk veya son olmasin.
 *
 * 3. UZLASMA MODELE SORULMAZ. Model yalniz kendi `stance`ini beyan eder;
 *    "uzlasildi mi" karari `deriveOutcome` icinde saf kodda verilir. Ayni
 *    gerekce `question-audit/types.ts` madde 2'de: modele "anlastiniz mi?"
 *    diye sormak sycophancy'ye en acik kurulumdur — herkes "evet" der.
 *
 * 4. ARIZA, ANLASMAZLIK DEGILDIR. Bir katilimcinin HTTP hatasi almasi
 *    `disagree` sayilmaz; `TurnOutcome` ayrik birlesimdir ve basarisiz tur
 *    tartismaya POZISYON olarak girmez. Onsuz "2'ye 1 uzlasma" cumlesi, bir
 *    modelin 401 almasindan da uretilebilirdi.
 */

/** Roster icinde benzersiz, kisa, kararli kimlik: 'codex', 'claude', ... */
export type ParticipantId = string

/**
 * Katilimcinin turu icin beyan ettigi durus.
 *
 * `refine` ile `agree` ayrimi kritik: ikisi de olumludur ama `refine` "yonu
 * kabul ediyorum, sunu degistirin" demektir — is HENUZ bitmemistir. Tek bir
 * "olumlu" degeri olsaydi, uzerinde hala duzeltme istenen bir oneri
 * "uzlasildi" diye kapanirdi.
 */
export type Stance =
  /** Yeni bir oneri koyuyor (ilk turun dogal durusu). */
  | 'propose'
  /** Mevcut onerinin bu haliyle tamamlandigini soyluyor. */
  | 'agree'
  /** Yonu kabul ediyor, degisiklik istiyor — is bitmedi. */
  | 'refine'
  /** Mevcut oneriyi reddediyor. */
  | 'disagree'
  /** Konu kendi alani disinda; sayimda paydaya girmez. */
  | 'abstain'

/** Modelin uretmesi beklenen tur govdesi (Zod ile `schemas.ts`'de dogrulanir). */
export interface TurnPayload {
  /**
   * ALAN SIRASI ONEMLI: `reasoning` once uretilmeli ki durus gerekceden
   * turesin, tersi degil. OpenAI-uyumlu saglayicilarda bu YALNIZ prompt ile
   * saglanir (bkz. prompts.ts) — sema dayatmasi alan sirasini sabitlemez.
   */
  reasoning: string
  stance: Stance
  /** Katilimcinin o andaki net pozisyonu — tek basina okunabilir olmali. */
  position: string
  /**
   * Yanit verdigi mesaj kimlikleri (`r2-codex` gibi). Bos birakilabilir ama
   * bos birakilan bir `disagree` kimin neyine itiraz ettigi belirsiz kalir;
   * prompt bunu istiyor, sema zorlamiyor (model uydurmasin diye).
   */
  respondsTo: string[]
  /** Cozulmeden isin tamamlanamayacagi sorular. Uzlasmayi ENGELLEMEZ, rapora girer. */
  openQuestions: string[]
  /**
   * "Bu haliyle devam edilemez" bayragi. `disagree`den farki: bir katilimci
   * `refine` derken de bloklayici bir kusura isaret edebilir.
   */
  blocking: boolean
}

/**
 * Tur telemetrisi.
 *
 * `question-audit/types.ts`'deki `AgentTelemetry` ile ayni alanlari tasir ama
 * BILEREK ayri tip: o tip `question_validation_runs` satirlarina serilestiriliyor
 * ve sema kilidi altinda. Iki ozelligin kalici veri bicimini birbirine baglamak,
 * birinde yapilan bir alan degisikligini digerinin migration'i haline getirir.
 */
export interface TurnTelemetry {
  providerId: string
  modelId: string
  promptVersion: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  finishReason: string | null
}

export type TurnErrorKind =
  /** ag/HTTP/5xx */
  | 'transport'
  /** JSON parse veya Zod dogrulamasi basarisiz */
  | 'schema'
  /** finishReason=MAX_TOKENS — uzun gerekce uretiminde gercek risk */
  | 'truncated'
  /** guvenlik filtresi, ret (`refusal`) veya bos yanit */
  | 'blocked'
  | 'timeout'
  /** Kosu butcesi (cagri tavani) doldu — model hic cagrilmadi. */
  | 'budget'

export interface TurnError {
  kind: TurnErrorKind
  message: string
  retryable: boolean
}

export type TurnOutcome =
  | { status: 'ok'; data: TurnPayload; telemetry: TurnTelemetry; raw: string }
  | { status: 'failed'; error: TurnError; telemetry: TurnTelemetry; raw: string | null }

/**
 * Kayda dusmus tek mesaj. `id` DETERMINISTIK (`r{tur}-{katilimci}`): modeller
 * birbirine bu kimlikle atif yapiyor, rastgele UUID olsaydi atiflar okunamazdi
 * ve kosu tekrar oynatildiginda kimlikler degisirdi.
 */
export interface CouncilMessage {
  id: string
  round: number
  participantId: ParticipantId
  displayName: string
  role: string
  payload: TurnPayload
  telemetry: TurnTelemetry
  createdAt: string
}

/** Basarisiz turlar da kayda gecer — tartismadan DUSER, rapordan DUSMEZ. */
export interface CouncilFailure {
  id: string
  round: number
  participantId: ParticipantId
  error: TurnError
  telemetry: TurnTelemetry
  createdAt: string
}

export interface CouncilTranscript {
  messages: CouncilMessage[]
  failures: CouncilFailure[]
}

/** Tartismanin konusu — modellere birebir bu metin verilir. */
export interface CouncilTopic {
  /** Kisa baslik; raporda ve loglarda kullanilir. */
  title: string
  /** Tamamlanacak isin tarifi. */
  brief: string
  /**
   * Kod parcasi, plan, hata ciktisi — degistirilmeden prompt'a gomulur.
   * Uzunsa `council.ts` kirpar ve kirptigini soyler.
   */
  context: string | null
  /** "Bitti" sayilmasi icin saglanmasi gerekenler; raporda karsilastirilir. */
  successCriteria: string[]
}

export type CouncilOutcomeKind =
  /** Konusan herkes `agree`, bloklayan yok. */
  | 'converged'
  /** Tur tavanina gelindi, hala `refine`/acik soru var. */
  | 'unresolved'
  /** En az bir katilimci `disagree` veya `blocking` ile duruyor. */
  | 'split'
  /**
   * Yeterli katilimci konusamadi (tasima arizasi). Bir ANLASMAZLIK DEGIL —
   * kuyruga geri, insana degil.
   */
  | 'inconclusive'

export interface StandingPosition {
  participantId: ParticipantId
  displayName: string
  messageId: string
  round: number
  stance: Stance
  position: string
  blocking: boolean
}

export interface CouncilOutcome {
  kind: CouncilOutcomeKind
  /** Her katilimcinin EN SON turu; onceki turlari baglayici degildir. */
  standing: StandingPosition[]
  /** Ayakta duran pozisyonlardaki acik sorularin birlesimi (tekrarsiz). */
  openQuestions: string[]
  /** Neden bu sonuc — tek satir, insan okunur. */
  rationale: string
}

export interface CouncilExecutionIdentity {
  promptVersion: string
  participants: Array<{ id: ParticipantId; providerId: string; modelId: string; role: string }>
  config: Record<string, unknown>
}

export interface CouncilRun {
  runId: string
  topic: CouncilTopic
  execution: CouncilExecutionIdentity
  transcript: CouncilTranscript
  outcome: CouncilOutcome
  /** Gerceklesen tur sayisi; erken uzlasmada `maxRounds`tan kucuk olur. */
  roundsRun: number
  totalCalls: number
  inputTokens: number
  outputTokens: number
  startedAt: string
  finishedAt: string
}
