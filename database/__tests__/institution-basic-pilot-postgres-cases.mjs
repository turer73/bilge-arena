import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'

export function registerBasicPilotTests(context, migration) {
  it('opens only an explicitly approved basic pilot and retains actor, quota, replay and kill-switch guards', async () => {
    const { client, platformAdmin, managerOne } = context()
    // The historical suite deliberately replays migration 167. Restore the
    // current policy and verify a migration retry opens nothing by itself.
    await client.query(migration)
    await client.query(migration)
    expect((await client.query("SELECT enabled FROM public.institution_pilot_controls WHERE control_key='free_provisioning'")).rows[0].enabled).toBe(false)
    await client.query('BEGIN')
    const bad = async (action, code) => {
      await client.query('SAVEPOINT expected_failure')
      let error
      try { await action() } catch (caught) { error = caught }
      await client.query('ROLLBACK TO SAVEPOINT expected_failure')
      await client.query('RELEASE SAVEPOINT expected_failure')
      expect(error?.code).toBe(code)
    }
    const open = () => client.query("UPDATE public.institution_pilot_controls SET enabled=true WHERE control_key='free_provisioning'")
    const setting = (key, value) => client.query('SELECT set_config($1,$2,true)', [key, value])
    const call = async (actor, args, aal = 'aal2', role = 'authenticated') => {
      await client.query(`SET LOCAL ROLE ${role}`)
      await setting('app.uid', actor)
      await setting('request.jwt.claims', JSON.stringify({ sub: actor, aal }))
      const result = await client.query('SELECT public.provision_free_pilot_institution($1,$2,$3,$4,$5::smallint,$6::smallint,$7::smallint,$8) AS result', args)
      await client.query('RESET ROLE')
      return result.rows[0].result
    }
    try {
      const before = (await client.query('SELECT count(*)::int AS n FROM public.institution_free_pilot_readiness_consumptions')).rows[0].n
      const manager = randomUUID()
      await client.query('INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$2)', [manager, 'basic-manager'])
      await client.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())', [manager, 'basic-manager@example.com'])
      const args = [platformAdmin, 'Basic Test Kurumu', manager, 'PILOT-BASIC-TEST', 30, 2, 30, randomUUID()]
      await setting('app.institution_control_change_ref', '')
      await setting('app.institution_onboarding_mode', 'basic')
      await bad(open, '22023')
      await setting('app.institution_control_change_ref', 'BASIC-TEST-OPEN')
      await setting('app.institution_onboarding_mode', 'typo')
      await bad(open, '22023')
      await setting('app.institution_onboarding_mode', '')
      await setting('app.institution_readiness_ref', '')
      await bad(open, '55000') // comprehensive is still the default
      await setting('app.institution_onboarding_mode', 'basic')
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await bad(async () => { await client.query(`SET LOCAL ROLE ${role}`); await open() }, '42501')
      }
      await open()
      expect((await client.query("SELECT onboarding_mode,readiness_ref FROM public.institution_pilot_control_events WHERE change_reference='BASIC-TEST-OPEN'")).rows[0])
        .toEqual({ onboarding_mode: 'basic', readiness_ref: null })
      await bad(() => call(platformAdmin, args, 'aal1'), '42501')
      await bad(() => call(platformAdmin, args, 'aal2', 'service_role'), '42501')
      await bad(() => call(managerOne, args), '42501')
      await bad(() => call(platformAdmin, [...args.slice(0, 4), 41, 2, 30, randomUUID()]), '22023')
      await bad(() => call(platformAdmin, [platformAdmin, args[1], managerOne, args[3], 30, 2, 30, randomUUID()]), '23505')
      // Request GUC cannot select the policy: creation uses the persisted event.
      await setting('app.institution_onboarding_mode', 'comprehensive')
      const created = await call(platformAdmin, args)
      expect(created).toMatchObject({ replayed: false, institution: { name: args[1], studentLimit: 30, staffLimit: 2 } })
      expect(await call(platformAdmin, args)).toMatchObject({ replayed: true, institution: { id: created.institution.id } })
      await bad(() => call(platformAdmin, [...args.slice(0, 7), randomUUID()]), '23505')
      expect((await client.query('SELECT count(*)::int AS n FROM public.institution_free_pilot_readiness_consumptions')).rows[0].n).toBe(before)
      await setting('app.institution_control_change_ref', 'BASIC-TEST-CLOSE')
      await client.query("UPDATE public.institution_pilot_controls SET enabled=false WHERE control_key='free_provisioning'")
      expect(await call(platformAdmin, args)).toMatchObject({ replayed: true })
      await bad(() => call(platformAdmin, [...args.slice(0, 7), randomUUID()]), '55000')
      await setting('app.institution_control_change_ref', 'BASIC-TEST-STRICT')
      await bad(open, '55000') // strict mode cannot borrow the old basic approval
      // Commercial gate is still closed even with a basic session setting.
      await setting('app.institution_onboarding_mode', 'basic')
      expect((await client.query("SELECT enabled FROM public.institution_pilot_controls WHERE control_key='commercial_provisioning'")).rows[0].enabled).toBe(false)
    } finally {
      await client.query('ROLLBACK')
      await client.query('RESET ROLE')
    }
  }, 30_000)
}
