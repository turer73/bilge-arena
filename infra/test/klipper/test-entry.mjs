// Test-only entry point. Not imported by Next or included in production builds.
// Reachable only through the SSH-only gateway; uses real GoTrue password auth.
import http from 'node:http'
import {randomBytes, timingSafeEqual} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createServerClient} from '@supabase/ssr'
const origin='http://localhost:3137'
if(process.env.BILGE_ISOLATED_TEST!=='true' || process.env.NODE_ENV!=='development' || process.env.NEXT_PUBLIC_SUPABASE_URL!==origin) throw new Error('Isolated development stack required')
const env=Object.fromEntries(readFileSync(new URL('.env',import.meta.url),'utf8').trim().split('\n').map(line=>{const p=line.indexOf('=');return [line.slice(0,p),line.slice(p+1)]}))
if(env.TEST_ORIGIN!==origin) throw new Error('Unexpected test origin')
const names=['host','player1','player2']
const cookiePairs=header=>(header||'').split(';').flatMap(v=>{const p=v.indexOf('=');return p<0?[]:[{name:v.slice(0,p).trim(),value:decodeURIComponent(v.slice(p+1))}]})
const serialize=({name,value,options={}})=>`${name}=${encodeURIComponent(value)}; Path=${options.path||'/'}; SameSite=Lax${options.maxAge!==undefined?`; Max-Age=${options.maxAge}`:''}${options.httpOnly?'; HttpOnly':''}`
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Robots-Tag','noindex, nofollow')
  res.setHeader('X-Frame-Options','DENY')
  res.setHeader('Referrer-Policy','same-origin')
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
  if(req.url!=='/__test/login' || req.headers.host!=='localhost:3137') {res.writeHead(404);return res.end()}
  try {
    if(req.method==='GET') {
      const nonce=randomBytes(24).toString('hex')
      res.setHeader('Set-Cookie',`ba_test_csrf=${nonce}; Path=/__test/login; HttpOnly; SameSite=Strict; Max-Age=600`)
      res.setHeader('Content-Type','text/html; charset=utf-8')
      return res.end(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bilge Arena · İzole test</title><style>body{font:18px system-ui;background:#081121;color:#e9efff;max-width:660px;margin:12vh auto;padding:24px}h1{color:#82b7ff}p{line-height:1.6}button,a{display:block;padding:16px;margin:16px 0;background:#245fea;color:white;border:0;border-radius:12px;text-decoration:none;width:100%;box-sizing:border-box}small{color:#adbdd3}</style><h1>Bilge Arena · Test ortamı</h1><p>Klipper üzerindeki bu ortam canlıdan ayrıdır. Yalnız sentetik hesap ve sorular içerir.</p><form method="post"><input type="hidden" name="nonce" value="${nonce}"><button name="account" value="host">Test ev sahibi ile giriş yap</button><button name="account" value="player1">Test oyuncu 1 ile giriş yap</button><button name="account" value="player2">Test oyuncu 2 ile giriş yap</button></form><a href="/arena">Giriş yapmadan arayüzü incele</a><small>Gerçek GoTrue oturumu kullanılır. Google OAuth, kurum sistemi ve tüm ders verileri bu test kapsamına dahil değildir. Oda testi: Denklemler · Kolay · 5 soru. Üç kullanıcı için ayrı tarayıcı profilleri kullan.</small></html>`)
    }
    if(req.method!=='POST' || req.headers.origin!==origin) {res.writeHead(403);return res.end('Forbidden: request origin')}
    let body=''
    for await(const chunk of req) {body+=chunk;if(body.length>4096){res.writeHead(413);return res.end()}}
    const form=new URLSearchParams(body)
    const cookies=cookiePairs(req.headers.cookie)
    const expected=cookies.find(c=>c.name==='ba_test_csrf')?.value||''
    const actual=form.get('nonce')||''
    if(!expected || expected.length!==actual.length || !timingSafeEqual(Buffer.from(expected),Buffer.from(actual)) || !names.includes(form.get('account'))) {res.writeHead(403);return res.end('Forbidden: test form expired')}
    let outputCookies=[]
    const client=createServerClient(origin,env.ANON_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{outputCookies.push(...values)}}})
    const {error}=await client.auth.signInWithPassword({email:`academy-${form.get('account')}@example.test`,password:env.TEST_USER_PASSWORD})
    if(error){res.writeHead(503);return res.end('Test hesabi hazir degil. auth-smoke.mjs calistirilmali.')}
    res.setHeader('Set-Cookie',[...outputCookies.map(serialize),'ba_test_csrf=; Path=/__test/login; HttpOnly; SameSite=Strict; Max-Age=0'])
    res.writeHead(303,{Location:'/arena/matematik?exam_ref=TYT'})
    return res.end()
  } catch {res.writeHead(503);res.end('Test girisi kullanilamiyor.')}
}).listen(3138,'0.0.0.0')
