import {describe,it,expect} from 'vitest'; import {readdirSync,readFileSync} from 'node:fs'; import {dirname,join} from 'node:path'; import {fileURLToPath} from 'node:url';
// Supabase pgcrypto'yu `extensions` semasina kurar, `public`e DEGIL. Tek kullanimlik
// PostgreSQL testlerinde pgcrypto genelde `public`e dustugu icin `public.digest(...)`
// orada calisir ama uretimde `42883 function public.digest does not exist` verir.
// 104/105'te bunlar kolon DEFAULT ifadesi oldugundan hata apply-time'dir ve tum
// bundle'i geri aldirir. Bu yuzden kripto cagrilari sema-nitelenmis olmalidir.
const dir=join(dirname(fileURLToPath(import.meta.url)),'..','migrations');
const files=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
describe('migration extension schema qualification',()=>{
 it('has migrations to scan',()=>{expect(files.length).toBeGreaterThan(100)});
 it('never calls pgcrypto through the public schema',()=>{
  const ihlaller=files.flatMap(f=>{const sql=readFileSync(join(dir,f),'utf8');return [...sql.matchAll(/public\.(digest|gen_random_bytes|hmac|crypt|pgp_[a-z_]+)\s*\(/g)].map(m=>`${f}: public.${m[1]}(`)});
  expect(ihlaller).toEqual([]);
 });
 it('calls gen_random_uuid without a schema so pg_catalog resolves it',()=>{
  const ihlaller=files.flatMap(f=>{const sql=readFileSync(join(dir,f),'utf8');return [...sql.matchAll(/public\.gen_random_uuid\s*\(/g)].map(()=>`${f}: public.gen_random_uuid(`)});
  expect(ihlaller).toEqual([]);
 });
 it('keeps the crypto calls that exist pointed at extensions',()=>{
  const sql100=readFileSync(join(dir,'100_verified_exam_strategy_experiments.sql'),'utf8');
  const sql105=readFileSync(join(dir,'105_teacher_classroom_privacy.sql'),'utf8');
  const sql106=readFileSync(join(dir,'106_question_content_governance.sql'),'utf8');
  expect(sql100).toMatch(/extensions\.digest\(/);expect(sql100).toMatch(/extensions\.gen_random_bytes\(32\)/);
  expect(sql105).toMatch(/encode\(extensions\.gen_random_bytes\(16\), 'hex'\)/);expect(sql105).toMatch(/extensions\.digest\(convert_to\(/);
  expect(sql106).toMatch(/extensions\.digest\(/);
 });
});
