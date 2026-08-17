import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '130_purchase_ledger.sql'),
  'utf8',
)

const PURCHASE_FUNCTIONS = [
  ['purchase_background', 'background', 'owned_backgrounds', 'p_background_id'],
  ['purchase_frame', 'frame', 'owned_frames', 'p_frame_id'],
  ['purchase_nameplate', 'nameplate', 'owned_nameplates', 'p_nameplate_id'],
  ['purchase_cosmetic_badge', 'cosmetic_badge', 'owned_cosmetic_badges', 'p_badge_id'],
  ['purchase_avatar_decoration', 'avatar_decoration', 'owned_avatar_decorations', 'p_decoration_id'],
]

function functionBody(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('130 purchase ledger SQL contract', () => {
  it('defines the ledger with a per-user-item uniqueness guard', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.purchase_ledger')
    expect(sql).toContain('CONSTRAINT purchase_ledger_identity_unique UNIQUE (user_id, category, item_id)')
    expect(sql).toMatch(/category text NOT NULL CHECK \(category IN \(/)
  })

  it('separates the real purchase moment from the row write, so backfill is distinguishable', () => {
    // cost/purchased_at NULL olabilir (geriye donuk), recorded_at asla.
    expect(sql).toMatch(/cost integer CHECK \(cost IS NULL OR cost >= 0\)/)
    expect(sql).toMatch(/purchased_at timestamptz,/)
    expect(sql).toMatch(/recorded_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/)
  })

  it('keeps the reward_ledger access model: self-read only, no direct writes', () => {
    expect(sql).toContain('ALTER TABLE public.purchase_ledger ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.purchase_ledger FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT SELECT ON public.purchase_ledger TO authenticated')
    // Yazma yalniz DEFINER RPC'lerden gecmeli.
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^\n]*purchase_ledger/)
  })

  it('is append-only: service_role dahil kimse satir degistiremez/silemez', () => {
    // reward_ledger (093 satir 44-45) ayni korumayi tasiyor. Bu satir olmazsa
    // Supabase varsayilan grant'i service_role'e UPDATE/DELETE de verir ve
    // defter denetim izi olmaktan cikar.
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE, TRUNCATE ON public\.purchase_ledger\s+FROM PUBLIC, anon, authenticated, service_role/,
    )
  })

  it('RLS policy auth.uid() cagrisini InitPlan icine sarar', () => {
    // Ciplak auth.uid() satir basina yeniden degerlendirilir; repo bu tuzagi
    // migration 035'te (auth-rls-initplan) bilerek duzeltmisti.
    expect(sql).toContain('USING ((SELECT auth.uid()) = user_id)')
    expect(sql).not.toMatch(/USING \(user_id = auth\.uid\(\)\)/)
  })

  it('definer fonksiyonlari deftere sema-nitelenmis yazar', () => {
    // 093 deseni: SECURITY DEFINER icinde her nesne acikca nitelenir.
    expect(sql).not.toMatch(/INSERT INTO purchase_ledger/)
  })

  it.each(PURCHASE_FUNCTIONS)(
    '%s logs into the ledger inside the same statement as the debit',
    (fn, category, ownedColumn, idParam) => {
      const body = functionBody(fn)
      // Odeme ve defter kaydi TEK ifadede: data-modifying CTE.
      expect(body).toContain('WITH purchased AS (')
      expect(body).toContain(`RETURNING coin_balance, ${ownedColumn}`)
      expect(body).toContain('INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)')
      expect(body).toContain(`SELECT p_user_id, '${category}', ${idParam}, p_cost, clock_timestamp()`)
      expect(body).toContain('FROM purchased')
      expect(body).toContain('SELECT * FROM purchased')
    },
  )

  it.each(PURCHASE_FUNCTIONS)(
    '%s keeps the pre-existing guards (ownership, balance, negative price)',
    (fn, _category, ownedColumn, idParam) => {
      const body = functionBody(fn)
      // Bu uc kontrol 058/063 dersleridir; CTE'ye gecerken kaybolmamali.
      expect(body).toContain(`NOT (${idParam} = ANY(${ownedColumn}))`)
      expect(body).toContain('coin_balance >= p_cost')
      expect(body).toContain("RAISE EXCEPTION 'Gecersiz fiyat: %', p_cost")
      expect(body).toContain('SECURITY DEFINER')
    },
  )

  it.each(PURCHASE_FUNCTIONS)('%s stays service-role only', (fn) => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn}(uuid, text, integer) FROM PUBLIC, anon, authenticated`)
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn}(uuid, text, integer) TO service_role`)
  })

  it('backfills existing ownership without inventing a price or a date', () => {
    // Gercek fiyat/tarih hicbir yerde tutulmadi; uydurmak yerine NULL birakilir.
    // Yalniz backfill bloklari: RPC'lerdeki INSERT'ler de artik sema-nitelenmis
    // oldugu icin desen `FROM public.profiles p, unnest` ile daraltiliyor.
    const backfills =
      sql.match(/INSERT INTO public\.purchase_ledger[\s\S]*?FROM public\.profiles p, unnest[\s\S]*?ON CONFLICT/g) ?? []
    expect(backfills).toHaveLength(5)
    for (const block of backfills) {
      expect(block).toContain('NULL, NULL')
    }
    // Varsayilan (hediye) urunler alim sayilmamali.
    expect(sql).toContain("WHERE item NOT IN ('none', 'gece-mavisi')")
    expect(sql).toContain("WHERE item NOT IN ('none', 'mavi')")
    expect(sql).toContain("WHERE item NOT IN ('none')")
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
