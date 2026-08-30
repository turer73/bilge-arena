import { describe, expect, it } from 'vitest'
import { buildGuardianStatusEmailDraft } from '../guardian-email-draft'

function outcome(code:string,title:string,status:'insufficient'|'developing'|'mastered',score:number|null){const count=status==='insufficient'?0:6;return{code,nodeCode:`node-${code}`,path:['TYT Matematik','Sayılar','Temel',title],title,category:'sayilar',assessment:{outcomeCode:code,status,score,confidence:status==='insufficient'?'insufficient':'medium',evidence:{evidenceCount:count,independentEvidenceCount:status==='insufficient'?0:3,firstEvidenceAt:count?'2026-08-02T10:00:00.000Z':null,lastEvidenceAt:count?'2026-08-12T10:00:00.000Z':null,windowStart:'2026-08-01T09:00:00.000Z',windowEnd:'2026-08-14T09:00:00.000Z',modelVersion:'institution-evidence-v1',taxonomyVersion:'ba-tyt-math-v1',coverageSupported:true}},details:{correctEvidenceCount:4,delayedCorrectCount:1,rawAccuracy:score??0,difficultyAccuracy:score??0,hintRate:0,fastWrongRate:0,components:{accuracy:score??0,delayedRetrieval:50,independence:80,selfRegulation:80}}}}
const outcomes=[outcome('MAT-01','Sayı Kümeleri','mastered',88),outcome('MAT-02','Temel İşlemler','developing',54),outcome('MAT-03','Problemler','insufficient',null)]
const analysis={classroom:{id:'11111111-1111-4111-8111-111111111111',name:'TYT A Sınıfı'},student:{memberRef:'a'.repeat(32),alias:'Öğrenci Bir',joinedAt:'2026-08-01T09:00:00.000Z'},scope:{game:'matematik',examRef:'TYT',taxonomyVersion:'ba-tyt-math-v1',modelVersion:'institution-evidence-v1',windowStart:'2026-08-01T09:00:00.000Z',windowEnd:'2026-08-14T09:00:00.000Z'},coverage:{supported:true,totalQuestions:120,mappedQuestions:120,percentage:100},summary:{outcomeCount:3,assessedOutcomeCount:2,insufficientOutcomeCount:1,developingOutcomeCount:1,masteredOutcomeCount:1},outcomes}

describe('guardian status email draft',()=>{
  it('creates a review-required evidence-aware Turkish template',()=>{
    const result=buildGuardianStatusEmailDraft(analysis)
    expect(result?.subject).toBe('Öğrenci Bir – TYT Matematik çalışma durumu')
    expect(result?.body).toContain('- Sayı Kümeleri');expect(result?.body).toContain('- Temel İşlemler')
    expect(result?.body).toContain('başarısızlık olarak değerlendirilmemiştir')
    expect(result?.body).toContain('otomatik gönderim değildir')
  })
  it('does not leak internal references, codes or unsupported certainty',()=>{
    const serialized=JSON.stringify(buildGuardianStatusEmailDraft(analysis))
    expect(serialized).not.toContain(analysis.student.memberRef);expect(serialized).not.toContain(analysis.classroom.id)
    expect(serialized).not.toContain('MAT-01');expect(serialized).not.toMatch(/kesin|başarısızdır|garanti/i)
  })
  it('uses the exact selected subject instead of hard-coding Mathematics',()=>{
    const fenAnalysis={
      ...analysis,
      scope:{...analysis.scope,game:'fen',questionExamRef:'TYT',taxonomyVersion:'ba-tyt-fen-v1',diagnosticEnabled:false,institutionReportingEnabled:true,scopePolicyVersion:'institution-scope-v1',modelVersion:'institution-evidence-v2'},
      outcomes:analysis.outcomes.map((item)=>({...item,path:['TYT Fen Bilimleri','Fizik','Temel',item.title],assessment:{...item.assessment,evidence:{...item.assessment.evidence,taxonomyVersion:'ba-tyt-fen-v1',modelVersion:'institution-evidence-v2'}}})),
    }
    const result=buildGuardianStatusEmailDraft(fenAnalysis)
    expect(result?.subject).toBe('Öğrenci Bir – TYT Fen Bilimleri çalışma durumu')
    expect(result?.body).toContain('TYT Fen Bilimleri çalışma durumuna')
    expect(result?.body).not.toContain('TYT Matematik çalışma durumuna')
  })
  it('rejects malformed or identifier-enriched analysis',()=>{
    expect(buildGuardianStatusEmailDraft({...analysis,userId:'hidden'})).toBeNull()
  })
})
