import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron',()=>({BrowserWindow:class {},WebContentsView:class {},session:{},dialog:{}}))
import { providerSend, isNewReply, isInitialNavigation, isHomeUrl, waitProviderReady } from '../src/main/providers'
import type { ProviderHandle, ProviderKey } from '../src/main/providers'
const empty = {ready:true,draft:'',count:0,text:'',busy:false,complete:false,error:'',canSubmit:true,submitted:true}
function fixture(provider: ProviderKey, draft = '') {
  let url = provider === 'deepseek' ? 'https://chat.deepseek.com/' : provider === 'doubao' ? 'https://www.doubao.com/chat/' : provider === 'qwen' ? 'https://chat.qwen.ai/' : 'https://www.kimi.com/'
  const wc={isDestroyed:()=>false,getURL:()=>url,focus:vi.fn(),insertText:vi.fn().mockResolvedValue(undefined),sendInputEvent:vi.fn(),executeJavaScript:vi.fn().mockResolvedValueOnce({...empty,draft}).mockResolvedValueOnce({...empty,draft:'hello'}).mockResolvedValue({...empty,count:1,text:'answer',complete:true})}
  const handle={view:{webContents:wc},generation:0} as unknown as ProviderHandle
  return {wc,handle,setUrl:(next:string)=>url=next}
}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>vi.useRealTimers())
describe('provider sending guards',()=>{
 it.each(['deepseek','doubao','kimi','qwen'] as ProviderKey[])('submits once and captures only a new completed %s answer',async provider=>{
  const {handle,wc}=fixture(provider); const onText=vi.fn()
  const result=providerSend(handle,provider,'hello',new AbortController().signal,onText)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBe('answer'); expect(wc.insertText).toHaveBeenCalledWith('hello')
  if(['doubao','deepseek','kimi','qwen'].includes(provider)){if(provider==='qwen')expect(wc.sendInputEvent.mock.calls.map(([event])=>event.type)).toEqual(['keyDown','keyUp']);else expect(wc.sendInputEvent).not.toHaveBeenCalled();expect(wc.executeJavaScript.mock.calls.filter(([script])=>script.includes(',"submit",'))).toHaveLength(1)}else expect(wc.sendInputEvent).not.toHaveBeenCalled();expect(onText).toHaveBeenCalledExactlyOnceWith('answer')
 })
 it('does not announce submission when Qwen leaves the prompt in its draft',async()=>{
  const {handle,wc}=fixture('qwen');const submitted=vi.fn()
  wc.executeJavaScript.mockResolvedValue({...empty,draft:'hello',userText:''})
  const result=providerSend(handle,'qwen','hello',new AbortController().signal,vi.fn(),submitted)
  const rejection=expect(result).rejects.toThrow('未检测到原站接受发送')
  await vi.advanceTimersByTimeAsync(16000);await rejection
  expect(submitted).not.toHaveBeenCalled()
  expect(wc.executeJavaScript.mock.calls.filter(([script])=>script.includes(',"submit",'))).toHaveLength(1)
 })
 it('does not overwrite or submit an existing draft',async()=>{
  const {handle,wc}=fixture('kimi','my draft')
  await expect(providerSend(handle,'kimi','hello',new AbortController().signal,vi.fn())).rejects.toMatchObject({uncertain:false})
  expect(wc.insertText).not.toHaveBeenCalled();expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })
 it('never treats a long thinking pause as completed',async()=>{
  const {handle,wc}=fixture('kimi');wc.executeJavaScript.mockResolvedValue({...empty,count:1,text:'partial',busy:true,complete:false})
  const controller=new AbortController(); const result=providerSend(handle,'kimi','hello',controller.signal,vi.fn())
  const rejection=expect(result).rejects.toMatchObject({uncertain:true})
  await vi.advanceTimersByTimeAsync(20000);controller.abort();await vi.advanceTimersByTimeAsync(500);await rejection
  expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })
 it('ignores previous assistant output, times out without resubmitting',async()=>{
  const {handle,wc}=fixture('doubao');wc.executeJavaScript.mockResolvedValue({...empty,text:'old',complete:true})
  const result=providerSend(handle,'doubao','hello',new AbortController().signal,vi.fn())
  const rejection=expect(result).rejects.toMatchObject({uncertain:true})
  await vi.advanceTimersByTimeAsync(181000);await rejection;expect(wc.sendInputEvent).not.toHaveBeenCalled();expect(wc.executeJavaScript.mock.calls.filter(([script])=>script.includes(',"submit",'))).toHaveLength(1)
 })
 it('surfaces provider capacity errors without retry',async()=>{
  const {handle,wc}=fixture('kimi');wc.executeJavaScript.mockResolvedValue({...empty,error:'和Kimi聊天的人太多了，订阅会员可进入优先队列'})
  const result=providerSend(handle,'kimi','hello',new AbortController().signal,vi.fn())
  const rejection=expect(result).rejects.toThrow('优先队列')
  await vi.advanceTimersByTimeAsync(500);await rejection;expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })
 it('marks navigation after submission uncertain without capturing the other conversation',async()=>{
  const {handle,setUrl}=fixture('deepseek');setUrl('https://chat.deepseek.com/a/chat/first');const onText=vi.fn()
  const result=providerSend(handle,'deepseek','hello',new AbortController().signal,onText)
  const rejection=expect(result).rejects.toMatchObject({uncertain:true})
  await vi.advanceTimersByTimeAsync(100);setUrl('https://chat.deepseek.com/a/chat/other')
  await vi.advanceTimersByTimeAsync(500);await rejection;expect(onText).not.toHaveBeenCalled()
 })
 it('reports readiness timeout without opening or focusing provider windows',async()=>{
  const {handle,wc}=fixture('deepseek');const show=vi.fn(),focus=vi.fn()
  handle.window={isDestroyed:()=>false,show,focus} as unknown as ProviderHandle['window']
  wc.executeJavaScript.mockReset().mockResolvedValue({...empty,ready:false})
  const rejection=expect(waitProviderReady(handle,'deepseek',new AbortController().signal)).rejects.toThrow('未识别可用')
  await vi.advanceTimersByTimeAsync(21000);await rejection
  expect(show).not.toHaveBeenCalled();expect(focus).not.toHaveBeenCalled();expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })
 it('cancels page loading before any submission',async()=>{
  const {handle,wc}=fixture('deepseek');const controller=new AbortController();controller.abort()
  await expect(waitProviderReady(handle,'deepseek',controller.signal)).rejects.toMatchObject({uncertain:false})
  expect(wc.sendInputEvent).not.toHaveBeenCalled()
 })
})
describe('conversation allocation routes',()=>{
 it('recognizes provider landing pages without confusing conversations',()=>{
  expect(isHomeUrl('qwen','https://chat.qwen.ai/c/new-chat')).toBe(true)
  expect(isInitialNavigation('qwen','https://chat.qwen.ai/c/new-chat','https://chat.qwen.ai/c/123')).toBe(true)
  expect(isHomeUrl('doubao','https://www.doubao.com/chat/')).toBe(true)
  expect(isHomeUrl('doubao','https://www.doubao.com/chat/123')).toBe(false)
  expect(isInitialNavigation('doubao','https://www.doubao.com/chat/','https://www.doubao.com/chat/123')).toBe(true)
  expect(isInitialNavigation('doubao','https://www.doubao.com/chat/local_3649148925531821','https://www.doubao.com/chat/38449545969893890')).toBe(true)
  expect(isInitialNavigation('doubao','https://www.doubao.com/chat/38449545969893890','https://www.doubao.com/chat/123')).toBe(false)
  expect(isInitialNavigation('kimi','https://www.kimi.com/','https://www.kimi.com/chat/pee3bf6e-0783-478f-8741-03be069f1695')).toBe(true)
  expect(isInitialNavigation('kimi','https://www.kimi.com/chat/pee3bf6e-0783-478f-8741-03be069f1695','https://www.kimi.com/chat/1a177780-1df2-8d7f-8000-093ef4113eee')).toBe(true)
  expect(isInitialNavigation('kimi','https://www.kimi.com/chat/1a177780-1df2-8d7f-8000-093ef4113eee','https://www.kimi.com/chat/other')).toBe(false)
  expect(isInitialNavigation('deepseek','https://chat.deepseek.com/','https://evil.test/a/chat/123')).toBe(false)
 })
})

