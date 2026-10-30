import type {AppState,CouncilBridge,ProviderId,SendInput} from '../../shared/types'
import { initialState,recoverState,routeTargets,demoReply,hasRequest } from '../../shared/core'
export const isBrowserDemo = !window.council
const key='council-browser-demo-v1'
function read():AppState {try{return recoverState(JSON.parse(localStorage.getItem(key)||'null')||initialState())}catch{return initialState()}}
let state=read(); state.settings.mode='demo'
const listeners=new Set<(s:AppState)=>void>(); const active=new Map<string,{cancelled:boolean}>()
const snapshot=()=>structuredClone(state)
const publish=()=>{localStorage.setItem(key,JSON.stringify(state));for(const cb of listeners)cb(snapshot());return snapshot()}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const browser:CouncilBridge={
 async getState(){return snapshot()},
 async deleteGroup({groupId}){if(active.has(groupId))throw new Error('该群聊仍在回复，请先停止再删除');if(!state.groups.some(g=>g.id===groupId))throw new Error('群聊不存在');state.groups=state.groups.filter(g=>g.id!==groupId);state.messages=state.messages.filter(m=>m.groupId!==groupId);state.runs=state.runs.filter(r=>r.groupId!==groupId);return publish()},
 async saveGroup(group){const i=state.groups.findIndex(g=>g.id===group.id);if(i<0)state.groups.push(structuredClone(group));else state.groups[i]=structuredClone(group);return publish()},
 async saveSettings(settings){if(settings.mode==='live')throw new Error('浏览器预览仅支持 DEMO；请在桌面应用连接真实网页。');state.settings=structuredClone(settings);return publish()},
 async send(input:SendInput){
 const group=state.groups.find(g=>g.id===input.groupId);if(!group)throw new Error('讨论室不存在')
 if(hasRequest(state,input.requestId))return snapshot()
 if(active.has(group.id))throw new Error('请等待本轮完成或先取消')
 const text=input.text.trim();if(!text||text.length>20000)throw new Error('请输入 1–20000 字')
 const targets=routeTargets(group,text,input.targets);if(!targets.length)throw new Error('请选择至少一位已启用的成员')
 state.messages.push({id:crypto.randomUUID(),groupId:group.id,sender:'user',text,createdAt:Date.now(),status:'done',requestId:input.requestId,demo:true})
 const token={cancelled:false};active.set(group.id,token)
 const jobs=targets.map((provider,i)=>{
 const msg={id:crypto.randomUUID(),groupId:group.id,sender:provider,text:'',createdAt:Date.now(),status:'pending' as const,requestId:input.requestId,demo:true};state.messages.push(msg)
 state.runs=state.runs.filter(r=>!(r.groupId===group.id&&r.provider===provider));state.runs.push({groupId:group.id,provider,status:'sending',init:'none',detail:'DEMO · 本地模拟，不连接 AI 服务'})
 return {provider,msgId:msg.id,index:i}
 });publish()
 void Promise.all(jobs.map(async({provider,msgId,index})=>{
 await wait(500+index*220)
 const full=demoReply(provider,text);for(let end=8;end<full.length+8;end+=8){if(token.cancelled)return;const message=state.messages.find(m=>m.id===msgId)!;message.status='streaming';message.text=full.slice(0,end);const run=state.runs.find(r=>r.groupId===group.id&&r.provider===provider)!;run.status='streaming';publish();await wait(30)}
 if(token.cancelled)return;state.messages.find(m=>m.id===msgId)!.status='done';state.runs.find(r=>r.groupId===group.id&&r.provider===provider)!.status='ready';publish()
 })).finally(()=>{if(active.get(group.id)===token)active.delete(group.id)})
 return snapshot()
 },
 async cancel({groupId}){const token=active.get(groupId);if(token)token.cancelled=true;active.delete(groupId);for(const m of state.messages)if(m.groupId===groupId&&['pending','streaming'].includes(m.status))m.status='cancelled';for(const r of state.runs)if(r.groupId===groupId&&['sending','streaming'].includes(r.status))r.status='cancelled';return publish()},
 async openMessageVideo(){throw new Error('请在桌面 App 中打开视频')},
 async openProvider(){throw new Error('浏览器预览不连接账号，请使用桌面版的原网页窗口。')},
 async reconcile({groupId,provider,action}){const run=state.runs.find(r=>r.groupId===groupId&&r.provider===provider);if(run){run.init=action==='confirm'?'done':'none';run.status='ready'}return publish()},
 onState(cb){listeners.add(cb);return()=>listeners.delete(cb)}
}
const transport:CouncilBridge=window.council||browser
// Our IPC schemas contain JSON data only. Vue proxies can remain nested after
// an object spread (members, recipients); normalize before contextBridge/IPC
// or the browser demo's structuredClone sees them.
const payload=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
export const bridge:CouncilBridge={
 refreshMessage:input=>transport.refreshMessage?transport.refreshMessage(payload(input)):Promise.reject(new Error('请使用桌面 App')),
 reloadProvider:input=>transport.reloadProvider?transport.reloadProvider(payload(input)):Promise.reject(new Error('请使用桌面 App')),
 nativeLayout:input=>transport.nativeLayout?transport.nativeLayout(payload(input)):Promise.reject(new Error('请使用桌面 App 打开原网页视图')),
 getState:()=>transport.getState(),
 deleteGroup:input=>transport.deleteGroup(payload(input)),
 saveGroup:group=>transport.saveGroup(payload(group)),
 saveSettings:settings=>transport.saveSettings(payload(settings)),
 send:input=>transport.send(payload(input)),
 cancel:input=>transport.cancel(payload(input)),
 openMessageVideo:input=>transport.openMessageVideo(payload(input)),
 openProvider:input=>transport.openProvider(payload(input)),
 reconcile:input=>transport.reconcile(payload(input)),
 onState:callback=>transport.onState(callback)
}
