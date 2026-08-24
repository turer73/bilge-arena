import { describe, expect, it } from 'vitest'
import {
  lintFunctionGrantHygiene,
  revokedFunctionNames,
  securityDefinerFunctions,
} from '../lint-function-grants.mjs'

describe('SECURITY DEFINER migration hygiene', () => {
  it('finds fixed-path privileged functions and explicit revokes', () => {
    const sql = `
      CREATE FUNCTION public.secure_example() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN END $$;
      REVOKE ALL ON FUNCTION public.secure_example() FROM PUBLIC, anon;
    `
    expect(securityDefinerFunctions(sql)).toEqual([{ name: 'secure_example', fixedSearchPath: true }])
    expect([...revokedFunctionNames(sql)]).toEqual(['secure_example'])
  })

  it('keeps the migration stream free of post-136 regressions', () => {
    expect(lintFunctionGrantHygiene()).toEqual([])
  })
})
