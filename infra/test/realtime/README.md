# Oda Realtime duman testi (izole)

Derin inceleme §4.1 (Realtime token ve oda kanali) icin iki oyunculu WebSocket
testi. Uretim degildir; uretim verisine dokunmaz.

- **Yigin:** `bilge-arena-db` imaji (`../../vps/bilge-arena/Dockerfile.db`,
  postgres 16 + wal2json) ve `supabase/realtime:v2.140.7` (uretimle ayni surum).
  Port disari acilmaz.
- **SQL:** uretim zinciri 0..26, uretimdeki kullanici ayrimiyla (oda nesneleri
  `bilge_arena_app`, rol/yayin/ACL dosyalari superuser). Ardindan 26 ve 27 testleri.
- **Istemci:** uygulamanin kendi kodu (`createOdaRealtimeClient`,
  `setupRoomChannel`, `realtime-token.ts`), realtime-js 2.117.3, Node 22'de.
  Token'lar `/api/realtime/token` ile ayni fonksiyonla imzalanir; Supabase
  oturumu -> route adimi bu testte yoktur (route unit testleri kapsar).
- **Fark:** Realtime DB'ye superuser ile baglanir (uretimde `bilge_arena_realtime`).
  Yetki sorgusu her iki durumda da `authenticated` rolune gecerek kosar.

## Kosum

```bash
node infra/test/realtime/build.mjs           # dist/smoke.mjs (rolldown, vite ile gelir)
bash infra/test/realtime/run.sh              # Docker gerekli; KEEP=1 yigini birakir
```

Klipper'da: dizini (Dockerfile.db, sql/, compose.yaml, run.sh, dist/) kopyalayip
`bash run.sh`. Sirlar her kosuda rastgele uretilir ve cikista silinir.

## Fazlar

| Faz | Realtime ayari | Istemci | Beklenen |
| --- | --- | --- | --- |
| `before` | bugunku VPS: `SEED_SELF_HOST=true` (tenant sirri == `API_JWT_SECRET`), aud dogrulamasi yok, 27 yok | eski: public kanal | B1-B3 aciklari yeniden uretir |
| `after` | onerilen: `SEED_SELF_HOST=false`, ayri `API_JWT_SECRET`, `JWT_CLAIM_VALIDATORS` aud, 27 uygulanmis | yeni: private kanal + token yenileme | A1-A12 gecer |

INFO satirlari pass/fail sayilmaz; olcum olarak raporlanir (orn. eksik `aud`
claim'i Realtime'in dogrulayicisi tarafindan reddedilmez).
