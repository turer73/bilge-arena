import { describe,it,expect } from 'vitest'
import { measurementReleaseSql,verifyMeasurementRelease } from '../measurement-release-check.mjs'
const before={version:'measurement-release@1',phase:'preflight',databaseWrites:0,serverSupported:true,missingColumns:[],helpersPresent:true,newObjectsAbsent:true}
const after={version:'measurement-release@1',phase:'readback',databaseWrites:0,matchingFunctionBodies:7,privateRlsTables:4,privateView:true,browserRpcGrants:0,serviceRpcGrants:5,formCount:0,enabledFormCount:0,sessionCount:0}
describe('measurement release read-only gates',()=>{
 it('accepts complete evidence without authorizing activation',()=>{
  for(const r of [before,after])expect(verifyMeasurementRelease(r)).toEqual({ok:true,errors:[],activationAuthorized:false,calibrated:false})
 })
 it.each(['helpersPresent','newObjectsAbsent','serverSupported'])('rejects preflight %s missing',key=>expect(verifyMeasurementRelease({...before,[key]:undefined}).ok).toBe(false))
 it.each(['matchingFunctionBodies','privateRlsTables','privateView','browserRpcGrants','serviceRpcGrants','formCount','sessionCount'])('rejects readback %s missing',key=>expect(verifyMeasurementRelease({...after,[key]:undefined}).ok).toBe(false))
 it('rejects missing contract and unexpected phase',()=>{expect(verifyMeasurementRelease(null).ok).toBe(false);expect(verifyMeasurementRelease({...before,phase:'apply'}).ok).toBe(false)})
 it('generates read only queries and exact seven function hashes',()=>{
  for(const phase of ['preflight','readback']){
   const sql=measurementReleaseSql(phase);expect(sql).toContain('BEGIN READ ONLY');expect(sql).not.toMatch(/\b(CREATE|UPDATE|DELETE|INSERT)\s+(TABLE|INTO|FROM|public\.)/i)
  }
  expect(measurementReleaseSql('readback').match(/[a-f0-9]{64}/g)).toHaveLength(7)
 })
})
