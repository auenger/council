import { BrowserWindow, WebContentsView, View, session, dialog } from 'electron'
import type { WebContents, Rectangle } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { newConversationScript } from './provider-session'
import { providerCopyScript } from './provider-copy'
import { providerScript, type PageState } from './provider-dom'

export const providerSites = {
  deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/', hosts: ['chat.deepseek.com'] },
  doubao: { name: '豆包', url: 'https://www.doubao.com/chat/', hosts: ['www.doubao.com', 'doubao.com'] },
  kimi: { name: 'Kimi', url: 'https://www.kimi.com/', hosts: ['www.kimi.com', 'kimi.moonshot.cn'] },
  qwen: { name: '通义千问', url: 'https://chat.qwen.ai/', hosts: ['chat.qwen.ai'] },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/', hosts: ['gemini.google.com', 'accounts.google.com'] }
} as const
export type ProviderKey = keyof typeof providerSites
export function allowedProviderUrl(provider: ProviderKey, input: string): boolean {
  try { const u = new URL(input); return u.protocol === 'https:' && u.port === '' && (providerSites[provider].hosts as readonly string[]).includes(u.hostname) && !u.username && !u.password } catch { return false }
}
export function safeConversationUrl(provider: ProviderKey, input: string): string | undefined {
  if (!allowedProviderUrl(provider, input)) return undefined
  const url = new URL(input)
  if (url.hostname !== new URL(providerSites[provider].url).hostname || /login|signin|oauth|authorize|callback/i.test(url.pathname)) return undefined
  // Never persist query parameters, fragments, authentication codes, or credential material.
  return url.origin + url.pathname
}
export type ProviderHandle = { window: BrowserWindow; view: WebContentsView; generation: number; owner: BrowserWindow; embedded: boolean; priming: boolean; loading:boolean; loadError:string; warmSlot?:View }
export type DownloadNotice = { id: string; provider: ProviderKey; groupId: string; filename: string; status: string; bytes: number }
export class ProviderWindows {
  private windows = new Map<string, ProviderHandle>()
  private configured = new Set<string>()
  private embedded = new Set<ProviderHandle>()
  private move(handle:ProviderHandle, owner:BrowserWindow, bounds:Rectangle) {
    // Apply destination bounds before attaching: never expose the old full-page rectangle.
    handle.view.setBounds(bounds)
    const wasWarm=!!handle.warmSlot
    if(handle.warmSlot){handle.warmSlot.removeChildView(handle.view);if(!handle.owner.isDestroyed())handle.owner.contentView.removeChildView(handle.warmSlot);handle.warmSlot=undefined}
    if(handle.owner!==owner||wasWarm){if(!wasWarm&&!handle.owner.isDestroyed())handle.owner.contentView.removeChildView(handle.view);owner.contentView.addChildView(handle.view);handle.owner=owner}
  }
  private park(handle:ProviderHandle){
    handle.embedded=false;this.embedded.delete(handle)
    if(handle.window.isDestroyed())return
    if(handle.priming)return
    const [width,height]=handle.window.getContentSize()
    this.move(handle,handle.window,{x:0,y:0,width,height})
  }
  setLayout(host:BrowserWindow, panes:{groupId:string;provider:ProviderKey;url?:string;bounds:Rectangle}[]){
    const keep=new Set(panes.map(p=>this.get(p.groupId,p.provider)).filter(Boolean))
    for(const h of [...this.embedded])if(!keep.has(h))this.park(h)
    for(const pane of panes){const h=this.open(pane.groupId,pane.provider,pane.url,false);h.window.hide();if(h.loading||h.loadError){if(h.embedded)this.park(h);continue}h.embedded=true;this.embedded.add(h);this.move(h,host,pane.bounds)}
    return panes.map(p=>{const h=this.get(p.groupId,p.provider)!;return {provider:p.provider,loading:h.loading,error:h.loadError}})
  }
  hideEmbedded(){for(const h of [...this.embedded])this.park(h)}
  constructor(private onDownload: (notice: DownloadNotice) => void, private onNavigate: (groupId: string, provider: ProviderKey, url: string) => void, private onConnection?: (groupId: string, provider: ProviderKey, status: 'ready'|'login-required'|'connecting'|'idle'|'error'|'experimental', detail: string) => void, private mainWindow?:()=>BrowserWindow|null) {}
  get(groupId: string, provider: ProviderKey) { return this.windows.get(`${groupId}:${provider}`) }
  open(groupId: string, provider: ProviderKey, savedUrl?: string, foreground = true): ProviderHandle {
    const key = `${groupId}:${provider}`
    const existing = this.windows.get(key)
    if (existing && !existing.window.isDestroyed()) { if(foreground){if(savedUrl&&allowedProviderUrl(provider,savedUrl)&&safeConversationUrl(provider,existing.view.webContents.getURL())!==savedUrl)void existing.view.webContents.loadURL(savedUrl).catch(()=>{});if(existing.embedded){existing.owner.focus();existing.view.webContents.focus()}else{existing.window.show();existing.window.focus()}}; return existing }
    const partition = `persist:council-${provider}`
    const ses = session.fromPartition(partition)
    if (!this.configured.has(partition)) {
      ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
      ses.setPermissionCheckHandler(() => false)
      ses.on('will-download', async (_event, item, contents) => {
        const match = [...this.windows.entries()].find(([, handle]) => handle.view.webContents === contents)
        const downloadGroup = match?.[0].split(':')[0] || 'account'
        const downloadId = randomUUID()
        const filename = basename(item.getFilename()).replace(/[\x00-\x1f\u202a-\u202e\u2066-\u2069]/g, '_')
        const notify = (status: string) => this.onDownload({ id: downloadId, provider, groupId: downloadGroup, filename, status, bytes: item.getReceivedBytes() })
        // Electron's native save dialog stays in the original provider session; never auto-open files.
        item.setSaveDialogOptions({ title: '保存来自原站的文件', defaultPath: filename })
        notify('downloading')
        item.on('updated', (_e, state) => notify(state === 'interrupted' ? 'interrupted' : 'downloading'))
        item.once('done', (_e, state) => notify(state))
      })
      this.configured.add(partition)
    }
    const window = new BrowserWindow({show:false,width:1120,height:820,title:`${providerSites[provider].name} · 原网页`,autoHideMenuBar:true,
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
    const view = new WebContentsView({webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,navigateOnDragDrop:false,backgroundThrottling:false}})
    window.contentView.addChildView(view)
    view.setBounds({x:0,y:0,width:1120,height:820})
    const handle:ProviderHandle = {window,view,generation:0,owner:window,embedded:false,priming:false,loading:true,loadError:''}
    const wc = view.webContents
    window.on('resize',()=>{if(!handle.embedded&&handle.owner===window){const [width,height]=window.getContentSize();view.setBounds({x:0,y:0,width,height})}})
    window.on('show',()=>{this.park(handle)})
    // Closing the inspection window only hides it; the group owns the session.
    window.on('close',event=>{if(!wc.isDestroyed()){event.preventDefault();window.hide()}})
    const guard = (event: { preventDefault(): void }, url: string) => { if (!allowedProviderUrl(provider, url)) event.preventDefault() }
    wc.on('will-navigate', guard); wc.on('will-redirect', guard)
    wc.setWindowOpenHandler(({ url }) => {
      if (allowedProviderUrl(provider, url)) void wc.loadURL(url)
      else void dialog.showMessageBox(window, { type: 'info', message: '此链接不在该服务的原站白名单中', detail: 'MVP 不自动打开外站。请在您的正常浏览器中完成所需操作。' })
      return { action: 'deny' }
    })
    wc.on('did-start-navigation', (_e, _url, _inPlace, mainFrame) => { if (mainFrame && !_inPlace){handle.generation++;handle.loading=true;handle.loadError='';if(handle.embedded)this.park(handle)} })
    wc.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{if(mainFrame&&code!==-3){handle.loading=false;handle.loadError='原网页加载失败：'+description}})
    wc.on('did-finish-load',()=>{const generation=handle.generation;void wc.executeJavaScript("new Promise(resolve=>{const start=Date.now();function check(){if(document.body?.innerText.trim()||document.querySelector('textarea,input,button,img,canvas,video')||Date.now()-start>10000)requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));else setTimeout(check,100)}check()})").then(()=>{if(generation===handle.generation){handle.loading=false;handle.loadError=''}}).catch(()=>{})})
    wc.on('did-navigate', (_e, url) => { const clean = safeConversationUrl(provider, url); if (clean) this.onNavigate(groupId, provider, clean) })
    wc.on('did-navigate-in-page', (_e, url, mainFrame) => { const clean = safeConversationUrl(provider, url); if (mainFrame && clean) this.onNavigate(groupId, provider, clean) })
    let checking = false
    const checkConnection = async () => {
      if (checking || wc.isDestroyed() || wc.isLoadingMainFrame()) return
      checking = true
      try {
        if (!supportsText(provider)) { this.onConnection?.(groupId,provider,'experimental','仅支持原网页操作，尚未实现群聊自动收发'); return }
        const page = await readProviderPage(handle,provider)
        if (wc.isDestroyed()) return
        this.onConnection?.(groupId,provider,page.error?'error':page.ready?'ready':'login-required',page.error?`原站提示：${page.error}`:page.ready?(page.busy?'原站正在生成，请等待':page.draft.trim()?'原网页就绪；存在草稿，请先处理草稿':'原网页输入框就绪，可发送文字'):'未识别输入框，请检查原网页登录或验证码')
      } catch { if (!wc.isDestroyed()) this.onConnection?.(groupId,provider,'connecting','正在加载原网页') }
      finally { checking = false }
    }
    const connectionTimer = setInterval(()=>void checkConnection(),2500)
    connectionTimer.unref()
    wc.on('did-finish-load',()=>void checkConnection())
    wc.once('destroyed',()=>{if(!window.isDestroyed())window.destroy()})
    window.on('closed', () => { this.embedded.delete(handle);if(handle.warmSlot){handle.warmSlot.removeChildView(view);if(!handle.owner.isDestroyed())handle.owner.contentView.removeChildView(handle.warmSlot);handle.warmSlot=undefined}if(handle.owner!==window&&!handle.owner.isDestroyed())handle.owner.contentView.removeChildView(view);clearInterval(connectionTimer); this.windows.delete(key); if (!wc.isDestroyed()) wc.close(); this.onConnection?.(groupId,provider,'idle','原网页已关闭；下次发送会恢复已保存的会话') })
    this.windows.set(key, handle)
    // Prime at normal viewport size with only the last pixel inside the shell.
    // Parent View bounds do not reliably clip native web children on every OS.
    // Set all bounds before attachment to avoid a full-page flash.
    const shell=this.mainWindow?.()
    void (async()=>{
      if(!foreground&&shell&&!shell.isDestroyed()){
        handle.priming=true;window.contentView.removeChildView(view);const slot=new View();slot.setBounds({x:-1119,y:44,width:1120,height:820});view.setBounds({x:0,y:0,width:1120,height:820});slot.addChildView(view);shell.contentView.addChildView(slot);handle.owner=shell;handle.warmSlot=slot
      }
      await wc.loadURL(savedUrl&&allowedProviderUrl(provider,savedUrl)?savedUrl:providerSites[provider].url)
      if(handle.priming){
        await wc.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        handle.priming=false;if(!handle.embedded)this.park(handle)
      }
    })().catch(error=>{handle.loading=false;handle.loadError=String(error);handle.priming=false;if(!wc.isDestroyed()&&!handle.embedded)this.park(handle)})
    if(foreground)window.show()
    return handle
  }
  destroy(groupId:string,provider:ProviderKey){const h=this.get(groupId,provider);if(h&&!h.window.isDestroyed())h.window.destroy()}
  closeAll() { for (const h of [...this.windows.values()]) if (!h.window.isDestroyed()) h.window.destroy() }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export class AdapterError extends Error { constructor(message: string, public uncertain = false) { super(message) } }
export function supportsText(provider: ProviderKey) { return ['deepseek','doubao','kimi','qwen'].includes(provider) }
export function isHomeUrl(provider: ProviderKey, input: string): boolean {
  if (!allowedProviderUrl(provider,input)) return false
  const path = new URL(input).pathname
  return path === '/' || (provider === 'qwen' && path === '/c/new-chat') || (provider === 'doubao' && /^\/chat\/?$/.test(path))
}
export function isInitialNavigation(provider: ProviderKey, from: string, to: string): boolean {
  if (!allowedProviderUrl(provider, from) || !allowedProviderUrl(provider,to)) return false
  if (isHomeUrl(provider,from) && provider === 'qwen') return /^\/c\/[^/]+$/.test(new URL(to).pathname)
  if (isHomeUrl(provider,from)) return provider === 'deepseek' ? /^\/a\/chat\//.test(new URL(to).pathname) : /^\/chat\/[^/]+$/.test(new URL(to).pathname)
  if (provider === 'doubao' && /^\/chat\/local_\d+$/.test(new URL(from).pathname)) return /^\/chat\/\d+$/.test(new URL(to).pathname)
  // Kimi allocates a provisional p<UUID> route before the server assigns its ID.
  return provider === 'kimi' && /^\/chat\/p[0-9a-f-]{35}$/.test(new URL(from).pathname) && /^\/chat\/[0-9a-f-]{36}$/.test(new URL(to).pathname)
}
export async function readProviderPage(handle: ProviderHandle, provider: ProviderKey): Promise<PageState> {
  const wc = handle.view.webContents
  if (wc.isDestroyed() || !allowedProviderUrl(provider,wc.getURL())) throw new AdapterError('原网页尚未加载，请打开原网页检查')
  return wc.executeJavaScript(providerScript(provider))
}
export async function waitProviderReady(handle: ProviderHandle, provider: ProviderKey, signal: AbortSignal) {
  const start = Date.now()
  while (Date.now()-start < 20_000) {
    if (signal.aborted) throw new AdapterError('已取消，尚未提交到原站')
    if (handle.view.webContents.isDestroyed()) throw new AdapterError('原网页已关闭，尚未提交')
    let page: PageState | undefined
    try { page = await readProviderPage(handle,provider) } catch { /* Page may still be loading. */ }
    if (signal.aborted) throw new AdapterError('已取消，尚未提交到原站')
    if (page?.error) throw new AdapterError(`原站提示：${page.error}`)
    if (page?.ready && !handle.priming) return
    await sleep(400)
  }
  throw new AdapterError('未识别可用的原网页输入框。请检查登录、验证码或页面加载状态；没有发送')
}
export async function prepareNewConversation(handle:ProviderHandle,provider:ProviderKey,signal:AbortSignal){
 await waitProviderReady(handle,provider,signal)
 const wc=handle.view.webContents
 const before=await readProviderPage(handle,provider)
 if(before.busy||before.draft.trim())throw new AdapterError('原网页仍在生成或存在草稿；未新建、未发送，请先在原网页处理')
 const original=safeConversationUrl(provider,wc.getURL())
 const probe=await wc.executeJavaScript(newConversationScript(provider)) as {found:boolean;hasMessages:boolean}
 // A verified empty landing page already represents an unsent new chat.
 const blankLanding=!!original&&isHomeUrl(provider,original)&&!probe.hasMessages&&before.count===0
 if(probe.found)await wc.executeJavaScript(newConversationScript(provider,true))
 else if(!blankLanding)throw new AdapterError('无法识别官网的新建对话入口；未发送，避免串用旧会话')
 let stable=0
 const start=Date.now()
 while(Date.now()-start<15000){
  if(signal.aborted)throw new AdapterError('已取消新建会话，尚未发送')
  if(wc.isDestroyed())throw new AdapterError('原网页已关闭，尚未发送')
  const page=await readProviderPage(handle,provider).catch(()=>null)
  const clean=safeConversationUrl(provider,wc.getURL())
  const dom=page?await wc.executeJavaScript(newConversationScript(provider)).catch(()=>null):null
  const freshUrl=clean&&(isHomeUrl(provider,clean)||clean!==original)
  if(page?.ready&&!page.busy&&!page.draft.trim()&&page.count===0&&dom&&!dom.hasMessages&&freshUrl){
   stable ||= Date.now()
   if(Date.now()-stable>=700)return clean!
  }else stable=0
  await sleep(200)
 }
 throw new AdapterError('未能确认官网已创建空白新对话；未发送，避免串用旧会话')
}
export function isNewReply(before: Pick<PageState,'count'> & Partial<PageState>, after: Pick<PageState,'count'> & Partial<PageState>, prompt: string, confirmedUserTurnId = '') {
  // A long reply can virtualize the user row away after submission was verified.
  // Only accept its immediately following sequence, never an arbitrary newer row.
  if (after.requiresUserMatch && confirmedUserTurnId && after.answerId === String(Number(confirmedUserTurnId)+1)) return !before.answerIds?.includes(after.answerId)
  if (after.requiresUserMatch && (!after.followsUser || (after.userText || '').replace(/\s/g,'') !== prompt.replace(/\s/g,''))) return false
  // Doubao recycles rows and its message IDs are not chronological. Pair the
  // new ID with the visible user turn instead of comparing IDs or row counts.
  if (after.answerId) {
    const normalize = (value: string) => value.replace(/\s/g,'')
    return !before.answerIds?.includes(after.answerId) && !!after.followsUser && normalize(after.userText || '') === normalize(prompt)
  }
  return after.count > before.count
}
export async function providerSend(handle: ProviderHandle, provider: ProviderKey, text: string, signal: AbortSignal, onText: (text: string) => void, onSubmitted?: () => void, onMetadata?: (page: PageState) => void): Promise<string> {
  const wc: WebContents = handle.view.webContents
  const generation = handle.generation
  let previousUrl = wc.getURL().split(/[?#]/)[0]
  let submitted = false
  const assertCurrent = () => {
    if (signal.aborted) throw new AdapterError('已停止本地接收；请在原站确认生成是否停止', submitted)
    if (wc.isDestroyed() || generation !== handle.generation) throw new AdapterError('原站已关闭、刷新或导航。请核对后再发送', submitted)
    const url = wc.getURL().split(/[?#]/)[0]
    if (!allowedProviderUrl(provider,url) || (url !== previousUrl && !(submitted && isInitialNavigation(provider,previousUrl,url)))) throw new AdapterError('原站对话已更换，请核对后再发送', submitted)
    previousUrl = url
  }
  try {
    assertCurrent()
    const ready: PageState = await wc.executeJavaScript(providerScript(provider,'focus'))
    assertCurrent()
    if (ready.error) throw new AdapterError(`原站提示：${ready.error}`)
    if (!ready.ready || ready.busy) throw new AdapterError('原站输入框不可用或仍在生成，请在原网页检查')
    if (ready.draft.trim()) throw new AdapterError('原站输入框已有草稿，未覆盖、未发送。请先在原网页处理草稿')
    // Chromium native insertion updates React, ProseMirror and Lexical editors.
    // Do not set innerHTML/textContent on rich editors: that bypasses their state.
    // Keep Qwen's content focused without showing its window.
    // Focusing webContents does not show or activate its BrowserWindow.
    if(provider==='qwen'||handle.window?.isVisible())wc.focus()
    await wc.insertText(text)
    // Let Qwen commit its input state before checking and clicking its send control.
    if(provider==='qwen')await sleep(500)
    assertCurrent()
    let filled = await readProviderPage(handle,provider)
    assertCurrent()
    if (filled.draft.replace(/\r\n/g,'\n').trim() !== text.replace(/\r\n/g,'\n').trim()) throw new AdapterError('原网页未完整接收输入，未发送；请检查原网页草稿')
    if (supportsText(provider)) {
      // ProseMirror's visible text updates before the app's send state. Wait
      // for the actual button before one submit action; never retry automatically.
      const waitStart = Date.now()
      while (!filled.canSubmit && Date.now()-waitStart < 8000) {
        await sleep(150); assertCurrent(); filled = await readProviderPage(handle,provider); assertCurrent()
      }
      if (!filled.canSubmit) throw new AdapterError('原站发送按钮未就绪；未提交，请检查原网页草稿')
      submitted = true
      if(provider==='qwen')wc.focus()
      const result: PageState = await wc.executeJavaScript(providerScript(provider,'submit',text), true)
      if (!result.submitted) { submitted = false; throw new AdapterError('原站草稿或发送状态已改变，未提交') }
      // Qwen's click path can leave multiline drafts untouched. Its native
      // editor Enter handler submits reliably without depending on pointer layout.
      if(provider==='qwen'){
        wc.sendInputEvent({type:'keyDown',keyCode:'Return'})
        wc.sendInputEvent({type:'keyUp',keyCode:'Return'})
      }

    } else {
      submitted = true
      wc.sendInputEvent({type:'keyDown',keyCode:'Return'})
      wc.sendInputEvent({type:'keyUp',keyCode:'Return'})
    }
    if(provider==='qwen'){
      const deadline=Date.now()+15000
      let acknowledged=false
      while(Date.now()<deadline){
        await sleep(150);assertCurrent()
        const page=await readProviderPage(handle,provider);assertCurrent()
        if(page.error)throw new AdapterError(`原站提示：${page.error}`,true)
        if(page.busy || (!page.draft.trim() && (page.count>ready.count || page.userText.replace(/\s/g,'')===text.replace(/\s/g,'')))){acknowledged=true;break}
      }
      if(!acknowledged)throw new AdapterError('未检测到原站接受发送，内容可能仍在草稿中；请在原网页核对。未自动重发',true)
    }
    onSubmitted?.()
    let confirmedUserTurnId = ''
    let last = ''; let stableSince = Date.now()
    const start = Date.now()
    let lastActivity = start
    while (Date.now()-start < 30 * 60_000 && Date.now()-lastActivity < 180_000) {
      await sleep(500)
      assertCurrent()
      const result = await readProviderPage(handle,provider)
      assertCurrent()
      if (result.busy) lastActivity = Date.now()
      if (result.error) throw new AdapterError(`原站提示：${result.error}。未自动重发，请在原站核对`, true)
      if (provider === 'deepseek' && Number(result.userTurnId) > ready.count && result.userText.replace(/\s/g,'') === text.replace(/\s/g,'')) confirmedUserTurnId = result.userTurnId!
      if (!isNewReply(ready,result,text,confirmedUserTurnId) || !result.text) continue
      const next = result.text
      if (next !== last) { last = next; stableSince = Date.now(); lastActivity = stableSince; onText(next) }
      // Require a new assistant turn and provider completion DOM; a pause in
      // thinking alone is not completion. No retry or second submit on timeout.
      if (result.complete && !result.busy && Date.now()-stableSince >= 1500) {
       onMetadata?.(result)
       const copied=await wc.executeJavaScript(providerCopyScript(provider),true).catch(()=>null) as string|null
       assertCurrent()
       if(typeof copied==='string' && copied.trim()){onText(copied);return copied}
       return last
      }
    }
    throw new AdapterError('等待原站回复超时，结果不确定；不会自动重发，请在原站核对', true)
  } catch (error) {
    if (error instanceof AdapterError) throw error
    throw new AdapterError(`原网页通信中断：${error instanceof Error ? error.message : String(error)}；请在原站核对`, submitted)
  }
}
export const deepSeekSend = (handle: ProviderHandle, text: string, signal: AbortSignal, onText: (text: string) => void) => providerSend(handle,'deepseek',text,signal,onText)
export async function tryStopProvider(handle: ProviderHandle, provider: ProviderKey) {
  const wc = handle.view.webContents
  if (wc.isDestroyed() || !allowedProviderUrl(provider,wc.getURL())) return
  await wc.executeJavaScript(providerScript(provider,'stop')).catch(()=>{})
}
export const tryStopDeepSeek = (handle: ProviderHandle) => tryStopProvider(handle,'deepseek')
