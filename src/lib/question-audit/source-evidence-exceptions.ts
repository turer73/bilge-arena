import { z } from 'zod'
import type { SourceComparison } from './source-comparison'
import type { QuestionDraft } from './types'

const id = z.string().trim().min(1).max(120)
const text = z.string().trim().min(10).max(4000)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(v + 'T00:00:00Z')
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0,10) === v
}, 'Real Gregorian date required')
export const MGM_REGIONS = ['Karadeniz Bölgesi','Akdeniz Bölgesi','Marmara Bölgesi','Ege Bölgesi',
  'Doğu Anadolu Bölgesi','İç Anadolu Bölgesi','Güneydoğu Anadolu Bölgesi'] as const
const event = z.object({name:text,date,sourceIds:z.array(id).min(1).max(5)}).strict()

// A sidecar declaration, never an authorization. reportSnapshot deliberately
// includes the whole original report: neither contrary evidence nor changed
// locators can be omitted while reusing the same exception.
export const sourceEvidenceExceptionSchema = z.object({
  version:z.literal('source-evidence-exception@1'),
  reportSnapshot:z.unknown(),
  revisionEvidenceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
  rationale:text,
  basis:z.discriminatedUnion('kind',[
    z.object({
      kind:z.literal('mgm_regional_normal_maximum@1'),sourceId:id,
      claimIds:z.array(id).min(1).max(20),periodStart:z.literal(1991),periodEnd:z.literal(2020),
      statistic:z.literal('annual_areal_precipitation_mean'),unit:z.literal('tenths_mm'),
      values:z.array(z.object({region:z.enum(MGM_REGIONS),value:z.number().int().min(0).max(500000)}).strict()).length(7),
    }).strict(),
    z.object({
      kind:z.literal('dated_record_order@1'),claimIds:z.array(id).min(1).max(2),
      contradictingSourceIds:z.array(id).min(1).max(5),calendar:z.literal('gregorian'),
      earlier:event,later:event,conclusion:z.literal('earlier_precedes_later'),
    }).strict(),
  ]),
}).strict()
export type SourceEvidenceException = z.infer<typeof sourceEvidenceExceptionSchema>

function canonical(value:unknown):string {
  const normalize=(v:unknown):unknown => Array.isArray(v)?v.map(normalize)
    : v!==null && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,normalize(x)])):v
  return JSON.stringify(normalize(value))
}
const archivalHosts = new Set(['history.state.gov','api.parliament.uk','hansard.parliament.uk',
  'archivesdiplomatiques.diplomatie.gouv.fr','gallica.bnf.fr','archivesetmanuscrits.bnf.fr',
  'www.rct.uk','rct.uk','www.icj-cij.org','icj-cij.org'])
// Public UN ICC-hosted court archive. This is a dated records index (not the
// full 1856 protocol); only this inspected annex is allowed on the mirror host.
const courtAnnex = 'https://icj-web.leman.un-icc.cloud/sites/default/files/permanent-court-of-international-justice/serie_B/B_14/05_Commission_europeenne_du_Danube_Annexe.pdf'