describe('virtualized replies',()=>{
 it('recognizes a new Doubao ID after rows are recycled, even when IDs decrease',()=>{
  expect(isNewReply({count:4,answerIds:['99','100']},{count:2,answerId:'80',followsUser:true,userText:'hello\nworld'},'hello world')).toBe(true)
 })
 it('rejects old replies, a different user turn and an assistant preceding the current user',()=>{
  const before={count:4,answerIds:['99','100']}
  expect(isNewReply(before,{count:5,answerId:'100',followsUser:true,userText:'hello'},'hello')).toBe(false)
  expect(isNewReply(before,{count:5,answerId:'80',followsUser:true,userText:'other'},'hello')).toBe(false)
  expect(isNewReply(before,{count:5,answerId:'80',followsUser:false,userText:'hello'},'hello')).toBe(false)
 })
})

it('rejects a virtualized DeepSeek old answer even when its sequence increases',()=>{expect(isNewReply({count:0},{count:8,requiresUserMatch:true,followsUser:true,userText:'old question'},'new question')).toBe(false);expect(isNewReply({count:0},{count:8,requiresUserMatch:true,followsUser:false,userText:'new question'},'new question')).toBe(false)})

it('keeps a verified DeepSeek turn paired after the user row is virtualized away',()=>{const before={count:2,answerIds:['2']};expect(isNewReply(before,{count:4,requiresUserMatch:true,answerId:'4',userText:'',followsUser:false},'question','3')).toBe(true);expect(isNewReply(before,{count:6,requiresUserMatch:true,answerId:'6',userText:'',followsUser:false},'question','3')).toBe(false);expect(isNewReply(before,{count:4,requiresUserMatch:true,answerId:'4',userText:'',followsUser:false},'question')).toBe(false)})

