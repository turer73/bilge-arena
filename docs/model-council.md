# Modeller Arasi Tartisma (Model Council)

Birden fazla modelin — Codex, Claude, Gemini, DeepSeek — **ayni tutanaga sirayla
yazip birbirinin turunu okuyarak** tek bir isi birlikte tamamladigi katman.

Cikti tek bir modelin cevabi degil; tur tur ilerleyen bir **tartisma kaydi** ve o
kayittan **kodda turetilen** bir sonuctur.

> Bu bir **gelistirme aracidir**. Uygulama calisma zamaninda kullanilmaz, hicbir
> Next.js route'una baglanmaz, uretim ortaminda anahtar gerektirmez.

---

## Hizli baslangic

```bash
# 1) Anahtarlari .env.local icine yaz (bkz. .env.example "Model Council" boughlumu)
#    OPENAI_API_KEY=sk-...        -> Codex
#    ANTHROPIC_API_KEY=sk-ant-... -> Claude

# 2) Once DRY-RUN — plan ve cagri tavani basilir, HICBIR LLM cagrisi yapilmaz
npm run council -- --topic "Chat rate limit katmanini sec" --participants codex,claude

# 3) Gercek kosu
npm run council -- --topic "Chat rate limit katmanini sec" \
  --participants codex,claude --rounds 3 --confirm

# 4) Uzun bir is tarifi ve gercek kod baglamiyla
npm run council -- --brief-file docs/plans/yeni-plan.md \
  --context-file src/app/api/chat/route.ts \
  --criterion "Redis yoksa davranis tanimli olmali" \
  --participants codex,claude,gemini --rounds 4 --out kurul.json --confirm
```

Cikis kodu otomasyon icin anlamlidir: **yalniz gercek uzlasma `0`** doner.

---

## Bayraklar

| Bayrak | Varsayilan | Aciklama |
|---|---|---|
| `--topic <metin>` | — | Isin tarifi (kisa). `--brief-file` ile birlikte kullanilirsa baslik olur. |
| `--brief-file <yol>` | — | Uzun is tarifi dosyadan. |
| `--context-file <yol>` | — | Kod/plan/hata ciktisi; degistirilmeden prompt'a gomulur. |
| `--participants <liste>` | `codex,claude` | Virgulle ayrilmis kimlikler. |
| `--rounds <n>` | `3` | Tur tavani. |
| `--criterion <metin>` | — | Tamamlanma olcutu; birden fazla kez verilebilir. |
| `--max-calls <n>` | `60` | Kosu basina mutlak cagri tavani (kaza freni). |
| `--out <yol>` | `model-council-run.json` | Tam tutanak JSON'i. |
| `--confirm` | kapali | **Bu olmadan hicbir LLM cagrisi yapilmaz.** |

---

## Katilimcilar

| Kimlik | Model | Anahtar | Varsayilan rol |
|---|---|---|---|
| `codex` | `CODEX_MODEL_ID` | `OPENAI_API_KEY` / `CODEX_API_KEY` | Denetci — uygulanabilirlik ve kenar durumlar |
| `claude` | `COUNCIL_CLAUDE_MODEL_ID` | `ANTHROPIC_API_KEY` | Mimar — cozumu kurar, odunleri yazar |
| `gemini` | `COUNCIL_GEMINI_MODEL_ID` | `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Ikinci gorus — varsayimlar ve atlanan secenekler |
| `deepseek` | `COUNCIL_DEEPSEEK_MODEL_ID` | `DEEPSEEK_API_KEY` | Ucuz hakem — ozetler, gercek farki isaret eder |

Roller **bilerek farklidir**: ayni role sahip iki model ayni acidan bakar ve
tartisma "iki kez ayni cevap"a doner. `COUNCIL_ROLE_<KIMLIK>` ile ezilir:

```bash
COUNCIL_ROLE_CODEX="Guvenlik denetcisi — yalniz acik ve yetki hatasi ara"
```

### `CODEX_MODEL_ID` hakkinda

Kayittaki varsayilan bir **baslangic degeridir, garanti degil**: hangi codex/gpt
kimliginin bir hesaba acik oldugu hesaptan hesaba degisir. `400`/`404` alirsaniz
ilk bakilacak yer burasidir:

```bash
CODEX_MODEL_ID=<hesabinizin sundugu kimlik>
```

### Yeni model ekleme

`src/lib/model-council/participants.ts` icindeki `REGISTRY`'ye bir satir. Endpoint
OpenAI-uyumlu ise **yeni tasima kodu gerekmez** — `createOpenAiChatProvider`
`baseUrl`, token parametresi ve sicaklik destegiyle yapilandirilir.

---

## Nasil calisir

```
tur 1:  codex ─► tutanak ─► claude ─► tutanak ─► gemini
tur 2:  claude ─► tutanak ─► gemini ─► tutanak ─► codex     (sira KAYDI)
tur 3:  gemini ─► ...
        │
        └─► deriveOutcome(tutanak)  ← SAF KOD, modele sorulmaz
