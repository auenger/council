// Explicit opt-in: exercises logged-in providers with two short diagnostic turns.
if(process.env.COUNCIL_LIVE_QA!=='1')throw Error('Set COUNCIL_LIVE_QA=1 to run live account diagnostics');
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
app.setPath('userData',path.join(os.homedir(),'Library/Application Support/council-desktop'));
require('../out/main/index.js');
if(process.env.COUNCIL_TRACE==='1'){app.on('web-contents-created',(_e,wc)=>{wc.on('did-navigate-in-page',(_e,url)=>{if(url.startsWith('https://'))console.log('route',new URL(url).hostname,new URL(url).pathname)})});setInterval(async()=>{for(const wc of require('electron').webContents.getAllWebContents())if(wc.getURL().includes('chat.qwen.ai'))console.log('qwen state',await wc.executeJavaScript('({focus:document.hasFocus(),active:document.activeElement?.tagName,draft:document.querySelector("textarea")?.value?.length,stop:!!document.querySelector(".stop-button"),answers:document.querySelectorAll(".qwen-chat-message-assistant").length})').catch(()=>null))},3000).unref()}
const selected=(process.env.COUNCIL_QA_PROVIDERS||'deepseek,doubao,kimi').split(',');if(!selected.every(x=>['deepseek','doubao','kimi','qwen'].includes(x)))throw Error('Unknown QA provider');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{let wc;const id='qa-unattached-background-'+selected.join('-');try{
 for(let i=0;i<100;i++){wc=BrowserWindow.getAllWindows().map(w=>w.webContents).find(w=>w.getURL().includes('/renderer/index.html'));if(wc&&await wc.executeJavaScript('!!window.council').catch(()=>false))break;await sleep(100)}
 assert.ok(wc);assert.equal(app.commandLine.hasSwitch('remote-debugging-port'),false)
 const call=(method,arg)=>wc.executeJavaScript(`window.council.${method}(${arg===undefined?'':JSON.stringify(arg)})`)
 await call('saveGroup',{id,name:'后台收发验证（无调试器）',description:'临时诊断',createdAt:Date.now(),members:selected.map(provider=>({provider,enabled:true,role:provider==='qwen'?'独立思考，清晰表达你的观点。':''}))})
 let firstUrls
 for(let round=1;round<=2;round++){
  await call('send',{groupId:id,requestId:require('node:crypto').randomUUID(),text:selected.length===1&&selected[0]==='qwen'?(round===1?'@通义千问 兼容性测试\n请只输出 Markdown 二级标题“连接成功”和两条简短的列表，不要搜索。':'只回复“第二轮连接成功”。'):round===1?'后台兼容性测试：请尝试读取 https://example.com ，用一句话说明能否读取。不要进一步搜索。':'连续对话测试：只回复“第二轮连接成功”。',sendContext:false})
  let state;const start=Date.now();let logAt=0
  while(Date.now()-start<10*60_000){await sleep(1000);state=await call('getState');const messages=state.messages.filter(m=>m.groupId===id&&m.sender!=='user').slice(-selected.length);if(Date.now()-logAt>15000){console.log('round',round,messages.map(m=>({provider:m.sender,status:m.status,length:m.text.length})));logAt=Date.now()}if(messages.length===selected.length&&messages.every(m=>['done','error','uncertain'].includes(m.status))){assert.ok(messages.every(m=>m.status==='done'),JSON.stringify(messages));break}}
  const runs=state.runs.filter(r=>r.groupId===id);assert.ok(runs.every(r=>r.init==='done'&&r.status==='ready'));const urls=runs.map(r=>r.conversationUrl);assert.ok(urls.every(Boolean));if(firstUrls)assert.deepEqual(urls,firstUrls);else firstUrls=urls
  const providerWindows=BrowserWindow.getAllWindows().filter(w=>w.webContents!==wc);assert.equal(providerWindows.length,selected.length);assert.ok(providerWindows.every(w=>!w.isVisible()&&!w.webContents.debugger.isAttached()))
  console.log('PASS live round',round,'selected replies received; native windows hidden; no debugger; bound URLs',urls)
 }
 await call('deleteGroup',{groupId:id});app.quit()
 }catch(e){console.error(e);app.quit();process.exitCode=1}})
