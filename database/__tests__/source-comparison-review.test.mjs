import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareSourceComparison, validateSourceComparison } from '../source-comparison-review.mjs'

describe('offline source comparison adapter', () => {
  it('pins v2 tasks/schema/guidance and rejects mixed manifest/task versions',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'source-comparison-v2-'))
    const output=join(dir,'run')
    try {
      await prepareSourceComparison({rows:[{id:'11111111-1111-4111-8111-111111111111',published_revision_id:'22222222-2222-4222-8222-222222222222',content_sha256:'a'.repeat(64),game:'matematik',category:'sayilar',exam_ref:'LGS',content:{question:'2+3?',options:['3','4','5','6'],answer:2,solution:'2+3=5'}}]},output,'source-comparison@2')
      const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'))
      const folder=join(output,manifest.tasks[0].taskId)
      const task=JSON.parse(readFileSync(join(folder,'task.json'),'utf8'))
      expect(manifest.version).toBe('source-comparison@2')
      expect(task.responseSchema.properties.format.const).toBe('source-comparison@2')
      expect(task.responseSchema.required).toContain('curriculumBinding')
      expect(readFileSync(join(folder,'START.md'),'utf8')).toContain('curriculum_canonical_exam_scopes')
      expect(await validateSourceComparison(output)).toMatchObject({totals:{missing:1},databaseWrites:0})
      // Existing legacy manifests cannot silently reinterpret a v2 task.
      manifest.version='source-comparison@1'
      writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest))
      await expect(validateSourceComparison(output)).rejects.toThrow('Task format changed')
    } finally { rmSync(dir,{recursive:true,force:true}) }
  },30000)
  it('pins post-blind tasks, detects missing/invalid reports and refuses overwrites or tampering', async () => {
    const dir=mkdtempSync(join(tmpdir(),'source-comparison-test-'))
    const output=join(dir,'run')
    const input={rows:[{
      id:'11111111-1111-4111-8111-111111111111',published_revision_id:'22222222-2222-4222-8222-222222222222',
      content_sha256:'a'.repeat(64),game:'matematik',category:'sayilar',exam_ref:'LGS',
      content:{question:'2+3 kaçtır?',options:['3','4','5','6'],answer:2,solution:'2+3=5'},
    }]}
    try {
      expect(await prepareSourceComparison(input,output)).toMatchObject({questions:1,containsAnswerKey:true,databaseWrites:0})
      expect(await validateSourceComparison(output)).toMatchObject({totals:{missing:1}})
      await expect(prepareSourceComparison(input,output)).rejects.toThrow()
      const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'))
      const folder=join(output,manifest.tasks[0].taskId)
      writeFileSync(join(folder,'response.json'),'{"bad":true}')
      expect(await validateSourceComparison(output)).toMatchObject({totals:{invalid:1}})
      writeFileSync(join(folder,'task.json'),'{}')
      await expect(validateSourceComparison(output)).rejects.toThrow('Task changed')
    } finally { rmSync(dir,{recursive:true,force:true}) }
  }, 30000)
})
