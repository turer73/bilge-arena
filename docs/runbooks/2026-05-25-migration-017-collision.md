# Migration 017 Naming Collision — Risk Notu

**Tespit:** 2026-05-25 teknik borç audit.

## Durum

İki migration dosyası `017_` prefix'ini paylaşıyor:

```
017_homepage_editor.sql            (5273 bytes, 2026-04-05)
017_question_text_search_index.sql (608 bytes,  ?)
```

İçerikler:
- **homepage_editor** — admin paneli için ana sayfa bölüm tabloları (BEGIN/COMMIT içinde)
- **question_text_search_index** — pg_trgm extension + GIN index (`idx_questions_question_trgm`)

Ortak prefix dışında ortak DDL bağımlılığı yok.

## Risk

Eğer migration runner (Supabase CLI veya manuel) **alfabetik** sıralıyorsa:
- `017_homepage_editor.sql` önce
- `017_question_text_search_index.sql` sonra

Bu deterministik çalışır ama:
1. **Supabase migration tracking** (`supabase_migrations.schema_migrations` tablosu) genellikle dosya adının tamamını "version" olarak tutar. İki ayrı kayıt mevcut olabilir — yani prod'da her ikisi de applied. Bu durumda **rename = yeni migration sayılır + duplicate apply hatası** alabilirsin.
2. Yeni bir geliştirici elle apply ederken ikisinden birini atlayabilir.
3. Audit/diff tool'ları "017" sayılı tek migration bekler.

## Doğrulama (apply etmeden önce zorunlu)

```sql
-- Supabase prod DB'de çalıştır:
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version LIKE '017%' OR name LIKE '017%'
ORDER BY executed_at;
```

Beklenen: iki satır, ikisi de applied.

## Önerilen aksiyon

**Şu an dokunma.** Her iki migration prod'da apply'lı varsayımıyla:
- Dosya rename **yapılmamalı** (Supabase tracking'i karışır, false-positive "yeni migration var" alarmı).
- Sıradaki migration'lar (055+) sıralı normal numara almaya devam etsin.
- Bu dokümandaki risk notu kayıt için yeterli.

## Düzeltme yapılacaksa (gelecekte)

Sadece prod tracking tablosunu manuel düzeltmeyi göze alabilecek bir bakım penceresinde:
1. Yeni dosya adı tercih et: `017a_question_text_search_index.sql` (047a pattern gibi).
2. Supabase tracking tablosunda eski adı UPDATE et:
   ```sql
   UPDATE supabase_migrations.schema_migrations
   SET version = '017a_question_text_search_index',
       name = '017a_question_text_search_index'
   WHERE name = '017_question_text_search_index';
   ```
3. Migrations git history'sinde reno notu bırak.

## İlgili
- Audit: `docs/plans/2026-05-25-yapilacaklar.md`
- Pattern referansı: `047a_soft_delete_authenticated_revoke.sql` (zaten "a" suffix kullanılmış)
