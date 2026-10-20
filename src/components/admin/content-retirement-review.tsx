'use client'

import { useEffect, useRef, useState } from 'react'
import { retirementEvidenceSchema, retirementReviewInputSchema, retirementReviewResultSchema, retirementReviewStatusSchema, type RetirementReviewStatus } from '@/lib/content-governance/retirement-review-contract'

type ReviewProps={revisionId:string;questionId:string;onRefresh:()=>Promise<void>;onAccepted:(accepted:boolean)=>void}
export function ContentRetirementReview(props:ReviewProps){
  return <RetirementReview key={props.revisionId+':'+props.questionId} {...props}/>
}
function RetirementReview({revisionId,questionId,onRefresh,onAccepted}:ReviewProps){
  const [status,setStatus]=useState<RetirementReviewStatus|null>(null)
  const [evidence,setEvidence]=useState<unknown>(null)
  const [fileName,setFileName]=useState('')
  const [agent,setAgent]=useState('')
  const [rationale,setRationale]=useState('')
  const [responsibility,setResponsibility]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const generation=useRef(0)
  const attempt=useRef<{payload:string;requestId:string}|null>(null)
  const acceptedRef=useRef(onAccepted)
  useEffect(()=>{acceptedRef.current=onAccepted},[onAccepted])
  useEffect(()=>{
    const controller=new AbortController();const current=++generation.current
    void fetch(`/api/admin/content-quality/revisions/${revisionId}/retirement-review`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('Tek yetkili pasife alma kabulü bu ortamda kullanılamıyor')
        const parsed=retirementReviewStatusSchema.safeParse(await response.json())
        if(!parsed.success||parsed.data.revisionId!==revisionId)throw Error('Kabul durumu doğrulanamadı')
        if(!controller.signal.aborted&&generation.current===current){setStatus(parsed.data);acceptedRef.current(parsed.data.accepted)}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Kabul durumu alınamadı')})
    return()=>{controller.abort();generation.current=0}
  },[revisionId])
  const upload=async(file:File|undefined)=>{
    const current=++generation.current;setEvidence(null);setFileName('');setResponsibility(false);attempt.current=null
    if(!file)return
    try{
      if(file.size>32_768)throw Error('Pasife alma kanıtı 32 KB sınırını aşıyor')
      const parsed=retirementEvidenceSchema.safeParse(JSON.parse(await file.text()))
      if(!parsed.success||parsed.data.revisionId!==revisionId||parsed.data.questionId!==questionId)throw Error('Kanıt bu soru ve revizyona ait değil veya eksik')
      if(generation.current===current){setEvidence(parsed.data);setFileName(file.name);setError('')}
    }catch(cause){if(generation.current===current)setError(cause instanceof Error?cause.message:'Kanıt okunamadı')}
  }
  const parsedEvidence=retirementEvidenceSchema.safeParse(evidence)
  const accept=async()=>{
    if(!status?.canAccept||!parsedEvidence.success)return
    const evidence=parsedEvidence.data
    const payload={acceptanceMode:'ai_assisted_owner_retirement' as const,evidence,rationale,preparation:{
      version:'ai-preparation-declaration@1' as const,agent,evidenceRef:evidence.evidenceRef,evidenceSha256:evidence.evidenceSha256,
      revisionEvidenceFingerprint:status.evidenceFingerprint,acknowledgesNonIndependentReview:responsibility,acceptsResponsibility:responsibility,
    }}
    const serialized=JSON.stringify(payload)
    if(attempt.current?.payload!==serialized)attempt.current={payload:serialized,requestId:crypto.randomUUID()}
    const input=retirementReviewInputSchema.safeParse({...payload,requestId:attempt.current.requestId})
    if(!input.success){setError('Kanıt, hazırlayan araç, gerekçe ve açık sorumluluk beyanı gerekli');return}
    const current=generation.current;setBusy(true);setError('')
    try{
      const response=await fetch(`/api/admin/content-quality/revisions/${revisionId}/retirement-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input.data)})
      const result=await response.json().catch(()=>null)
      if(!response.ok)throw Error(result?.error??'Kabul kaydedilemedi; sonucu yenileyerek kontrol edin')
      const parsed=retirementReviewResultSchema.safeParse(result)
      if(!parsed.success||parsed.data.revisionId!==revisionId||parsed.data.questionId!==questionId)throw Error('Kabul sonucu doğrulanamadı; durumu yenileyin')
      if(generation.current===current){acceptedRef.current(true);await onRefresh()}
    }catch(cause){if(generation.current===current)setError(cause instanceof Error?cause.message:'Kabul kaydedilemedi')}
    finally{if(generation.current===current)setBusy(false)}
  }
  const publish=async()=>{
    if(!status?.accepted||!status.readyToPublish)return
    const current=generation.current;setBusy(true);setError('')
    try{
      const response=await fetch(`/api/admin/content-quality/revisions/${revisionId}/publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID()})})
      const result=await response.json().catch(()=>null)
      if(!response.ok)throw Error(result?.error??'Pasife alma tamamlanamadı')
      if(result?.revisionId!==revisionId||result?.status!=='published')throw Error('Pasife alma sonucu doğrulanamadı')
      if(generation.current===current)await onRefresh()
    }catch(cause){if(generation.current===current)setError(cause instanceof Error?cause.message:'Pasife alma tamamlanamadı')}
    finally{if(generation.current===current)setBusy(false)}
  }
  return <section aria-label="Tek yetkili pasife alma incelemesi" className="w-full space-y-3 rounded-lg border border-[var(--border)] p-3 text-xs">
    <h3 className="font-bold">AI hazırlığı için tek yetkili pasife alma kabulü</h3>
    <p>Bu kabul bağımsız insan incelemesi değildir. Sorunun neden kaldırılacağını ve yinelenen sorularda hangi kaydın korunacağını inceleyerek sorumluluğu siz üstlenirsiniz. Kabulün kaydedilmesi soruyu pasife almaz.</p>
    {error&&<p role="alert">{error}</p>}
    {status?.canAccept&&<>
      <label className="block">Pasife alma kanıtı (JSON)<input type="file" accept=".json,application/json" disabled={busy} onChange={event=>void upload(event.target.files?.[0])} className="mt-1 block"/></label>
      <p>{fileName||'Soruya bağlı kaldırma gerekçesi ve varsa korunacak kaydın bilgileri gerekli.'}</p>
      {parsedEvidence.success&&<div className="rounded border p-2"><p>Gerekçe: {({duplicate:'Yinelenen kayıt',invalid_content:'Geçersiz içerik',out_of_curriculum:'Müfredat kapsamı dışında'})[parsedEvidence.data.reason]}</p><p>Kanıt kaydı: {parsedEvidence.data.evidenceRef}</p>{parsedEvidence.data.survivor&&<details><summary>Korunacak sorunun kimliği</summary><p className="break-all">{parsedEvidence.data.survivor.questionId}</p></details>}</div>}
      <label className="block">Hazırlayan AI veya araç<input value={agent} maxLength={120} disabled={busy} onChange={event=>{setAgent(event.target.value);setResponsibility(false)}} className="mt-1 block w-full rounded border p-2"/></label>
      <label className="block">İnceleme gerekçeniz<textarea value={rationale} maxLength={1000} disabled={busy} onChange={event=>{setRationale(event.target.value);setResponsibility(false)}} className="mt-1 block w-full rounded border p-2"/></label>
      <label className="flex min-h-11 items-start gap-2"><input type="checkbox" checked={responsibility} disabled={busy} onChange={event=>setResponsibility(event.target.checked)}/>Kaldırma gerekçesini ve varsa korunacak soruyu inceledim. Bunun bağımsız insan incelemesi olmadığını biliyorum; bu kabulün sorumluluğunu üstleniyorum.</label>
      <button disabled={busy||!parsedEvidence.success||!agent.trim()||!rationale.trim()||!responsibility} onClick={()=>void accept()} className="min-h-11 rounded bg-[var(--focus)] px-4 font-bold text-white disabled:opacity-50">Pasife alma kabulünü kaydet</button>
    </>}
    {status?.accepted&&<p>Tek yetkili pasife alma kabulü kayıtlı; bağımsız insan incelemesi değildir. {status.readyToPublish?'Ayrı pasife alma işlemi yapılabilir.':'Kanıt veya mevcut yayın tabanı değişmiş olabilir; tekrar kontrol gerekli.'}</p>}
    {status?.accepted&&status.readyToPublish&&<button disabled={busy} onClick={()=>void publish()} className="min-h-11 rounded bg-[var(--urgency)] px-4 font-bold text-white disabled:opacity-50">Kabul edilen revizyonu pasife al</button>}
  </section>
}
