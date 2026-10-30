import { afterEach, expect, it, vi } from 'vitest'
import { initialState } from '../src/shared/core'
const harness=vi.hoisted(()=>({ handlers:new Map<string,Function>(), frame:{url:'http://localhost:5173/'}, wc:null as any, stored:null as any }))
vi.mock('electron',()=>({
 app:{whenReady:()=>Promise.resolve(),on:vi.fn(),getPath:()=>'.council-review',quit:vi.fn()},
 ipcMain:{handle:(name:string,fn:Function)=>harness.handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},
 BrowserWindow:class {webContents:any;constructor(){this.webContents={mainFrame:harness.frame,send:vi.fn(),setWindowOpenHandler:vi.fn(),on:vi.fn()};harness.wc=this.webContents}isDestroyed(){return false}loadURL(){return Promise.resolve()}on(){} }
}))
vi.mock('../src/main/database',()=>({StateDatabase:class {read(){return Promise.resolve(structuredClone(harness.stored))}write(value:unknown){harness.stored=structuredClone(value);return Promise.resolve()}close(){return Promise.resolve()}}}))
vi.mock('../src/main/providers',()=>({ProviderWindows:class {get(){return undefined}hideEmbedded(){} destroy(){}},AdapterError:class extends Error {constructor(message:string,public uncertain=false){super(message)}},deepSeekSend:vi.fn(),tryStopDeepSeek:vi.fn()}))
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.resetModules()})
it('native IPC mode-switch + demo-send cannot erase unresolved live uncertainty',async()=>{
 vi.useFakeTimers();vi.stubEnv('ELECTRON_RENDERER_URL','http://localhost:5173/');harness.handlers.clear();const state=initialState();state.settings.mode='live';state.runs=[{groupId:'welcome',provider:'deepseek',status:'uncertain',init:'done'}];harness.stored=state;await import('../src/main/index');await vi.advanceTimersByTimeAsync(0);
 const invoke=(name:string,value?:unknown)=>harness.handlers.get('council:'+name)!({sender:harness.wc,senderFrame:harness.frame},value);
 await invoke('saveSettings',{...state.settings,mode:'demo'});await invoke('send',{groupId:'welcome',text:'demo',requestId:'demo',targets:['deepseek']});await vi.runAllTimersAsync();await invoke('saveSettings',{...state.settings,mode:'live'});const current=await invoke('getState');expect(current.runs[0].init).toBe('uncertain');await expect(invoke('send',{groupId:'welcome',text:'real',requestId:'real',targets:['deepseek']})).rejects.toThrow('不确定');
 await expect(harness.handlers.get('council:getState')!({sender:{},senderFrame:harness.frame})).rejects.toThrow('拒绝');await expect(harness.handlers.get('council:getState')!({sender:harness.wc,senderFrame:{url:harness.frame.url}})).rejects.toThrow('拒绝');
})
