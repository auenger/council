import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AppState, Group, Message, ProviderId, ProviderRun, Settings, SendInput } from '../shared/types'
import { GROUP_ICONS, PROVIDERS } from '../shared/types'
import { bootstrapPrompt, demoReply, initialState, recoverState, routeTargets, hasRequest } from '../shared/core'
import { StateDatabase } from './database'
import { AdapterError, providerSend, ProviderWindows, tryStopProvider, supportsText, waitProviderReady, isHomeUrl, isInitialNavigation, prepareNewConversation, safeConversationUrl } from './providers'

import {providerCopyScript} from './provider-copy'
import {readProviderPage} from './providers'
const refreshing=new Set<string>()
let window: BrowserWindow | null = null
let db: StateDatabase
let state: AppState
let closing = false
const active = new Map<string, AbortController>()
const preparingSessions = new Set<string>()
let mutationQueue = Promise.resolve()
const providerSchema = z.enum(['deepseek','doubao','kimi','qwen','gemini'])
const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/)
const groupSchema = z.object({ icon:z.enum(GROUP_ICONS).optional(), id:idSchema, name:z.string().trim().min(1).max(80), description:z.string().max(500), createdAt:z.number().finite().nonnegative(), members:z.array(z.object({provider:providerSchema, role:z.string().max(6000), enabled:z.boolean()}).strict()).min(1).max(5) }).strict().refine(g=>new Set(g.members.map(m=>m.provider)).size===g.members.length,'成员不得重复')
const settingsSchema = z.object({mode:z.enum(['demo','live']),theme:z.enum(['light','dark']),sendContext:z.boolean()}).strict()
const sendSchema = z.object({groupId:idSchema,text:z.string().trim().min(1).max(20000),requestId:idSchema,targets:z.array(providerSchema).max(5).optional(),sendContext:z.boolean().optional()}).strict()
const groupIdSchema=z.object({groupId:idSchema}).strict()
const openSchema=z.object({provider:providerSchema,groupId:idSchema.optional()}).strict()
const reconcileSchema=z.object({groupId:idSchema,provider:providerSchema,action:z.enum(['confirm','reset'])}).strict()
function snapshot() { return structuredClone(state) }
async function publish() { await db.write(state); if(window&&!window.isDestroyed()) window.webContents.send('council:state',snapshot()) }
function queue<T>(fn:()=>Promise<T>):Promise<T> { const next=mutationQueue.then(fn,fn); mutationQueue=next.then(()=>{},()=>{}); return next }
function findGroup(id:string):Group { const group=state.groups.find(g=>g.id===id); if(!group) throw new Error('群聊不存在'); return group }
function runFor(groupId:string,provider:ProviderId):ProviderRun { let run=state.runs.find(r=>r.groupId===groupId&&r.provider===provider); if(!run){run={groupId,provider,status:'idle',init:'none'};state.runs.push(run)} return run }
const providers=new ProviderWindows(notice=>{ if(!state||!state.groups.some(g=>g.id===notice.groupId))return; void queue(async()=>{
 if(!state.groups.some(g=>g.id===notice.groupId))return
 const id=`download-${notice.id}`
 let message=state.messages.find(m=>m.id===id)
 if(!message){message={id,groupId:notice.groupId,sender:notice.provider,text:'原站文件下载',createdAt:Date.now(),status:'done',kind:'file'};state.messages.push(message)}
 message.file={name:notice.filename,status:notice.status==='completed'?'completed':notice.status==='downloading'?'downloading':'failed',detail:`${notice.status} · ${notice.bytes} bytes；文件不会自动打开`};await publish()
 }).catch(()=>{}) },(groupId,provider,url)=>{
 const key=`${groupId}:${provider}`
 if(!state||!state.groups.some(g=>g.id===groupId)||preparingSessions.has(key))return
 void queue(async()=>{
  if(!state.groups.some(g=>g.id===groupId))return
  const run=runFor(groupId,provider),old=run.conversationUrl
  if(old===url)return
  const initialBinding=run.init==='pending'&&active.has(key)&&(!old||isInitialNavigation(provider,old,url))
  if(initialBinding&&!isHomeUrl(provider,url)){
   if(state.runs.some(r=>r.groupId!==groupId&&r.provider===provider&&r.conversationUrl===url)){
    run.init='uncertain';run.status='uncertain';run.detail='原站会话已绑定其他群聊，已停止发送';active.get(key)?.abort()
   }else run.conversationUrl=url
   await publish();return
  }
  if(old&&old!==url){
   run.init='uncertain';run.status='uncertain';run.detail='原站离开了该群绑定的会话；绑定未更改，请重新打开原网页恢复，或重置会话';active.get(key)?.abort();await publish()
  }
 }).catch(()=>{}) },(groupId,provider,status,detail)=>{
 if(closing||!state||!state.groups.some(g=>g.id===groupId))return
 void queue(async()=>{
  if(closing||!state.groups.some(g=>g.id===groupId)||active.has(`${groupId}:${provider}`))return
  const run=runFor(groupId,provider)
  if(run.init==='uncertain'||run.init==='pending'||run.status==='uncertain')return
  if(run.status!==status||run.detail!==detail){run.status=status;run.detail=detail;await publish()}
 }).catch(()=>{})
},()=>window)
async function perform(group:Group,provider:ProviderId,input:SendInput,message:Message,controller:AbortController,mode:'demo'|'live',needsInit:boolean) {
 const key=`${group.id}:${provider}`
 try {
  if(mode==='demo') {
   const reply=demoReply(provider,input.text)
   for(let i=0;i<reply.length;i+=18){await new Promise(r=>setTimeout(r,45+['deepseek','kimi','doubao','qwen','gemini'].indexOf(provider)*12));if(controller.signal.aborted)throw new AdapterError('演示已取消'); await queue(async()=>{message.text=reply.slice(0,i+18);message.status='streaming';runFor(group.id,provider).status='streaming';await publish()})}
  } else {
   if(!supportsText(provider)) throw new AdapterError('此服务尚未实现群聊自动收发。请在原网页输入并查看结果')
   const bound=needsInit?undefined:runFor(group.id,provider).conversationUrl
   if(!bound&&!needsInit)throw new AdapterError('该群缺少官网会话绑定，请重置初始化后再发送')
   if(!bound)preparingSessions.add(key)
   const handle=providers.get(group.id,provider)||providers.open(group.id,provider,bound,false)
   if(bound){
    await waitProviderReady(handle,provider,controller.signal)
    if(safeConversationUrl(provider,handle.view.webContents.getURL())!==bound)throw new AdapterError('官网未恢复该群绑定的会话；未发送，请打开原网页检查',true)
   }else{
    await queue(async()=>{const run=runFor(group.id,provider);delete run.conversationUrl;run.detail='正在为此群创建独立的官网会话';await publish()})
    const fresh=await prepareNewConversation(handle,provider,controller.signal)
    await queue(async()=>{
     if(!isHomeUrl(provider,fresh)&&state.runs.some(r=>r.groupId!==group.id&&r.provider===provider&&r.conversationUrl===fresh))throw new AdapterError('新会话地址已被其他群绑定；未发送')
     if(!isHomeUrl(provider,fresh))runFor(group.id,provider).conversationUrl=fresh
     await publish()
    })
    preparingSessions.delete(key)
   }
   const currentUrl=safeConversationUrl(provider,handle.view.webContents.getURL())
   if (currentUrl&&!isHomeUrl(provider,currentUrl)&&state.runs.some(r=>r.groupId!==group.id&&r.provider===provider&&r.conversationUrl===currentUrl))throw new AdapterError('该官网会话已绑定其他群聊；未发送')
   const member=group.members.find(m=>m.provider===provider)!
   const context=state.messages.filter(m=>m.groupId===group.id&&!m.demo&&m.status==='done'&&m.kind==='text'&&m.requestId!==input.requestId)
   const text=needsInit?bootstrapPrompt(member,input.text,input.sendContext ?? false,context):bootstrapPrompt({...member,role:''},input.text,input.sendContext ?? false,context)
   message.text=await providerSend(handle,provider,text,controller.signal,text=>{void queue(async()=>{if(controller.signal.aborted)return;message.text=text;message.status='streaming';runFor(group.id,provider).status='streaming';await publish()}).catch(()=>{})},()=>{void queue(async()=>{if(controller.signal.aborted)return;const run=runFor(group.id,provider);run.status='sending';run.detail='已提交原网页，正在等待回复；生成期间会持续接收';await publish()}).catch(()=>{})},page=>{message.sourceText=page.text;message.sourceMessageId=page.answerId;message.sourceUrl=safeConversationUrl(provider,handle.view.webContents.getURL());if(page.videos?.length)message.videos=page.videos})
   await queue(async()=>{
    const url=safeConversationUrl(provider,handle.view.webContents.getURL())
    if(!url||isHomeUrl(provider,url))throw new AdapterError('回复已收到，但未取得可恢复的官网会话地址，请检查原网页',true)
    const run=runFor(group.id,provider)
    if(run.conversationUrl&&run.conversationUrl!==url&&!isInitialNavigation(provider,run.conversationUrl,url))throw new AdapterError('回复期间官网会话改变，请检查原网页',true)
    if(state.runs.some(r=>r.groupId!==group.id&&r.provider===provider&&r.conversationUrl===url))throw new AdapterError('官网会话绑定冲突，请检查原网页',true)
    run.conversationUrl=url;await publish()
   })
  }
  await queue(async()=>{const run=runFor(group.id,provider);if(controller.signal.aborted){message.status=mode==='live'?'uncertain':'cancelled';run.status=mode==='live'?'uncertain':'cancelled';if(mode==='live')run.init='uncertain'}else{message.status='done';run.status=mode==='demo'?'idle':'ready';if(mode==='live')run.init='done';run.detail=mode==='demo'?'本地固定模板，不是真实 AI 回复':'已接收原网页回复，并检测到页面生成结束'}await publish()})
 } catch(error) {
  await queue(async()=>{const uncertain=mode==='live'&&(!(error instanceof AdapterError)||error.uncertain);const run=runFor(group.id,provider);run.status=uncertain?'uncertain':controller.signal.aborted?'cancelled':'error';message.status=uncertain?'uncertain':controller.signal.aborted?'cancelled':'error';run.detail=error instanceof Error?error.message:'未知错误';if(!message.text)message.text=run.detail;if(mode==='live'&&uncertain)run.init='uncertain';else if(mode==='live'&&needsInit)run.init='none';await publish()}).catch(()=>{})
 } finally { preparingSessions.delete(key);active.delete(key) }
}
async function send(input:SendInput) {
 const group=findGroup(input.groupId)
 if(hasRequest(state,input.requestId))return snapshot()
 const targets=routeTargets(group,input.text,input.targets)
 if(!targets.length)throw new Error('没有选中的已启用成员')
 if(targets.some(p=>refreshing.has(`${group.id}:${p}`)))throw new Error('正在重新获取 Markdown，请稍后发送')
 if(targets.some(p=>active.has(`${group.id}:${p}`)))throw new Error('所选成员仍在回复，请等待或取消')
 const mode=state.settings.mode
 if(mode==='live'&&targets.some(p=>{const r=runFor(group.id,p);return r.status==='uncertain'||r.init==='uncertain'||r.init==='pending'}))throw new Error('存在不确定的上次发送，请先在原站核对并确认；不会自动重发')
 state.messages.push({id:randomUUID(),groupId:group.id,sender:'user',text:input.text,createdAt:Date.now(),status:'done',requestId:input.requestId,kind:'text',demo:mode==='demo'})
 const tasks=targets.map(provider=>{const run=runFor(group.id,provider);const needsInit=run.init!=='done';run.status=mode==='live'?'connecting':'sending';run.requestId=input.requestId;run.detail=mode==='demo'?'DEMO · 本地模拟':'正在后台连接原站';if(mode==='live'&&needsInit)run.init='pending';const message:Message={id:randomUUID(),groupId:group.id,sender:provider,text:'',createdAt:Date.now(),status:'pending',requestId:input.requestId,kind:'text',demo:mode==='demo'};state.messages.push(message);const controller=new AbortController();active.set(`${group.id}:${provider}`,controller);return {provider,message,controller,needsInit}})
 // Durable intent before any native submit; crash recovery never automatically resends.
 try{await publish()}catch(error){for(const t of tasks)active.delete(`${group.id}:${t.provider}`);throw error}
 for(const task of tasks)void perform(structuredClone(group),task.provider,input,task.message,task.controller,mode,task.needsInit)
 return snapshot()
}
function installIpc() {
 function handle(channel:string,schema:z.ZodType|undefined,fn:(value:any)=>Promise<any>,serialize=true) { ipcMain.handle(`council:${channel}`,async(event,value)=>{
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('拒绝非主界面请求')
  const expected=process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname,'../renderer/index.html')).href
  const actual=event.senderFrame?.url
  if(!actual||actual.split('#')[0]!==new URL(expected).href.split('#')[0])throw new Error('来源校验失败')
  const parsed=schema?schema.parse(value):undefined
  return serialize?queue(()=>fn(parsed)):fn(parsed)
 }) }
 handle('refreshMessage',z.object({messageId:idSchema}).strict(),async({messageId})=>{
  const message=state.messages.find(m=>m.id===messageId)
  if(!message||message.demo||!PROVIDERS.some(p=>p.id===message.sender)||message.kind==='file'||message.kind==='notice')throw new Error('此消息不支持重新获取 Markdown')
  const provider=message.sender as ProviderId,key=`${message.groupId}:${provider}`
  if(!supportsText(provider))throw new Error('此 AI 尚不支持读取 Markdown')
  if(active.has(key)||refreshing.has(key))throw new Error('该 AI 正在收发或读取，请稍后再试')
  const url=message.sourceUrl||runFor(message.groupId,provider).conversationUrl
  if(!url||!safeConversationUrl(provider,url))throw new Error('这条回复没有可恢复的官网会话地址')
  refreshing.add(key)
  const temporary='refresh-'+message.id
  let isolated=false
  try{
   let h=providers.get(message.groupId,provider)
   if(!h||safeConversationUrl(provider,h.view.webContents.getURL())!==url){isolated=true;h=providers.open(temporary,provider,url,false)}
   await waitProviderReady(h,provider,new AbortController().signal)
   const wc=h.view.webContents,generation=h.generation
   const check=()=>{if(wc.isDestroyed()||h!.generation!==generation||safeConversationUrl(provider,wc.getURL())!==url)throw new Error('原网页会话已变化，未覆盖消息')}
   check();const page=await readProviderPage(h,provider);check()
   if(page.busy)throw new Error('原网页仍在生成，请完成后再获取')
   const markdown=await wc.executeJavaScript(providerCopyScript(provider,{id:message.sourceMessageId,text:message.sourceText||message.text}),true)
   check()
   if(typeof markdown!=='string'||!markdown.trim())throw new Error('未能定位这条回复或读取原站 Markdown；请在原网页滚动到该回复后重试，原消息已保留')
   if(markdown.length>2000000)throw new Error('原站内容过长，原消息已保留')
   return await queue(async()=>{if(!state.messages.includes(message))throw new Error('消息已被删除');message.text=markdown;message.sourceUrl=url;message.status='done';await publish();return snapshot()})
  }finally{if(isolated)providers.destroy(temporary,provider);refreshing.delete(key)}
 },false)
 handle('openMessageVideo',z.object({messageId:idSchema,index:z.number().int().min(0).max(99)}).strict(),async({messageId,index})=>{
  const message=state.messages.find(m=>m.id===messageId)
  const video=message?.videos?.find(v=>v.index===index)
  if(video?.url){const url=new URL(video.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('视频链接无效');await shell.openExternal(url.href);return}
  if(!message || message.sender!=='doubao' || !message.videos?.some(v=>v.index===index) || !message.sourceMessageId || !message.sourceUrl || safeConversationUrl('doubao',message.sourceUrl)!==message.sourceUrl)throw new Error('视频来源不可用，请在原网页查看')
  const handle=providers.open(`media-${message.id}`,'doubao',message.sourceUrl,true)
  await waitProviderReady(handle,'doubao',new AbortController().signal)
  const locate=(id:string,index:number)=>{
   const answer=[...document.querySelectorAll<HTMLElement>('[data-message-role="assistant"]')].find(n=>n.querySelector('[data-message-id]')?.getAttribute('data-message-id')===id)
   const cards=answer?[...answer.querySelectorAll<HTMLElement>('[data-testid="carousel-item"]')].filter(n=>n.querySelector('[data-testid="video-box-bg-image"]')):[]
   const card=cards[index];if(!card)return false;card.scrollIntoView({block:'center'});(card.querySelector<HTMLElement>('[data-testid="video-box-bg-image"]') || card).click();return true
  }
  const script=`(${locate.toString()})(${JSON.stringify(message.sourceMessageId)},${index})`
  const start=Date.now();while(Date.now()-start<8000){if(await handle.view.webContents.executeJavaScript(script))return;await new Promise(r=>setTimeout(r,250))}
  throw new Error('已打开原网页；该视频所在的历史消息尚未加载，请在官网向上查找')
 })
 handle('nativeLayout',z.object({groupId:idSchema,panes:z.array(z.object({provider:providerSchema,bounds:z.object({x:z.number().int().min(0),y:z.number().int().min(44),width:z.number().int().min(1),height:z.number().int().min(1)}).strict()}).strict()).max(5)}).strict(),async({groupId,panes})=>{
  if(!panes.length){providers.hideEmbedded();return []}
  const group=findGroup(groupId)
  if(state.settings.mode!=='live')throw new Error('原网页视图需要网页账号模式')
  if(new Set(panes.map((p:{provider:ProviderId})=>p.provider)).size!==panes.length)throw new Error('不能重复展示同一家 AI')
  const zoom=window!.webContents.getZoomFactor()
  panes=panes.map((p:{provider:ProviderId;bounds:Electron.Rectangle})=>({...p,bounds:{x:Math.round(p.bounds.x*zoom),y:Math.round(p.bounds.y*zoom),width:Math.round(p.bounds.width*zoom),height:Math.round(p.bounds.height*zoom)}}))
  const [width,height]=window!.getContentSize()
  for(const pane of panes){if(!group.members.some(m=>m.enabled&&m.provider===pane.provider))throw new Error('该成员未启用');if(pane.bounds.x+pane.bounds.width>width+1||pane.bounds.y+pane.bounds.height>height+1)throw new Error('原网页区域超出窗口')}
  return providers.setLayout(window!,panes.map((p:{provider:ProviderId;bounds:Electron.Rectangle})=>({...p,groupId,url:runFor(groupId,p.provider).conversationUrl})))
 })
 handle('reloadProvider',z.object({groupId:idSchema,provider:providerSchema}).strict(),async({groupId,provider})=>{findGroup(groupId);if(active.has(`${groupId}:${provider}`))throw new Error('正在收发，请先等待当前任务完成');const h=providers.get(groupId,provider);if(h)h.view.webContents.reload()})
 handle('getState',undefined,async()=>snapshot())
 handle('copyText',z.string().max(2000000),async(text)=>{await clipboard.writeText(text)})
 handle('windowAction',z.enum(['minimize','maximize','close']),async(action)=>{if(action==='minimize')window?.minimize();else if(action==='maximize'){if(window?.isMaximized())window.unmaximize();else window?.maximize()}else setTimeout(()=>window?.close(),0)})
 handle('deleteGroup',groupIdSchema,async({groupId})=>{
  findGroup(groupId)
  if([...active.keys()].some(key=>key.startsWith(`${groupId}:`)))throw new Error('该群聊仍在回复，请先停止再删除')
  state.groups=state.groups.filter(g=>g.id!==groupId)
  state.messages=state.messages.filter(m=>m.groupId!==groupId)
  state.runs=state.runs.filter(r=>r.groupId!==groupId)
  await publish()
  for(const provider of PROVIDERS)providers.destroy(groupId,provider.id)
  return snapshot()
 })
 handle('saveGroup',groupSchema,async(group:Group)=>{if(active.size)throw new Error('回复进行中，请先停止再编辑');const old=state.groups.findIndex(g=>g.id===group.id);if(old>=0)state.groups[old]=group;else {if(state.groups.length>=100)throw new Error('群聊数量已达上限');state.groups.push(group)}await publish();return snapshot()})
 handle('saveSettings',settingsSchema,async(settings:Settings)=>{if(settings.mode==='demo')providers.hideEmbedded();if(active.size)throw new Error('回复进行中，请先停止再切换设置');if(settings.mode!==state.settings.mode){for(const run of state.runs){if(run.status==='uncertain')run.init='uncertain';run.status=run.init==='uncertain'||run.status==='uncertain'?'uncertain':'idle';run.detail='模式已切换；演示不代表原站登录或可用状态'}}state.settings=settings;await publish();return snapshot()})
 handle('send',sendSchema,send)
 handle('cancel',groupIdSchema,async({groupId})=>{findGroup(groupId);for(const [key,controller] of active){if(key.startsWith(`${groupId}:`)){controller.abort();const provider=key.split(':')[1] as ProviderId;const run=runFor(groupId,provider);run.status=state.settings.mode==='live'?'uncertain':'cancelled';run.detail='停止本地接收；原站是否停止需人工核对';if(state.settings.mode==='live')run.init='uncertain';const native=providers.get(groupId,provider);if(native)void tryStopProvider(native,provider)}}await publish();return snapshot()})
 handle('openProvider',openSchema,async({provider,groupId='account'})=>{if(groupId!=='account')findGroup(groupId);const run=groupId==='account'?undefined:runFor(groupId,provider);providers.open(groupId,provider,run?.conversationUrl);if(run){if(!active.has(`${groupId}:${provider}`)&&run.init!=='uncertain'&&run.init!=='pending'){run.detail='正在检查原网页输入框与连接状态';run.status=supportsText(provider)?'connecting':'experimental'};await publish()}})
 handle('reconcile',reconcileSchema,async({groupId,provider,action})=>{findGroup(groupId);if(active.has(`${groupId}:${provider}`))throw new Error('请等待当前任务停止');const run=runFor(groupId,provider);if(action==='reset'){providers.destroy(groupId,provider);run.init='none';delete run.conversationUrl;delete run.requestId;run.status='idle';run.detail='已解除阻塞。下次发送会新建独立对话；之前的消息不会重发'}else{const native=providers.get(groupId,provider);if(!run.conversationUrl)throw new Error('尚未绑定官网会话，请点击“新建会话并解除阻塞”后继续');if(!native||safeConversationUrl(provider,native.view.webContents.getURL())!==run.conversationUrl){providers.open(groupId,provider,run.conversationUrl);run.detail='已打开该群原会话；核对后点击“已核对，继续原会话”，或选择新建会话';await publish();return snapshot()};run.init='done';run.status='ready';run.detail='由用户确认原站结果；未重新发送任何消息'}await publish();return snapshot()})
}
async function createWindow() {
 window=new BrowserWindow({icon:app.isPackaged?join(process.resourcesPath,'icon.png'):join(__dirname,'../../build/icon.png'),width:1440,height:940,minWidth:800,minHeight:600,title:'群策 Council',backgroundColor:'#f8f8f6',...(process.platform==='darwin'?{titleBarStyle:'hidden' as const,trafficLightPosition:{x:12,y:14}}:{frame:false}),webPreferences:{backgroundThrottling:false,preload:join(__dirname,'../preload/index.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}})
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
 window.webContents.on('will-navigate',event=>event.preventDefault())
 window.webContents.on('will-attach-webview',event=>event.preventDefault())
 if(process.env.ELECTRON_RENDERER_URL)await window.loadURL(process.env.ELECTRON_RENDERER_URL)
 else await window.loadFile(join(__dirname,'../renderer/index.html'))
 window.on('resize',()=>providers.hideEmbedded())
 window.webContents.on('did-start-loading',()=>providers.hideEmbedded())
 window.on('closed',()=>{window=null;providers.closeAll()})
}
void app.whenReady().then(async()=>{db=new StateDatabase(join(app.getPath('userData'),'council.sqlite'));state=recoverState(await db.read()||initialState());await db.write(state);installIpc();await createWindow();app.on('activate',()=>{if(!window)void createWindow()})}).catch(error=>{void dialog.showErrorBox('群策无法启动',String(error));app.quit()})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',event=>{if(closing||!db)return;event.preventDefault();closing=true;for(const controller of active.values())controller.abort();void queue(async()=>{state=recoverState(state);await publish();await db.close()}).finally(()=>app.quit())})
