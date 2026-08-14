'use client'

import {useEffect,useState} from 'react'
import {FileText,Printer} from 'lucide-react'
import {createInstitutionStudentReport,fetchInstitutionStudentReports} from '@/lib/institution-tracking/client'
import type {InstitutionStudentReportMutation,InstitutionStudentReportSnapshot} from '@/lib/institution-tracking/student-report'

const statusCopy={insufficient:'Kanıt yetersiz',developing:'Gelişiyor',mastered:'Güçlü'} as const
function dateLabel(value:string){return new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'long',year:'numeric'}).format(new Date(value))}

export function StudentReportPanel({classroomId,memberRef}:{classroomId:string;memberRef:string}){
  const [reports,setReports]=useState<Array<Omit<InstitutionStudentReportMutation,'replayed'>>>([])
  const [active,setActive]=useState<InstitutionStudentReportSnapshot|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  useEffect(()=>{const controller=new AbortController();queueMicrotask(async()=>{setError(null);try{const next=await fetchInstitutionStudentReports(classroomId,memberRef,controller.signal);if(!controller.signal.aborted)setReports(next.reports)}catch(caught){if(!(caught instanceof DOMException&&caught.name==='AbortError'))setError('Rapor geçmişi alınamadı.')}});return()=>controller.abort()},[classroomId,memberRef])
  useEffect(()=>{if(!active)return;document.body.classList.add('institution-report-print-page');return()=>document.body.classList.remove('institution-report-print-page')},[active])
  async function createReport(){setBusy(true);setError(null);try{const report=await createInstitutionStudentReport(classroomId,memberRef);setReports((current)=>[{reportRef:report.reportRef,snapshot:report.snapshot,createdAt:report.createdAt},...current].slice(0,10));setActive(report.snapshot)}catch{setError('Öğrenci durum raporu oluşturulamadı.')}finally{setBusy(false)}}
  return <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
    <div className="institution-report-screen-only flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 text-lg font-black"><FileText className="h-5 w-5 text-[var(--primary)]"/> Öğrenci durum raporu</h3><p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">O anki doğrulanmış analizin değişmez kopyasıdır; kurum içi takip notlarını ve iletişim bilgilerini içermez.</p></div><button type="button" disabled={busy} onClick={createReport} className="btn-primary min-h-11 w-full rounded-xl px-4 text-sm font-bold disabled:opacity-50 sm:w-auto">{busy?'Hazırlanıyor…':'Rapor oluştur'}</button></div>
    {error&&<p role="alert" className="institution-report-screen-only mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
    {reports.length>0&&<div className="institution-report-screen-only mt-3 flex flex-wrap gap-2">{reports.map((report,index)=><button key={report.reportRef} type="button" onClick={()=>setActive(report.snapshot)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-bold">{index===0?'Son rapor: ':''}{dateLabel(report.createdAt)}</button>)}</div>}
    {active&&<ReportSnapshot snapshot={active}/>} 
  </section>
}

function ReportSnapshot({snapshot}:{snapshot:InstitutionStudentReportSnapshot}){
  function printReport(){document.body.classList.add('institution-report-print-page');try{window.print()}finally{document.body.classList.remove('institution-report-print-page')}}
  return <div className="institution-report-print-root mt-4 rounded-xl border border-white/10 bg-white p-5 text-slate-950 sm:p-8">
    <div className="institution-report-screen-only mb-4 flex justify-end"><button type="button" onClick={printReport} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold"><Printer className="h-4 w-4"/> Yazdır / PDF</button></div>
    <header className="border-b border-slate-300 pb-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Bilge Arena Kurumsal</p><h4 className="mt-1 text-2xl font-black">Öğrenci Durum Raporu</h4><div className="mt-3 grid gap-1 text-sm sm:grid-cols-2"><p><strong>Kurum:</strong> {snapshot.institutionName}</p><p><strong>Sınıf:</strong> {snapshot.classroomName}</p><p><strong>Öğrenci:</strong> {snapshot.studentAlias}</p><p><strong>Öğretmen:</strong> {snapshot.teacherAlias}</p><p><strong>Dönem:</strong> {dateLabel(snapshot.periodStart)} – {dateLabel(snapshot.periodEnd)}</p><p><strong>Kapsam:</strong> TYT Matematik</p></div></header>
    <div className="mt-5 grid grid-cols-2 gap-2 text-center sm:grid-cols-4"><Metric label="Ölçülen" value={snapshot.summary.assessedOutcomeCount}/><Metric label="Güçlü" value={snapshot.summary.masteredOutcomeCount}/><Metric label="Gelişiyor" value={snapshot.summary.developingOutcomeCount}/><Metric label="Kanıt yetersiz" value={snapshot.summary.insufficientOutcomeCount}/></div>
    <div className="mt-6"><h5 className="text-lg font-black">Kazanım durumu</h5><p className="mt-1 text-xs text-slate-600">Kanıtı yetersiz alanlar başarısızlık olarak değerlendirilmemiştir.</p><div className="mt-3 space-y-2">{snapshot.outcomes.map((outcome,index)=><article key={`${outcome.title}-${index}`} className="break-inside-avoid rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{outcome.path.slice(1,3).join(' › ')}</p><p className="font-bold">{outcome.title}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{statusCopy[outcome.status]}</span></div><p className="mt-2 text-xs text-slate-600">Skor: {outcome.score===null?'—':`%${outcome.score}`} · Kanıt: {outcome.evidenceCount} · Bağımsız oturum: {outcome.independentEvidenceCount}</p></article>)}</div></div>
    <footer className="mt-6 border-t border-slate-300 pt-3 text-xs text-slate-500">Bu rapor {dateLabel(snapshot.generatedAt)} tarihinde doğrulanmış öğrenme kanıtlarından oluşturulmuştur. Otomatik karar veya öğretmen sıralaması içermez.</footer>
  </div>
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-lg border border-slate-200 p-3"><strong className="block text-xl">{value}</strong><span className="text-xs text-slate-600">{label}</span></div>}
