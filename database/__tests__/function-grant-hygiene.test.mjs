import { describe, expect, it } from 'vitest'
import {
  lintFunctionGrantHygiene,
  revokedFunctionSignatures,
  securityDefinerFunctions,
} from '../lint-function-grants.mjs'

describe('SECURITY DEFINER migration hygiene', () => {
  it('finds fixed-path privileged functions and explicit revokes', () => {
    const sql = `
      CREATE FUNCTION public.secure_example() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN END $$;
      REVOKE ALL ON FUNCTION public.secure_example() FROM PUBLIC, anon;
    `
    expect(securityDefinerFunctions(sql)).toEqual([{
      name: 'secure_example', signature: 'secure_example()', fixedSearchPath: true,
    }])
    expect([...revokedFunctionSignatures(sql)]).toEqual(['secure_example()'])
  })

  it('does not let a revoke for one overload cover another signature', () => {
    const sql = `
      CREATE FUNCTION public.secure_example() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN END $$;
      CREATE FUNCTION public.secure_example(p_user_id uuid) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN END $$;
      REVOKE ALL ON FUNCTION public.secure_example() FROM PUBLIC, anon;
    `
    const definitions = securityDefinerFunctions(sql)
    expect(definitions.map((definition) => definition.signature)).toEqual([
      'secure_example()', 'secure_example(uuid)',
    ])
    expect([...revokedFunctionSignatures(sql)]).toEqual(['secure_example()'])
  })

  it('keeps the migration stream free of post-136 regressions', () => {
    expect(lintFunctionGrantHygiene()).toEqual([])
  })
})
