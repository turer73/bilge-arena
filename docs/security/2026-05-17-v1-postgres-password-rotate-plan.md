# V1: Postgres Direct DB Password Rotate — Plan

**Tarih:** 2026-05-17 hazırlandı
**Risk:** 🔴 Yüksek — yanlış sırayla yapılırsa downtime
**Klipper deep audit kaynak:** Note #111 V1 vector

## Neden gerekli?

Klipper deep audit'inin **karşıt bakış** bölümü: Service-role JWT rotation **Postgres direkt bağlantı password'unu DEĞİŞTİRMEZ**.

- Service-role JWT (`sb_secret_YzWZn`) → Supabase REST API + PostgREST + Storage + Auth
- Postgres direct credentials (`postgresql://postgres:xxx@db.lvnmzdowhfzmpkueurih.supabase.co:5432/postgres`) → **ayrı password**
- Connection Pooler (port 6543) ve direct (port 5432) **aynı password** kullanır
- Eğer saldırgan psql ile Postgres'e bağlandıysa rotate **hiçbir şey değiştirmedi**

## Önkoşul — Envanter

Postgres direct password'u kullanan tüm tüketicileri tespit:

```bash
# 1. Vercel env
gh secret list --repo turer73/bilge-arena | grep -i postgres
# Vercel project env var (Settings > Environment Variables) -> 'DATABASE_URL' veya 'POSTGRES_URL' var mı?

# 2. VPS bilge-arena infra
grep -rE "postgres(ql)?://" infra/ scripts/ 2>/dev/null
grep -rE "lvnmzdowhfzmpkueurih" infra/ scripts/ 2>/dev/null  # project ref ayrica ara

# 3. Klipper backup scripts
# Genis pattern - URI'nin her yerinde project ref'i ara (host kismi, query string vs.)
ssh klipperos@100.84.251.49 'grep -rE "postgres(ql)?://[^[:space:]\"]*lvnmzdowhfzmpkueurih" /opt/linux-ai-server/ 2>/dev/null'
# Bonus: tum PG URI'leri (DATABASE_URL benzeri env var degerlerini de yakala)
ssh klipperos@100.84.251.49 'grep -rE "postgres(ql)?://[^[:space:]\"]+" /opt/linux-ai-server/ 2>/dev/null | grep -v "127.0.0.1\|localhost"'

# 4. n8n credentials
# panola.app/n8n -> Credentials -> "Bilge Arena Postgres" var mı?
# DBeaver / pgAdmin gibi araçlar lokal'de connection string saklıyor mu?

# 5. GitHub Actions
gh secret list --repo turer73/bilge-arena | grep -iE "db|postgres|database"
```

## Bilinen tüketici listesi (mevcut audit'ten)

| Tüketici | Durum |
|---|---|
| Vercel `DATABASE_URL` | ❓ Audit gerekli |
| Klipper `scripts/vps-backup/bilge-arena-backup.sh` | ❓ pg_dump connection string olabilir |
| n8n credentials (panola.app) | ❓ Klipper sorulmalı |
| Local pgAdmin / DBeaver | ❓ Kullanıcı sorulmalı |
| GitHub Actions secrets | ✅ Yok (audit yapıldı) |

## Rotate adımları

### Adım 0 — Envanter doğrula (zorunlu)
Yukarıdaki komutları koş, tüm tüketicileri listele. Eksik kalan tüketici **rotate sonrası kırılır**.

### Adım 1 — Yeni password üret
1. Supabase Dashboard → Settings → Database → Database password
2. **"Reset database password"** butonu
3. Üretilen yeni password'u **kopyala** — bir daha gösterilmez

### Adım 2 — Tüm tüketicileri paralel güncelle
Liste düzeninde:
```bash
# Vercel
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# (yeni password ile connection string yapıştır)

# Klipper backup script
ssh klipperos@100.84.251.49
sudo sed -i 's|postgres:OLD_PASS|postgres:NEW_PASS|g' /opt/linux-ai-server/scripts/vps-backup/bilge-arena-backup.sh
# veya .env dosyasındaysa
sudo nano /opt/linux-ai-server/.env

# n8n
# panola.app/n8n -> Credentials -> 'Bilge Arena Postgres' -> Edit -> new password -> Test connection

# Local dev (eğer DBeaver/pgAdmin'de saved varsa)
# Connection settings -> password -> save
```

### Adım 3 — Vercel redeploy
- Deployments → latest → Redeploy
- Build cache OFF
- "Ready" bekle

### Adım 4 — Doğrulama
```sql
-- Supabase SQL Editor'dan koş (zaten yeni password ile bağlanıyorsun)
SELECT current_database(), current_user, version();
```

`pg_dump` test:
```bash
# Klipper'dan manuel test
ssh klipperos@100.84.251.49 'pg_dump postgres://postgres:NEW_PASS@db.lvnmzdowhfzmpkueurih.supabase.co:5432/postgres --schema=public --no-data | head -5'
# CREATE TABLE çıktıları gelmeli
```

### Adım 5 — Saldırgan rotate testi
Eğer önceki password'u saldırganın ele geçirdiğini düşünüyorsanız, ESKİ password ile bağlanma:
```bash
psql postgres://postgres:OLD_PASS@db.lvnmzdowhfzmpkueurih.supabase.co:5432/postgres
# password authentication failed bekleniyor
```

## Risk değerlendirmesi

| Risk | Olasılık | Etki | Önlem |
|---|---|---|---|
| Eksik tüketici → kırılma | Orta | Yüksek (servis down) | Adım 0 envanter zorunlu |
| Eski password git history'de | Düşük | Orta | `git log -p -S 'postgres:' --all` ile tarama yap |
| Backup script kırılır → sonraki backup fail | Yüksek (atlanırsa) | Orta (1 gün veri eksik) | Adım 2'de scripts/ kontrol şart |
| pg_audit log'unda eski password görünür | Düşük | Düşük | Audit log retention 7 gün, kendiliğinden silinir |

## Karar matrisi

| Senaryo | Yapılmalı mı? |
|---|---|
| Saldırgan kesinlikle PG direct bağlandı | 🔴 Evet, **hemen** |
| Saldırı vektörü belirsiz ama PG direct mümkün | 🟡 Evet, **bu hafta** |
| Saldırgan sadece service-role JWT kullandığı kanıtlı | 🟢 Atlanabilir, opsiyonel paranoia |

**Şu an durum:** Saldırı vektörü kanıtlanmadı (Klipper Note #111). PG direct mümkün ama düşük olasılık. **Karar: yarın envanter + bu hafta rotate.**

## Yapılmazsa ne kaybedersin?

- Saldırgan PG password elindeyse `psql` ile tablo dump devam eder
- KVKK avukatı "tüm credential rotate edildi mi" sorarsa "hayır" demek zorundasın → bildirim ağırlaşır
- Defense-in-depth eksik

## Yapılırsa ne kazanırsın?

- **Tüm** credential vektörleri kapanmış olur
- KVKK için "tüm credential rotate" kanıtı
- Saldırganın elindeki tüm eski auth artifact geçersiz
