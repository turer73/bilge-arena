import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../five-model-review-report', () => ({ FiveModelReviewReport: () => null }))
import { ContentGovernancePanel } from '../content-governance-panel'

const REV='22222222-2222-4222-8222-222222222222'
const NEXT='33333333-3333-4333-8333-333333333333'
const fetchMock=vi.fn()
let revisionStatus='draft', accepted=false, ready=false
const response=(data:unknown) => ({ok:true,status:200,json:async()=>data})
beforeEach(()=>{
  vi.clearAllMocks(); revisionStatus='draft';accepted=false;ready=false
  global.fetch=fetchMock as typeof fetch
  fetchMock.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input)
    if(url.endsWith('?limit=50')) return response({items:[{revisionId:REV,status:'draft',questionId:NEXT,createdAt:'2026-10-01T00:00:00Z'},{revisionId:NEXT,status:'published',questionId:NEXT,createdAt:'2026-10-01T00:00:00Z'}]})
    if(url.includes('?revisionId=')) return response({revision:{revisionId:url.includes(NEXT)?NEXT:REV,questionId:NEXT,revisionNo:2,status:url.includes(NEXT)?'published':revisionStatus,content:{question:'Test soru',options:['A','B'],answer:1},outcomes:[{outcomeId:NEXT,primary:true,scopeValid:true}],approvals:[]}})
    if(url.endsWith('/source-review')&&init?.method==='POST') {revisionStatus='stage1_approved';accepted=true;return response({revisionId:REV,status:revisionStatus,replayed:false})}
    if(url.endsWith('/source-review')) return response({revisionId:url.includes(NEXT)?NEXT:REV,accepted,readyToPublish:ready})
    if(url.endsWith('/publish')) return response({revisionId:REV,status:'published',replayed:false})
    return {ok:false,status:404,json:async()=>({})}
  })
})
const open = async()=>{
  render(<ContentGovernancePanel />)
  fireEvent.click(await screen.findByText('Taslak',{selector:'span'}))
  await screen.findByLabelText('Kaynak karşılaştırma raporu (JSON)')
}
function file(text:Promise<string>|string,name='report.json') {
  const result=new File(['fixture'],name,{type:'application/json'})
  Object.defineProperty(result,'text',{value:()=>Promise.resolve(text)})
  return result
}
describe('source comparison approval controls',()=>{
  it('uploads a revision-pinned report, asks for a real rationale and records no actor override',async()=>{
    const prompt=vi.spyOn(window,'prompt').mockReturnValue('Bölümler ve tüm şıklar karşılaştırıldı')
    await open()
    const input=screen.getByLabelText('Kaynak karşılaştırma raporu (JSON)')
    fireEvent.change(input,{target:{files:[file(JSON.stringify({revisionId:REV}))]}})
    expect(await screen.findByText('report.json')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Kaynak karşılaştırmasıyla onayla'))
    await screen.findByText(/Kaynak karşılaştırmalı tek onay kayıtlı/)
    const call=fetchMock.mock.calls.find(([url,init])=>String(url).endsWith('/source-review')&&init?.method==='POST')
    expect(JSON.parse(call?.[1].body)).toMatchObject({report:{revisionId:REV},rationale:'Bölümler ve tüm şıklar karşılaştırıldı'})
    expect(call?.[1].body).not.toMatch(/userId|reviewerId|stage2/)
    expect(screen.queryByText('2. aşama onayla')).not.toBeInTheDocument()
    expect(screen.queryByText('Yayınla')).not.toBeInTheDocument()
    prompt.mockRestore()
  })
  it('shows publication at stage 1 only when the server confirms every gate',async()=>{
    revisionStatus='stage1_approved';accepted=true;ready=true
    render(<ContentGovernancePanel />)
    fireEvent.click(await screen.findByText('Taslak',{selector:'span'}))
    fireEvent.click(await screen.findByText('Yayınla'))
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url,init])=>String(url).endsWith('/publish')&&init?.method==='POST')).toBe(true))
    expect(fetchMock.mock.calls.some(([url])=>String(url).endsWith('/review'))).toBe(false)
  })
  it('rejects a report for another revision before enabling acceptance',async()=>{
    await open()
    fireEvent.change(screen.getByLabelText('Kaynak karşılaştırma raporu (JSON)'),{target:{files:[file(JSON.stringify({revisionId:NEXT}))]}})
    expect(await screen.findByRole('alert')).toHaveTextContent('Rapor bu revizyona ait değil')
    expect(screen.getByText('Kaynak karşılaştırmasıyla onayla')).toBeDisabled()
  })
  it('does not attach an in-flight file read to a different revision',async()=>{
    await open()
    let resolve!:(value:string)=>void
    const pending=new Promise<string>(r=>{resolve=r})
    fireEvent.change(screen.getByLabelText('Kaynak karşılaştırma raporu (JSON)'),{target:{files:[file(pending)]}})
    fireEvent.click(screen.getByText('Yayında',{selector:'span'}))
    await screen.findByText('Revizyon 2 · Yayında')
    await act(async()=>{resolve(JSON.stringify({revisionId:REV})); await pending})
    expect(screen.queryByText('report.json')).not.toBeInTheDocument()
    expect(screen.queryByText('Kaynak karşılaştırmasıyla onayla')).not.toBeInTheDocument()
  })
})
