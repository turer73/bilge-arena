import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { ContentRetirementReview } from '../content-retirement-review'
const revision='22222222-2222-4222-8222-222222222222',question='33333333-3333-4333-8333-333333333333',base='11111111-1111-4111-8111-111111111111'
const status=(accepted=false,ready=false)=>({revisionId:revision,accepted,canAccept:!accepted,readyToPublish:ready,acceptanceMode:accepted?'ai_assisted_owner_retirement':null,evidenceFingerprint:accepted?null:'a'.repeat(64)})
const evidence=()=>({version:'retirement-evidence@1',questionId:question,revisionId:revision,contentSha256:'b'.repeat(64),baseRevisionId:base,reason:'invalid_content',evidenceRef:'fixture:only',evidenceSha256:'c'.repeat(64),survivor:null})
const fetchMock=vi.fn(),refresh=vi.fn(),accepted=vi.fn()
const props={revisionId:revision,questionId:question,onRefresh:refresh,onAccepted:accepted}
const file=(data:unknown)=>({name:'retirement.json',size:1000,text:()=>Promise.resolve(JSON.stringify(data))})
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetchMock);fetchMock.mockResolvedValue({ok:true,json:async()=>status()});refresh.mockResolvedValue(undefined)})
async function prepare(){render(<ContentRetirementReview {...props}/>);const input=await screen.findByLabelText('Pasife alma kanıtı (JSON)');fireEvent.change(input,{target:{files:[file(evidence())]}});await screen.findByText('retirement.json');fireEvent.change(screen.getByLabelText('Hazırlayan AI veya araç'),{target:{value:'Gemini + DeepSeek'}});fireEvent.change(screen.getByLabelText('İnceleme gerekçeniz'),{target:{value:'Eksik şekil incelendi; kaldırılmalı'}});}
describe('owner retirement review UI',()=>{
 it('requires a real acknowledgement and records only acceptance',async()=>{
  await prepare();const button=screen.getByRole('button',{name:'Pasife alma kabulünü kaydet'});expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'));fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({questionId:question,revisionId:revision,status:'stage1_approved',acceptanceMode:'ai_assisted_owner_retirement',replayed:false})})
  fireEvent.click(button);await waitFor(()=>expect(refresh).toHaveBeenCalledOnce())
  const call=fetchMock.mock.calls.find(c=>c[1]?.method==='POST');expect(call?.[0]).toContain('/retirement-review')
  expect(JSON.parse(call?.[1].body)).toMatchObject({acceptanceMode:'ai_assisted_owner_retirement',preparation:{revisionEvidenceFingerprint:'a'.repeat(64),acceptsResponsibility:true,acknowledgesNonIndependentReview:true}})
  expect(fetchMock.mock.calls.some(c=>String(c[0]).endsWith('/publish'))).toBe(false)
 })
 it.each(['Hazırlayan AI veya araç','İnceleme gerekçeniz'])('resets responsibility after editing %s',async label=>{await prepare();fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('checkbox')).toBeChecked();fireEvent.change(screen.getByLabelText(label),{target:{value:'Yeni değer'}});expect(screen.getByRole('checkbox')).not.toBeChecked()})
 it('rejects mismatched files, resets acknowledgement on replacement',async()=>{await prepare();fireEvent.click(screen.getByRole('checkbox'));fireEvent.change(screen.getByLabelText('Pasife alma kanıtı (JSON)'),{target:{files:[file({...evidence(),revisionId:base})]}});await screen.findByRole('alert');expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByRole('button',{name:'Pasife alma kabulünü kaydet'})).toBeDisabled()})
 it('offers separate publication only when the server reports readiness',async()=>{fetchMock.mockResolvedValue({ok:true,json:async()=>status(true,true)});render(<ContentRetirementReview {...props}/>);const button=await screen.findByRole('button',{name:'Kabul edilen revizyonu pasife al'});expect(fetchMock).toHaveBeenCalledTimes(1);fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({revisionId:revision,status:'published'})});fireEvent.click(button);await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(fetchMock.mock.calls[1][0]).toContain('/publish')})
 it('does not turn accepted-but-stale evidence into a publish button',async()=>{fetchMock.mockResolvedValue({ok:true,json:async()=>status(true,false)});render(<ContentRetirementReview {...props}/>);await screen.findByText(/Kanıt veya mevcut yayın tabanı/);expect(screen.queryByRole('button')).not.toBeInTheDocument()})
 it('does not fall back on an unavailable endpoint',async()=>{fetchMock.mockResolvedValue({ok:false});render(<ContentRetirementReview {...props}/>);await screen.findByRole('alert');expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(fetchMock).toHaveBeenCalledTimes(1)})
 it('ignores a slow file after changing revision',async()=>{let finish:(text:string)=>void=()=>{};const view=render(<ContentRetirementReview {...props}/>);const input=await screen.findByLabelText('Pasife alma kanıtı (JSON)');fireEvent.change(input,{target:{files:[{name:'old.json',size:5,text:()=>new Promise<string>(resolve=>{finish=resolve})}]}});view.rerender(<ContentRetirementReview {...props} revisionId={base}/>);await act(async()=>finish(JSON.stringify(evidence())));expect(screen.queryByText('old.json')).not.toBeInTheDocument()})
})
