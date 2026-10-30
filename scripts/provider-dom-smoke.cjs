const {_electron:electron}=require('playwright');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const ts=require('typescript');
const assert=require('node:assert/strict');
const dir=mkdtempSync(join(tmpdir(),'council-dom-'));
const compiled={};
const mdCompiled={};new Function('exports',ts.transpileModule(readFileSync('src/main/dom-markdown.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(mdCompiled);
new Function('exports','require',ts.transpileModule(readFileSync('src/main/provider-dom.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(compiled,()=>mdCompiled);
const harness=join(dir,'harness.cjs');
writeFileSync(harness,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'data'))});app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});w.loadURL('about:blank')});`);
let app;
(async()=>{
 app=await electron.launch({args:[harness],chromiumSandbox:true,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
 const page=await app.firstWindow();
 const read=id=>page.evaluate(compiled.providerScript(id));
 await page.setContent('<textarea placeholder="给 DeepSeek 发送消息"></textarea><div class="ds-markdown">thinking, not the answer</div><div class="ds-assistant-message-main-content">final answer</div><div class="ds-button--primary ds-button--circle ds-button--disabled"><svg><path/></svg></div>');
 assert.equal((await read('deepseek')).text,'final answer');assert.equal((await read('deepseek')).complete,true);
 await page.locator('.ds-button--primary').evaluate(n=>{n.classList.remove('ds-button--disabled');n.innerHTML='<svg><path d="M2 4.88C2 3.68009 2 3.08013"/></svg>'});
 assert.equal((await read('deepseek')).busy,true);assert.equal((await read('deepseek')).complete,false);
 await page.evaluate(()=>{document.querySelector('.ds-button--primary').onclick=()=>document.body.dataset.stopped='yes'});
 await page.evaluate(compiled.providerScript('deepseek','stop'));assert.equal(await page.locator('body').getAttribute('data-stopped'),'yes');
 await page.setContent('<textarea placeholder="给 DeepSeek 发送消息"></textarea><div data-virtual-list-item-key="8"><div class="ds-assistant-message-main-content">new reply after older nodes unmounted</div></div>');
 assert.equal((await read('deepseek')).count,8);
 await page.setContent('<div data-testid="chat_input_input"><div contenteditable="true" class="ProseMirror"><p>role</p><p><br></p><p>question</p></div></div><div data-message-role="user"><div data-testid="message_text_content">user prompt</div></div><div data-message-role="assistant"><div data-testid="message_text_content" data-streaming="true">partial</div></div>');
 let state=await read('doubao');assert.equal(state.draft,'role\n\nquestion');assert.equal(state.count,1);assert.equal(state.text,'partial');assert.equal(state.complete,false);
 await page.locator('[data-streaming]').evaluate(n=>n.setAttribute('data-streaming','false'));
 assert.equal((await read('doubao')).complete,true);
 await page.evaluate(()=>{const n=document.createElement('button');n.dataset.testid='chat_input_send_button';n.disabled=true;n.innerText='send';n.onclick=()=>document.body.dataset.submits=String(Number(document.body.dataset.submits||0)+1);document.body.append(n)});
 assert.equal((await read('doubao')).canSubmit,false);
 assert.equal((await page.evaluate(compiled.providerScript('doubao','submit','role\n\nquestion'))).submitted,false);
 await page.locator('[data-testid="chat_input_send_button"]').evaluate(n=>n.disabled=false);
 assert.equal((await page.evaluate(compiled.providerScript('doubao','submit','changed prompt'))).submitted,false);
 assert.equal((await page.evaluate(compiled.providerScript('doubao','submit','role\n\nquestion'))).submitted,true);
 assert.equal(await page.locator('body').getAttribute('data-submits'),'1');
 await page.evaluate(()=>{const n=document.createElement('div');n.dataset.testid='chat_input_local_break_button';n.innerText='stop';n.onclick=()=>n.remove();document.body.append(n)});
 assert.equal((await read('doubao')).busy,true);await page.evaluate(compiled.providerScript('doubao','stop'));assert.equal((await read('doubao')).busy,false);
 await page.setContent('<div class="chat-input-editor" contenteditable="true"></div><div class="segment-user">user prompt</div><div class="segment-assistant"><div class="toolcall-flow"><div class="markdown-container toolcall-content-text">private thinking</div></div><div class="markdown-container">answer</div><div class="segment-assistant-actions"></div></div><div class="send-button-container stop"></div>');
 state=await read('kimi');assert.equal(state.count,1);assert.equal(state.text,'answer');assert.equal(state.complete,false);
 await page.locator('.send-button-container').evaluate(n=>n.classList.remove('stop'));assert.equal((await read('kimi')).complete,true);
 await page.evaluate(()=>{const n=document.createElement('div');n.setAttribute('role','dialog');n.innerText='和Kimi聊天的人太多了，订阅会员可进入优先队列';document.body.append(n)});
 assert.match((await read('kimi')).error,/优先队列/);
 const rich='<h3>规格</h3><p><strong>参数</strong>：正文。<span data-citation-group="1"><a href="https://example.com" aria-label="1"><span class="ds-markdown-cite"><span style="opacity:0">-</span><span>1</span></span></a></span></p><ul><li><p>第一项</p><ul><li>子项</li></ul></li><li>第二项</li></ul><blockquote><p>引用文字</p></blockquote><table><tr><th>名称</th><th>数量</th></tr><tr><td>模型</td><td>3</td></tr></table><pre><code class="language-js">const x = 1;\n\nconsole.log(x);</code></pre><button>复制</button>';
 for(const [id,wrapper] of [['deepseek',`<div class="ds-assistant-message-main-content">${rich}</div>`],['doubao',`<div data-message-role="assistant"><div data-testid="message_text_content" data-streaming="false">${rich}</div></div>`],['kimi',`<div class="segment-assistant"><div class="markdown-container">${rich}</div><div class="segment-assistant-actions"></div></div>`]]){
  await page.setContent(wrapper);const result=(await read(id)).text;
  assert.match(result,/### 规格/);assert.match(result,/\*\*参数\*\*/);assert.match(result,/\[\[1\]\]\(https:\/\/example.com\)/);assert.doesNotMatch(result,/复制/);assert.match(result,/- 第一项/);assert.match(result,/> 引用文字/);assert.match(result,/\| 名称 \| 数量 \|/);assert.match(result,/```js\nconst x = 1;\n\nconsole.log\(x\);\n```/);
 }
 for(const [id,tag] of [['deepseek','class="ds-assistant-message-main-content"'],['doubao','data-message-role="assistant"'],['kimi','class="segment-assistant"']]){
  await page.setContent(`<div ${tag}><a href="https://youtu.be/older">旧视频</a></div><div ${tag}><a href="https://www.bilibili.com/video/BV123">教程甲</a><a href="https://www.bilibili.com/video/BV123">重复</a><a href="javascript:alert(1)">危险</a><a href="https://example.com/article">普通文章</a><video src="https://example.com/demo.mp4" title="演示乙"></video></div>`)
  const videos=(await read(id)).videos;assert.equal(videos.length,2);assert.equal(videos[0].title,'教程甲');assert.equal(videos[1].url,'https://example.com/demo.mp4');assert.ok(videos.every(v=>!v.url.includes('older')))
 }
 await page.setContent('<div data-message-role="assistant"><div data-testid="carousel-item" aria-label="测试视频甲"><div data-testid="video-box-bg-image"></div></div><div data-testid="carousel-item"><div data-testid="video-box-bg-image"></div></div></div>')
 assert.deepEqual((await read('doubao')).videos,[{index:0,title:'测试视频甲'},{index:1,title:'推荐视频 2'}])
 await page.setContent('<textarea class="message-input-textarea"></textarea><div class="chat-prompt-send-button"><button class="send-button" aria-label="发送">send</button></div><div class="qwen-chat-message-user"><p class="user-message-content">question</p></div><div class="qwen-chat-message-assistant"><div class="chat-response-message" id="reply-id"><div class="phase-thinking">private thought</div><div class="response-message-content phase-answer"><p>final Qwen answer</p></div><div class="response-message-footer"><button aria-label="复制">copy</button></div></div></div>')
 state=await read('qwen');assert.equal(state.text,'final Qwen answer');assert.equal(state.answerId,'reply-id');assert.equal(state.userText,'question');assert.equal(state.followsUser,true);assert.equal(state.complete,true)
 await page.locator('textarea').fill('test');await page.locator('.send-button').evaluate(n=>n.onclick=()=>document.body.dataset.qwenSent='yes');const qwenSubmit=await page.evaluate(compiled.providerScript('qwen','submit','test'));assert.equal(qwenSubmit.submitted,true);assert.equal(await page.locator('body').getAttribute('data-qwen-sent'),null);assert.equal(await page.locator('textarea').evaluate(n=>n===document.activeElement),true)
 await page.locator('.send-button').evaluate(n=>{n.className='stop-button';n.setAttribute('aria-label','停止')});assert.equal((await read('qwen')).busy,true);assert.equal((await read('qwen')).complete,false)
 const copying={};new Function('exports','require',ts.transpileModule(readFileSync('src/main/provider-copy.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(copying,()=>mdCompiled);
 const fixtures={
 deepseek:i=>`<section data-virtual-list-item-key="${i}"><div class="ds-assistant-message-main-content">answer ${i}</div><button aria-label="复制">copy</button></section>`,
 doubao:i=>`<section data-message-role="assistant"><div data-message-id="${i}"></div><div data-testid="message_text_content">answer ${i}</div><button data-testid="message_action_copy">copy</button></section>`,
 qwen:i=>`<section class="qwen-chat-message-assistant"><div class="chat-response-message" id="${i}"><div class="response-message-content phase-answer">answer ${i}</div><div class="response-message-footer"><button aria-label="复制">copy</button></div></div></section>`,
 kimi:i=>`<section class="segment-assistant"><div class="markdown-container">answer ${i}</div><div class="segment-assistant-actions"><button class="icon-button" aria-label="复制">copy</button></div></section>`}
 for(const [id,html] of Object.entries(fixtures)){
  await page.setContent(html(1)+html(2));await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('must intercept clipboard')}}});document.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>navigator.clipboard.writeText('# Native Markdown '+(i+1)))})
  assert.equal(await page.evaluate(copying.providerCopyScript(id,id==='kimi'?{text:'answer 1'}:{id:'1'})),'# Native Markdown 1');assert.equal(await page.evaluate(copying.providerCopyScript(id,{id:'missing'})),null);assert.equal(await page.evaluate(copying.providerCopyScript(id)),'# Native Markdown 2')
 }
 console.log('PASS: native DOM fixtures — three provider editors, ProseMirror newlines, assistant-only replies, thinking exclusion, busy/completion, stop, capacity notice');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await app?.close();rmSync(dir,{recursive:true,force:true})});
