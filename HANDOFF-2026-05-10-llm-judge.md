# Bilge Arena — LLM Judge POC Devam (surer için)

## DURUM (sen surer'dasin)
- **cwd:** `F:\projelerim\bilge-arena`
- **Master HEAD:** `77c2738` (PR #135 mergeli)
- **Açık PR: #136** — `feat/llm-judge-poc` (klipper'dan token ile push edildi)
- URL: https://github.com/turer73/bilge-arena/pull/136

PR'daki commit `61f9992` GitHub'da; surer'da aynı içerikli `7055720` lokal commit duruyor (klipper'da rebase edildi, surer ile divergent ama aynı dosyalar). Aşağıda hizalama da var.

## İLK YAPILACAK — gh CLI yenile

`gh auth status` "token invalid" diyor (klipper'dan SSH ile push edemedik bu yüzden). Browser login YETERLİ DEĞİL, gh CLI ayrı.

```cmd
gh auth login -h github.com
```
- "GitHub.com" → "HTTPS" → "Login with a web browser"
- Tarayıcıda one-time code gir, izin ver
- Doğrula:
  ```cmd
  gh auth status
  ```

Bu bittiğinde `git push`, `gh pr create`, `gh pr checks` hepsi çalışır.

## SURER LOKAL BRANCH'İ HİZALA (klipper push'undan sonra)

Surer'da hâlâ eski local commit (`7055720`) var. GitHub'da aslolan `61f9992`. Hizala:

```cmd
cd /D F:\projelerim\bilge-arena
git fetch origin
git checkout feat/llm-judge-poc
git reset --hard origin/feat/llm-judge-poc
```

> ⚠ `--hard` workspace'teki değişiklikleri siler. Önce `git status` ile temiz olduğundan emin ol.

## PR'IN DURUMU

```cmd
gh pr checks 136 --watch
```

CI 4 job çalıştırıyor: lint → type-check → test → build. Hata varsa fix.

## EVAL ÇALIŞTIR — KRİTİK

Judge gerçekten yakalıyor mu? Bunu görmeden merge etme.

```cmd
cd /D F:\projelerim\bilge-arena

REM .env.local'da GEMINI_API_KEY olduğunu doğrula
type .env.local | findstr GEMINI_API_KEY

REM 10 fixture, ~$0.005, ~30 saniye
npm run audit:judge:eval
```

**Beklenen:**
- `known-correct` (5): hepsi severity=ok (judge "sıkıntı yok" demeli)
- `known-wrong-answer` (3): hepsi `agrees_with_marked=false` + severity=major
- `known-ambiguous` (2): ≥1 tanesinde multi_correct/ambiguous_wording flag

**Sonuçları PR yorumu olarak ekle:**
```cmd
gh pr comment 136 --body-file database\__tests__\eval-judge-report.json
```

Eval düşükse → prompt revize gerek (`audit-llm-judge.mjs` içindeki `SYSTEM` constant). Reaktif iterasyon yap.

## CI.YML EKSİK STEP'İ EKLE

PR #136'da workflow scope eksikti. Merge sonrası:

```cmd
gh auth refresh -h github.com -s workflow
```

Sonra `.github/workflows/ci.yml`'de `test` job'ında "Upload coverage to Codecov" step'inin ÜSTÜNE şunu ekle:

```yaml
      - name: Run database/__tests__ (LLM judge unit tests)
        run: npm run test:db
```

Commit + push:
```cmd
git -c user.name=turer73 -c user.email=63844106+turer73@users.noreply.github.com ^
  commit -am "ci: enable database tests in CI workflow"
git push origin master
```

## TÜM AKTİF SORULAR ÜZERİNDE FULL AUDIT (eval iyi geçtikten sonra)

```cmd
cd /D F:\projelerim\bilge-arena

REM 1. DB'den ai_claude_v4 sorularını çek
node database\audit-claude-batch.mjs

REM 2. Judge'ı koş (3685 soru, ~10dk, ~$0.50)
node database\audit-llm-judge.mjs

REM 3. Sonucu özetle
node -e "const r=require('./database/audit-llm-judge-report.json'); console.log(JSON.stringify(r.summary,null,2))"

REM 4. major severity olanları gör
node -e "const r=require('./database/audit-llm-judge-report.json'); r.flagged.filter(f=>f.severity==='major').slice(0,20).forEach(f=>console.log(f.id, f.category, f.issues.join(','), f.reasoning_brief))"
```

## KOMUTLAR (Windows cmd cheat sheet)

```cmd
REM Tek alt-küme (ucuz, dry-run-safe)
node database\audit-llm-judge.mjs --limit 5

REM Sadece tarih
node database\audit-llm-judge.mjs --filter category=tarih

REM Anthropic ile (daha iyi reasoning, ~$7)
node database\audit-llm-judge.mjs --provider anthropic

REM Unit testler
npm run test:db

REM Real-API eval
npm run audit:judge:eval
```

## SONRAKİ İŞLER (PR #136 mergelendikten sonra)

1. **Pipeline integration** — `import-json-to-db.mjs`'e `--judge` flag (severity=major reject)
2. **Tier 2 PR — production drift:** `session_answers` üzerinde wrong-answer-rate view + admin queue
3. **Tier 3 PR — in-app raporlama:** soru ekranında "hatalı" butonu → `question_reports` table

## KISITLAR / GOTCHA'LAR

- **Co-Authored-By EKLEME** — Vercel hobby plan engelliyor
- **Author hep `turer73`** — KlipperOS değil; `git config` zaten doğru
- **Pre-commit hook** — `lint && type-check`, hata varsa commit fail eder
- **Pre-push hook** — `build && test`, build patlıyorsa push fail eder
- **TDK pre-check sınırı** — 439 uzun token (MIN_LENGTH=5), `acik` gibi kısa kelimeler kaçar; gelecek iterasyonda `tdk-rules.fixture.ts` manuel listesi de extract edilmeli (.ts → .mjs köprü)
- **gh CLI'da iki account var** — `turer73` (default) ve `3d-labx-lab`. Push işleminde `turer73` aktif olmalı, `gh auth status` ile teyit et

## DÜRÜSTLÜK

- Format guard ≠ semantik doğru
- Spot N/N OK YANILTICI — random sample audit
- LLM "kesin" der ama her zaman doğru değil → `severity=minor` admin review queue'ya, otomatik reject etme
- Eval iyi gelmedikçe judge'ı `import-json-to-db.mjs` pipeline'ına entegre etme
