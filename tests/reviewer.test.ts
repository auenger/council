import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { routeTargets, initialState } from '../src/shared/core'
vi.mock('electron',()=>({ BrowserWindow: class {}, WebContentsView: class {}, session:{}, dialog:{} }))
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();const data=new Map<string,string>();vi.stubGlobal('window',{});vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)})})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('independent regression review',()=>{
 it('does not broadcast explicitly empty recipients',()=>expect(routeTargets(initialState().groups[0],'private',[])).toEqual([]))
 it('keeps concurrently streaming rooms isolated when cancelling one',async()=>{
 const {bridge}=await import('../src/renderer/src/bridge');const first=(await bridge.getState()).groups[0];await bridge.saveGroup({...first,id:'second',name:'second'});
 await bridge.send({groupId:'welcome',text:'ROOM_A',requestId:'a',targets:['kimi']});
 await bridge.send({groupId:'second',text:'ROOM_B',requestId:'b',targets:['deepseek']});
 await vi.advanceTimersByTimeAsync(650);await bridge.cancel({groupId:'welcome'});const stopped=(await bridge.getState()).messages.find(m=>m.requestId==='a'&&m.sender==='kimi')!;await vi.runAllTimersAsync();const s=await bridge.getState();
 expect(s.messages.find(m=>m.id===stopped.id)).toEqual(stopped);expect(stopped.status).toBe('cancelled');expect(s.messages.find(m=>m.requestId==='b'&&m.sender==='deepseek')).toMatchObject({groupId:'second',status:'done'});expect(s.messages.filter(m=>m.groupId==='welcome').every(m=>!m.text.includes('ROOM_B'))).toBe(true);
 })
 it('cancels before first chunk, preserves both cancellations across reload',async()=>{
 const {bridge}=await import('../src/renderer/src/bridge');await bridge.send({groupId:'welcome',text:'first',requestId:'a'});await bridge.cancel({groupId:'welcome'});await bridge.send({groupId:'welcome',text:'second',requestId:'b'});await bridge.cancel({groupId:'welcome'});await vi.runAllTimersAsync();vi.resetModules();const loaded=(await import('../src/renderer/src/bridge')).bridge;const s=await loaded.getState();expect(s.messages.filter(m=>m.sender!=='user')).toHaveLength(6);expect(s.messages.filter(m=>m.sender!=='user').every(m=>m.status==='cancelled'&&m.text==='')).toBe(true);await loaded.send({groupId:'welcome',text:'first',requestId:'a'});expect((await loaded.getState()).messages).toHaveLength(8);
 })
 it('rejects deceptive provider URL schemes, credentials, suffixes',async()=>{
 const {allowedProviderUrl}=await import('../src/main/providers');for(const bad of ['http://chat.deepseek.com/','https://chat.deepseek.com:444/','https://chat.deepseek.com.evil.test/','https://chat.deepseek.com@evil.test/','https://evil.test@chat.deepseek.com/','javascript:alert(1)','file:///etc/passwd'])expect(allowedProviderUrl('deepseek',bad)).toBe(false);expect(allowedProviderUrl('deepseek','https://chat.deepseek.com/a/chat/123')).toBe(true)
 })
 it('strips credentials-bearing URL metadata and refuses auth paths',async()=>{
 const {safeConversationUrl}=await import('../src/main/providers');expect(safeConversationUrl('deepseek','https://chat.deepseek.com/a/chat/123?token=secret#code=secret')).toBe('https://chat.deepseek.com/a/chat/123');expect(safeConversationUrl('deepseek','https://chat.deepseek.com/oauth/callback?code=secret')).toBeUndefined();expect(safeConversationUrl('gemini','https://accounts.google.com/signin')).toBeUndefined()
 })
 it('drops DOM poll results if cancelled while poll was pending',async()=>{
 const {deepSeekSend}=await import('../src/main/providers');let resolvePoll!:(v:unknown)=>void;const poll=new Promise(resolve=>resolvePoll=resolve);const onText=vi.fn();const controller=new AbortController();const wc={isDestroyed:()=>false,getURL:()=> 'https://chat.deepseek.com/a/chat/123',executeJavaScript:vi.fn().mockResolvedValueOnce({ready:true,draft:'',count:0,busy:false,error:''}).mockResolvedValueOnce({draft:'hello',canSubmit:true}).mockResolvedValueOnce({submitted:true}).mockReturnValueOnce(poll),focus:vi.fn(),insertText:vi.fn().mockResolvedValue(undefined),sendInputEvent:vi.fn()};const handle={view:{webContents:wc},generation:0};const promise=deepSeekSend(handle as any,'hello',controller.signal,onText);const assertion=expect(promise).rejects.toMatchObject({uncertain:true});await vi.advanceTimersByTimeAsync(800);controller.abort();resolvePoll({count:1,text:'stale response',stop:false});await assertion;expect(onText).not.toHaveBeenCalled();expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })

})