/** Semantic checks only; PostgreSQL must separately record actual owner acceptance. */
export function evaluateSourceEvidenceException(draft:QuestionDraft, report:SourceComparison, input:unknown, rawReport:unknown=report) {
  const parsed=sourceEvidenceExceptionSchema.safeParse(input)
  const denied=(reason:string)=>({valid:false,reason,singleSourceClaims:[] as string[],resolvedContradictions:[] as string[]})
  if(!parsed.success)return denied('EXCEPTION_SCHEMA')
  const doc=parsed.data,b=doc.basis
  if(report.format!=='source-comparison@2' || report.curriculumBinding?.examRef!=='TYT'
    || report.curriculumBinding.examYear!==2027 || draft.examRef!=='TYT'
    || !['tarih','cografya'].includes(draft.subject))return denied('EXCEPTION_SCOPE')
  // Compare the exact submitted document, not Zod's trimmed interpretation.
  if(canonical(doc.reportSnapshot)!==canonical(rawReport))return denied('EXCEPTION_REPORT_DRIFT')
  if(report.questionId!==draft.questionId||report.revisionId!==draft.revisionId||report.contentSha256!==draft.contentSha256)return denied('EXCEPTION_IDENTITY')
  const sources=new Map(report.sources.map(s=>[s.id,s]))
  const usable=(sourceId:string)=>{const s=sources.get(sourceId);return !!s && s.access==='inspected_section' && !!s.retrievalRef && !!s.retrievedTextSha256}
  const supports=(claim:SourceComparison['claims'][number],sourceId:string)=>claim.evidence.some(e=>e.sourceId===sourceId&&e.relation==='supports'&&e.scopeMatch)&&usable(sourceId)
  if(b.kind==='mgm_regional_normal_maximum@1'){
    if(draft.subject!=='cografya'||!usable(b.sourceId))return denied('PRIMARY_SOURCE_UNAVAILABLE')
    const url=new URL(sources.get(b.sourceId)!.url)
    if(url.hostname!=='www.mgm.gov.tr'&&url.hostname!=='mgm.gov.tr')return denied('PRIMARY_PUBLISHER')
    if(new Set(b.values.map(v=>v.region)).size!==7 || new Set(b.claimIds).size!==b.claimIds.length)return denied('DATASET_DUPLICATE')
    const max=Math.max(...b.values.map(v=>v.value)),winners=b.values.filter(v=>v.value===max)
    if(winners.length!==1||draft.options[draft.markedAnswerIndex]!==winners[0].region)return denied('DATASET_KEY_OR_TIE')
    if(draft.options.length!==5||new Set(draft.options).size!==5||draft.options.some(o=>!b.values.some(v=>v.region===o)))return denied('DATASET_OPTION_COVERAGE')
    if(report.claims.some(c=>c.evidence.some(e=>e.relation==='contradicts')))return denied('PRIMARY_DATASET_CONTRADICTION')
    for(const claimId of b.claimIds){const c=report.claims.find(c=>c.id===claimId)
      if(!c||c.target==='curriculum'||!supports(c,b.sourceId))return denied('PRIMARY_CLAIM_BINDING')
    }
    return {valid:true,reason:null,singleSourceClaims:b.claimIds,resolvedContradictions:[] as string[]}
  }
  if(draft.subject!=='tarih'||b.earlier.date>=b.later.date)return denied('CHRONOLOGY_ORDER')
  const claims=b.claimIds.map(id=>report.claims.find(c=>c.id===id))
  if(claims.some(c=>!c||!['stem','solution'].includes(c.target))||new Set(b.claimIds).size!==b.claimIds.length
    ||new Set(b.contradictingSourceIds).size!==b.contradictingSourceIds.length)return denied('CHRONOLOGY_CLAIM')
  const resolvedContradictions:string[]=[]
  for(const claim of claims){
  if(!claim)return denied('CHRONOLOGY_CLAIM')
  for(const sourceId of b.contradictingSourceIds){
    if(!usable(sourceId)||!claim.evidence.some(e=>e.sourceId===sourceId&&e.relation==='contradicts'&&e.scopeMatch))return denied('CONTRARY_SOURCE_NOT_RETAINED')
  }
  const records=[...b.earlier.sourceIds,...b.later.sourceIds]
  if(new Set(records).size!==records.length)return denied('CHRONOLOGY_DUPLICATE_RECORD')
  for(const sourceId of records){const s=sources.get(sourceId)
    if(!s||!supports(claim,sourceId)||(!archivalHosts.has(new URL(s.url).hostname)&&s.url!==courtAnnex)
      ||b.contradictingSourceIds.includes(sourceId))return denied('CHRONOLOGY_PRIMARY_RECORD')
  }
  resolvedContradictions.push(...b.contradictingSourceIds.map(s=>claim.id+':'+s))
  }
  return {valid:true,reason:null,singleSourceClaims:[] as string[],resolvedContradictions}
}
