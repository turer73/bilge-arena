// Real GoTrue password sessions for synthetic accounts, not OAuth/callback evidence.
import assert from 'node:assert/strict'
import {readFileSync, writeFileSync} from 'node:fs'
import {createServerClient} from '@supabase/ssr'
const env = Object.fromEntries(readFileSync(new URL('.env', import.meta.url),'utf8').trim().split('\n').map(line=>{const p=line.indexOf('=');return [line.slice(0,p),line.slice(p+1)]}))
assert.equal(env.TEST_ORIGIN, 'http://localhost:3137')
assert.equal(process.env.BILGE_ARENA_RPC_URL, 'http://rooms-rest:3000')
const serviceHeaders={Authorization:`Bearer ${env.SERVICE_ROLE_KEY}`, 'Content-Type':'application/json'}
async function request(url,options={}) {
  const res=await fetch(url,{...options,signal:AbortSignal.timeout(20000)})
  const body=await res.text()
  if(!res.ok) throw new Error(`${new URL(url).pathname}: HTTP ${res.status} ${body.slice(0,180)}`)
  return body ? JSON.parse(body) : null
}
const existing=await request('http://auth:9999/admin/users',{headers:serviceHeaders})
const sessions=[]
const gameSchema=process.argv.includes('--game-schema')
for (const [i,name] of ['host','player1','player2'].entries()) {
  const email=`academy-${name}@example.test`
  if(!existing.users.some(u=>u.email===email)) await request('http://auth:9999/admin/users',{method:'POST',headers:serviceHeaders,body:JSON.stringify({email,password:env.TEST_USER_PASSWORD,email_confirm:true,user_metadata:{full_name:`Test ${name}`}})})
  const session=await request('http://auth:9999/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:env.TEST_USER_PASSWORD})})
  assert.equal(session.user.email,email)
  const headers={Authorization:`Bearer ${session.access_token}`}
  if(gameSchema) {
    const direct=await fetch('http://auth-rest:3000/profiles?select=id',{headers})
    assert.equal(direct.status,403,'Full app uses route-only profile reads (migration 049)')
  } else {
    const profiles=await request('http://auth-rest:3000/profiles?select=id,role,deleted_at',{headers})
    assert.equal(profiles.length,1,'RLS must expose only own profile')
    assert.equal(profiles[0].id,session.user.id)
    assert.equal(profiles[0].role,'user')
  }
  const denied=await fetch(`http://auth-rest:3000/profiles?id=eq.${session.user.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({total_xp:999,role:'admin'})})
  assert.equal(denied.status,403,'Privilege/XP write must fail')
  let cookies=[]
  const client=createServerClient(env.TEST_ORIGIN,env.ANON_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{cookies=values}}})
  const {error}=await client.auth.setSession(session)
  assert.equal(error,null)
  if(gameSchema) {
    const profile=await request(`${env.TEST_ORIGIN}/api/profile`,{headers:{Cookie:cookies.map(c=>`${c.name}=${encodeURIComponent(c.value)}`).join('; ')}})
    assert.equal(profile.profile.id,session.user.id)
    assert.equal(profile.profile.role,'user')
    assert.equal(profile.isAdmin,false)
  }
  sessions.push({...session,cookies})
  console.log(`PASS synthetic account ${i+1}: real auth, ${gameSchema?'route-only own profile':'own-profile RLS'}, privilege denial`)
}
const anon=await fetch('http://auth-rest:3000/profiles?select=id',{headers:{Authorization:`Bearer ${env.ANON_KEY}`}})
assert.equal(anon.status,401)
// Tokens stay in this server-only 0600 file; do not include it in Git or tool output.
writeFileSync(new URL('test-sessions.json',import.meta.url),JSON.stringify(sessions),{mode:0o600})
console.log('PASS anonymous profile access denied; 3 test sessions stored privately')
