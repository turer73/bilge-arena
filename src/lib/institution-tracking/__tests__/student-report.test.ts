import {describe,expect,it} from 'vitest'
import {institutionStudentReportSnapshotSchema} from '../student-report'

const snapshot={modelVersion:'institution-student-report-v1',generatedAt:'2026-08-14T10:00:00.000Z',periodStart:'2026-08-01T10:00:00.000Z',periodEnd:'2026-08-14T10:00:00.000Z',institutionName:'Bilge Pilot Kursu',classroomName:'TYT A Sınıfı',teacherAlias:'Öğretmen Bir',studentAlias:'Öğrenci Bir',scope:{game:'matematik',examRef:'TYT',taxonomyVersion:'ba-tyt-math-v1'},summary:{outcomeCount:1,assessedOutcomeCount:1,insufficientOutcomeCount:0,developingOutcomeCount:1,masteredOutcomeCount:0},outcomes:[{title:'Temel Kavramlar',path:['TYT Matematik','Sayılar','Temel','Kavram'],status:'developing',score:62,confidence:'medium',evidenceCount:8,independentEvidenceCount:4,lastEvidenceAt:'2026-08-13T10:00:00.000Z'}]}
describe('institution student report snapshot',()=>{
  it('accepts an internally consistent identifier-minimal report',()=>{expect(institutionStudentReportSnapshotSchema.safeParse(snapshot).success).toBe(true);expect(JSON.stringify(snapshot)).not.toMatch(/memberRef|studentId|email|phone|note/)})
  it('rejects summary drift and extra identifier fields',()=>{expect(institutionStudentReportSnapshotSchema.safeParse({...snapshot,summary:{...snapshot.summary,outcomeCount:2}}).success).toBe(false);expect(institutionStudentReportSnapshotSchema.safeParse({...snapshot,memberRef:'a'.repeat(32)}).success).toBe(false)})
})
