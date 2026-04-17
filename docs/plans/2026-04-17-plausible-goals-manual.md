# Plausible Goals Manual Insert — Gun 2 Modal

Plan satir 356-364'e gore VPS'de PostgreSQL'e manuel SQL calistirilmasi gerekli.
(Automated SSH chain buradan calismadi — klipperos -> Tailscale root@100.126.113.23 zinciri nested non-interactive modda hang etti.)

## Komutlar

```bash
# Klipper uzerinden Contabo VPS'e
ssh klipperos@100.113.153.62
ssh root@100.126.113.23

# Contabo'da Plausible PostgreSQL container'ini bul
docker ps --format "{{.Names}} {{.Image}}" | grep -iE "plausible|postgres"

# SQL calistir (container adini yerine koy):
docker exec -i <PLAUSIBLE_DB_CONTAINER> psql -U postgres -d plausible_db -c \
  "INSERT INTO goals (site_id, event_name, inserted_at, updated_at, display_name)
   VALUES
     (1, 'PromptShown', NOW(), NOW(), 'PromptShown'),
     (1, 'PromptCtaClicked', NOW(), NOW(), 'PromptCtaClicked'),
     (1, 'PromptDismissed', NOW(), NOW(), 'PromptDismissed');"
```

## Dogrulama

```sql
SELECT id, site_id, event_name FROM goals WHERE event_name LIKE 'Prompt%';
```

## Onemli

- `site_id = 1` varsayildi (bilgearena.com). Farkliysa `SELECT id, domain FROM sites;` ile kontrol et.
- Event'ler DB'ye eklenmese bile Plausible her event'i kaydeder; bu goals tablosu sadece dashboard goal-tracking icin.
- Kod tarafi hazir: `PromptShown`, `PromptCtaClicked`, `PromptDismissed` trackEvent cagrilari [signup-prompt-modal.tsx](../../src/components/game/signup-prompt-modal.tsx) icinde.