```

Her katilimci sirasi geldiginde tutanagin tamamini okur ve su govdeyi uretir:

```json
{
  "reasoning": "once dusun",
  "stance": "propose | agree | refine | disagree | abstain",
  "position": "net pozisyon, tek basina okunabilir",
  "respondsTo": ["r1-codex"],
  "openQuestions": ["cozulmeden is tamamlanamaz dedigin sorular"],
  "blocking": false
}
```

### Sonuc turleri

| Sonuc | Kosul |
|---|---|
| `converged` | Konusan herkes `agree`, bloklayan yok |
| `unresolved` | Tur tavanina gelindi, hala `refine` var |
| `split` | En az bir `disagree` veya `blocking` ayakta |
| `inconclusive` | Yeterli katilimci konusamadi — **ariza, anlasmazlik degil** |

---

## Tasarim kararlari

Kodun kendisi bunlari soylemiyor; gerekce burada ve ilgili dosyalarin basinda.

**1. Neden `question-audit` orkestratoru kullanilmadi.**
O orkestrator uc ajani *bilerek* paralel ve birbirinden habersiz kosturur: kor
cozucu adversarial'in ne dedigini gorse mutabakat sinyali coker (korele hata).
Orada capraz konusma bir kusur, burada urunun kendisi. Paylasilan tek sey tasima
katmani (`@/lib/llm/transport-core`).

**2. Turler sirali, sira her turda doner.**
Paralel tur, katilimcilarin birbirini gormesini engeller — tartisma olmaz. Sirali
olunca da son konusan digerlerinin hepsini okumus olur (bilgi avantaji + capa
etkisi). `turnOrder` her turda bir kaydirir ki hicbir katilimci kalici olarak ilk
veya son olmasin.

**3. Uzlasma modele sorulmaz.**
Model yalniz kendi `stance`ini beyan eder; "anlasildi mi" karari `consensus.ts`
icinde saf kodda verilir. Modeller kuruluna "anlastiniz mi?" diye sormak
sycophancy'ye en acik kurulumdur — herkes "evet" der.

**4. Ariza, anlasmazlik degildir.**
Bir katilimcinin `401` almasi `disagree` sayilmaz. Basarisiz tur tartismaya
**pozisyon olarak girmez**, `failures` altina kaydedilir. Onsuz "2'ye 1 uzlasma"
cumlesi bir HTTP hatasindan da uretilebilirdi.

**5. Sicaklik dusuk olmamali.**
Hepsi ~0 sicaklikta kosan modeller birbirine cok benzer cikti uretir; "3/3
mutabakat" dejenere bir dagilimdan gelir — sahte guven. Varsayilan `0.7`.

**6. Saglayici yetenek farklari gorunur.**
Anthropic'te JSON modu **yok** ve guncel modeller `temperature` gonderilince
`400` doner; OpenAI'nin yeni modelleri `max_tokens` yerine
`max_completion_tokens` bekler. Bunlar `capabilities` bayraklariyla kodda
gorunur ve `council.ts` istegi ona gore sekillendirir. Sema uyumunun **tek
garantisi** Zod'dur (`schemas.ts`).

---

## Maliyet ve guvenlik frenleri

- **`--confirm` olmadan sifir cagri.** Dry-run plani ve tavani basar, cikar.
- **`maxTotalCalls`** kosu basina mutlak tavan — **tur degil, gercek saglayici
  cagrisi sayar.** Ayrim onemli: `maxAttempts` geregi tek bir tur birden fazla
  cagri harcayabilir, dolayisiyla tur saymak tavani gercek kullanimin
  `1/maxAttempts`'i kadarina indirirdi. Sayac `run-turn.ts`'e verilen
  `reserveCall` kancasindan her cagridan once artar ve tavan dolunca sonraki
  cagri hic yapilmaz — tavan kesindir. Her turun kac cagri harcadigi
  telemetride (`attempts`) durur.
- **Erken durus.** Uzlasilinca kalan turlar harcanmaz (`stopWhenConverged`).
- **Paylasilan hiz kapisi.** `gateFor(providerId)` state'i `question-audit` ile
  ORTAK: iki alt sistem ayni anahtari kullandiginda kota tek yerden sayilir.
- **Anahtarsiz katilimci sessizce dusurulmez** — CLI ekrana basar. Sessiz dusurme
  en sinsi ariza: kullanici "Codex ve Claude tartisti" sanir, oysa rapordaki
  "uzlasma" tek modelin monologudur.

## Bilinen sinirlar

- **Tutanak penceresi** (`render.maxMessages`, varsayilan 40) asilirsa en eskiler
  duser ve yerine kirpma isareti konur. Dusen mesajlarda kapanmis bir tartisma
  varsa, onu gormeyen katilimci ayni noktayi yeniden acabilir. Alternatifi
  (hepsini gondermek) uzun kosularda baglam tavanina carpar.
- **Kod yazmaz, calistirmaz.** Kurul metin uzerinde tartisir; ciktiyi uygulamak
  insanin (veya cagiran aracin) isidir.
- **Kalici depolama yok.** Tutanak `--out` ile JSON'a yazilir; veritabani semasi
  yoktur. `question-audit`'in aksine kararlar bir yayin kapisini beslemez.
