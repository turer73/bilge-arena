# Plausible Goals Manual Insert — Gun 2 Modal

**DURUM: UYGULANDI (2026-04-18)** — goals id 8/9/10, site_id=2 (bilgearena.com).

Plan satir 356-364'e gore VPS'de PostgreSQL'e manuel SQL calistirilmasi gerekli.
Tailscale device auth onaylandiktan sonra SSH chain sorunsuz calisti.

## Komutlar

```bash
# Klipper uzerinden Contabo VPS'e
ssh klipperos@100.113.153.62
ssh root@100.126.113.23

# Contabo'da Plausible PostgreSQL container'ini bul
docker ps --format "{{.Names}} {{.Image}}" | grep -iE "plausible|postgres"

# Kullanilan container: plausible-plausible_db-1 (postgres:16-alpine)
# bilgearena.com icin gercek site_id: 2

docker exec -i plausible-plausible_db-1 psql -U postgres -d plausible_db -c \
  "INSERT INTO goals (site_id, event_name, inserted_at, updated_at, display_name)
   VALUES
     (2, 'PromptShown', NOW(), NOW(), 'PromptShown'),
     (2, 'PromptCtaClicked', NOW(), NOW(), 'PromptCtaClicked'),
     (2, 'PromptDismissed', NOW(), NOW(), 'PromptDismissed');"
```

## Dogrulama

```sql
SELECT id, site_id, event_name FROM goals WHERE event_name LIKE 'Prompt%';
```

## Onemli

- **site_id = 2** (bilgearena.com) — Plausible'da site sirasi plan yazilirken bilinmiyordu, `SELECT id, domain FROM sites;` ile dogrulandi.
- Event'ler DB'ye eklenmese bile Plausible her event'i kaydeder; bu goals tablosu sadece dashboard goal-tracking icin.
- Kod tarafi hazir: `PromptShown`, `PromptCtaClicked`, `PromptDismissed` trackEvent cagrilari [signup-prompt-modal.tsx](../../src/components/game/signup-prompt-modal.tsx) icinde.

## Operasyonel Not

Tailscale SSH nested chain (`klipperos@100.113.153.62 -> root@100.126.113.23`) non-interactive modda ilk kez kullanilirken device auth onayi istedi (`login.tailscale.com/a/<token>`). Tarayicidan onaylandiktan sonra sonraki cagrilar sorunsuz gecti. `-o StrictHostKeyChecking=no` bayragi gerekli olabilir (inner SSH'ta known_hosts yoktu).
