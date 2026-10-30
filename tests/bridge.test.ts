import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();const data=new Map<string,string>();vi.stubGlobal('window',{});vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)})})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('browser demo bridge',()=>{
 it('deduplicates request IDs and allows only target member',async()=>{const {bridge}=await import('../src/renderer/src/bridge');const input={groupId:'welcome',text:'@Kimi 请分析',requestId:'same'};await bridge.send(input);await bridge.send(input);await vi.runAllTimersAsync();const s=await bridge.getState();expect(s.messages.filter(m=>m.sender==='user')).toHaveLength(1);expect(s.messages.filter(m=>m.sender!=='user').map(m=>m.sender)).toEqual(['kimi']);expect(s.messages.every(m=>m.demo)).toBe(true)})
 it('cancel stops stale stream even after new send',async()=>{const {bridge}=await import('../src/renderer/src/bridge');await bridge.send({groupId:'welcome',text:'first',requestId:'first'});await vi.advanceTimersByTimeAsync(600);await bridge.cancel({groupId:'welcome'});const before=(await bridge.getState()).messages.filter(m=>m.requestId==='first').map(m=>m.text);await bridge.send({groupId:'welcome',text:'second',requestId:'second',targets:['deepseek']});await vi.runAllTimersAsync();const state=await bridge.getState();expect(state.messages.filter(m=>m.requestId==='first').map(m=>m.text)).toEqual(before);expect(state.messages.find(m=>m.requestId==='second'&&m.sender==='deepseek')?.status).toBe('done')})
 it('rejects live mode and persists role edits',async()=>{const {bridge}=await import('../src/renderer/src/bridge');const s=await bridge.getState();await expect(bridge.saveSettings({...s.settings,mode:'live'})).rejects.toThrow('仅支持 DEMO');s.groups[0].members[0].role='new role';await bridge.saveGroup(s.groups[0]);expect((await bridge.getState()).groups[0].members[0].role).toBe('new role')})
})

describe('reactive IPC payloads',()=>{
 it('creates and edits a group with nested Vue proxies in the browser demo',async()=>{
  const {reactive}=await import('vue');const {bridge}=await import('../src/renderer/src/bridge')
  const group=reactive({...(await bridge.getState()).groups[0],id:'reactive-group',name:'新群聊'})
  await bridge.saveGroup({...group,name:group.name.trim()})
  group.members[0].role='edited role'
  expect((await bridge.getState()).groups.find(g=>g.id===group.id)?.members[0].role).not.toBe('edited role')
  await bridge.saveGroup({...group})
  expect((await bridge.getState()).groups.find(g=>g.id===group.id)?.members[0].role).toBe('edited role')
 })
 it('passes cloneable group members and selected recipients to the desktop bridge',async()=>{
  const {reactive}=await import('vue');const {initialState}=await import('../src/shared/core')
  const saveGroup=vi.fn(async value=>{structuredClone(value);return initialState()})
  const send=vi.fn(async value=>{structuredClone(value);return initialState()})
  vi.stubGlobal('window',{council:{saveGroup,send}})
  const {bridge}=await import('../src/renderer/src/bridge')
  const group=reactive(initialState().groups[0]);const targets=reactive<Array<'kimi'>>(['kimi'])
  await bridge.saveGroup({...group});await bridge.send({groupId:group.id,text:'hello',requestId:'reactive-targets',targets})
  expect(saveGroup).toHaveBeenCalledWith(JSON.parse(JSON.stringify(group)))
  expect(send).toHaveBeenCalledWith({groupId:group.id,text:'hello',requestId:'reactive-targets',targets:['kimi']})
 })
})