it('receives a long DeepSeek answer after observing then losing its user row',async()=>{
 const {handle,wc}=fixture('deepseek');const onText=vi.fn()
 wc.executeJavaScript.mockReset()
  .mockResolvedValueOnce({...empty,count:2,answerIds:['2']})
  .mockResolvedValueOnce({...empty,draft:'hello'})
  .mockResolvedValueOnce({...empty,submitted:true})
  .mockResolvedValueOnce({...empty,count:2,requiresUserMatch:true,userTurnId:'3',userText:'hello',answerId:'2',busy:true})
  .mockResolvedValue({...empty,count:4,requiresUserMatch:true,userTurnId:'',userText:'',answerId:'4',followsUser:false,text:'long answer',complete:true})
 const result=providerSend(handle,'deepseek','hello',new AbortController().signal,onText)
 await vi.advanceTimersByTimeAsync(3000)
 expect(await result).toBe('long answer');expect(onText).toHaveBeenCalledWith('long answer')
})

it('continues waiting past three minutes while the provider is still generating',async()=>{
 const {handle,wc}=fixture('doubao');wc.executeJavaScript.mockResolvedValue({...empty,count:1,text:'',busy:true,complete:false})
 const result=providerSend(handle,'doubao','hello',new AbortController().signal,vi.fn())
 await vi.advanceTimersByTimeAsync(240000)
 wc.executeJavaScript.mockResolvedValue({...empty,count:1,text:'slow answer',complete:true})
 await vi.advanceTimersByTimeAsync(3000)
 expect(await result).toBe('slow answer');expect(wc.sendInputEvent).not.toHaveBeenCalled()
})

it('binds Qwen /c sessions without accepting unrelated routes',()=>{expect(isInitialNavigation('qwen','https://chat.qwen.ai/','https://chat.qwen.ai/c/abc')).toBe(true);expect(isInitialNavigation('qwen','https://chat.qwen.ai/','https://chat.qwen.ai/settings')).toBe(false);expect(isInitialNavigation('qwen','https://chat.qwen.ai/c/abc','https://chat.qwen.ai/c/def')).toBe(false)})
