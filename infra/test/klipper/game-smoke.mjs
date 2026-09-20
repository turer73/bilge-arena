// Run INSIDE the dedicated test app, after auth-smoke.mjs --game-schema.
// Real Next API calls with private synthetic cookies. Never prints tokens.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
const origin='http://localhost:3137'
assert.equal(process.env.BILGE_ISOLATED_TEST,'true')
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,origin)
assert.equal(process.env.BILGE_ARENA_RPC_URL,'http://rooms-rest:3000')
const sessions=JSON.parse(readFileSync(new URL('test-sessions.json',import.meta.url),'utf8'))
assert.equal(sessions.length,3)
const cookies=sessions.map(s=>s.cookies.map(c=>`${c.name}=${encodeURIComponent(c.value)}`).join('; '))
async function api(path,user=0,body,expected=200) {
  const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookies[user],Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)})
  assert.equal(res.status,expected,`${path}: expected ${expected}, got ${res.status}`)
  return res.json()
}
async function row(table,query) {
  const res=await fetch(`http://auth-rest:3000/${table}?${query}`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}})
  assert.equal(res.status,200,`${table} persisted read`)
  return res.json()
}
const anon=await fetch(origin+'/api/questions/random?game=matematik')
assert.equal(anon.status,401)
const before=await Promise.all(cookies.map((_,i)=>api('/api/profile',i)))
const results=[]
for(const [index,[mode,count]] of [['classic',10],['blitz',5],['marathon',20],['boss',5],['practice',10],['deneme',40]].entries()) {
  const user=index%3
  const data=await api(`/api/questions/random?game=matematik&examRef=TYT&category=sayilar&mode=${mode}&limit=${count}`,user)
  assert.ok(data.attemptId)
  assert.ok(data.questions.length>=count)
  const questions=data.questions.slice(0,count)
  assert.ok(questions.every(q=>q.content.question.startsWith('[Test sorusu]')),'Only synthetic data')
  for(const q of questions) for(const key of ['answer','correct','solution','explanation','hint']) assert.equal(key in q.content,false,`No ${key} before submission`)
  if(index===0) await api('/api/questions/grade',(user+1)%3,{attemptId:data.attemptId,questionId:questions[0].id,selectedOption:0},403)
  const answers=[]
  for(const [i,q] of questions.entries()) {
    // The synthetic math generator rotates answer index with difficulty.
    const correct=q.difficulty-1
    const selected=i===0?(correct+1)%5:correct
    const grade=await api('/api/questions/grade',user,{attemptId:data.attemptId,questionId:q.id,selectedOption:selected})
    assert.equal(grade.isCorrect,i!==0)
    assert.equal(grade.correctOption,correct)
    assert.ok(grade.solution.length>0)
    answers.push({questionId:q.id,selectedOption:selected,isCorrect:grade.isCorrect,timeTaken:5})
  }
  const payload={attemptId:data.attemptId,game:'matematik',mode,category:'sayilar',answers,clientRequestId:randomUUID()}
  const result=await api('/api/sessions',user,payload)
  assert.equal(result.correctCount,count-1)
  assert.equal(result.wrongCount,1)
  const persisted=await row('game_sessions',`select=id,status,total_questions,total_xp,mode&id=eq.${result.sessionId}`)
  assert.equal(persisted.length,1)
  assert.equal(persisted[0].status,'completed')
  assert.equal(persisted[0].total_questions,count)
  assert.equal(persisted[0].total_xp,result.totalXP)
  const answerRows=await row('session_answers',`select=id&session_id=eq.${result.sessionId}`)
  assert.equal(answerRows.length,count)
  if(index<3) {
    const firstProfile=await api('/api/profile',user)
    const replay=await api('/api/sessions',user,payload)
    assert.equal(replay.sessionId,result.sessionId)
    assert.equal(replay.totalXP,result.totalXP)
    const replayProfile=await api('/api/profile',user)
    for(const key of ['total_xp','coin_balance','total_sessions','total_questions']) assert.equal(replayProfile.profile[key],firstProfile.profile[key],`Replay must not change ${key}`)
  }
  results.push({mode,questions:count,correct:result.correctCount,xp:result.totalXP,coins:result.coinsEarned})
  console.log('PASS '+JSON.stringify(results.at(-1)))
}
for(let i=0;i<3;i++) {
  const after=await api('/api/profile',i)
  assert.equal(after.profile.total_sessions,before[i].profile.total_sessions+2)
}
for(const [game,category] of [['turkce','paragraf'],['fen','fizik'],['sosyal','tarih'],['wordquest','vocabulary']]) {
  const query=new URLSearchParams({game,category,mode:'classic',limit:'10',...(game==='wordquest'?{}:{examRef:'TYT'})})
  const data=await api('/api/questions/random?'+query,0)
  assert.ok(data.attemptId && data.questions.length>=10)
  console.log(`PASS question issuance: ${game}/${category}`)
}
console.log('PASS 6 completed modes / 90 persisted answers / 3 reward-safe replays / 4 other subject pools / auth boundary')
