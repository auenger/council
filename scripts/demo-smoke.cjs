const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
mkdirSync('evidence', { recursive: true });
const data = mkdtempSync(resolve('evidence/demo-data-'));
const errors = [];
const packaged = process.argv.includes('--packaged');
const archive = resolve('release/mac/Council.app/Contents/Resources/app.asar');
let app;
async function launch() {
 app = await electron.launch({ args: [resolve('scripts/demo-harness.cjs')], chromiumSandbox: true,
   env: { ...process.env, COUNCIL_TEST_DATA: data, ...(packaged ? { COUNCIL_TEST_APP: archive } : {}) } });
 const page = await app.firstWindow();
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.getByText('DEMO · 演示模式', {exact:true}).waitFor();
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')), data);
 const prefs = await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
 assert.equal(prefs.sandbox,true); assert.equal(prefs.webSecurity,true);
 return page;
}
async function state(page) { return page.evaluate(()=>window.council.getState()); }
async function send(page,text) {
 await page.getByRole('textbox',{name:'消息内容'}).fill(text);
 await page.getByRole('button',{name:'发送',exact:true}).click();
}
(async()=>{
 let page = await launch();
 await page.getByText('一个问题，多种可能。',{exact:true}).waitFor({timeout:15000});
 await send(page,'本地 DEMO：请给出产品建议');
 await page.waitForFunction(async()=>{const s=await window.council.getState();return s.messages.some(m=>m.status==='streaming'&&m.text.length>0)});
 await page.locator('.conversation-timeline').getByText('非真实 AI',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'发送',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(async()=>{const s=await window.council.getState();return s.messages.filter(m=>m.sender!=='user'&&m.sender!=='system'&&m.status==='done').length===3});
 let s=await state(page); console.log(JSON.stringify(s.messages.map(m=>({sender:m.sender,status:m.status}))))
 assert.deepEqual(s.messages.filter(m=>m.sender!=='user'&&m.sender!=='system').map(m=>m.sender).sort(),['deepseek','doubao','kimi']);
 await page.locator('.conversation-timeline').getByText('非真实 AI',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'@Kimi',exact:true}).click();
 await send(page,'本地单成员验证');
 await page.waitForFunction(async()=>{const s=await window.council.getState();return s.messages.filter(m=>m.sender==='kimi'&&m.status==='done').length===2});
 s=await state(page);assert.equal(s.messages.filter(m=>m.sender==='deepseek').length,1);assert.equal(s.messages.filter(m=>m.sender==='doubao').length,1);
 await page.getByRole('button',{name:'全部成员',exact:true}).click();
 await send(page,'本地取消验证');
 await page.getByRole('button',{name:'停止',exact:false}).click();
 await page.waitForFunction(async()=>{const s=await window.council.getState();return !s.runs.some(r=>['sending','streaming','connecting'].includes(r.status)) && !s.messages.some(m=>['pending','streaming'].includes(m.status))});
 s=await state(page);assert.ok(s.runs.some(r=>r.status==='cancelled'));
 // Exercise actual reactive form values through contextBridge, not direct
 // page.evaluate calls with plain JSON (which hide Proxy cloning regressions).
 await page.getByRole('button',{name:/发起新群聊/}).click();
 await page.getByPlaceholder('例如：产品灵感实验室').fill('第二个本地验收群');
 await page.getByPlaceholder('角色说明（随首次消息发送，不是系统指令）').first().fill('创建时的角色');
 await page.getByRole('button',{name:'保存群聊',exact:true}).click();
 await page.getByRole('heading',{name:'第二个本地验收群',exact:true}).waitFor();
 await page.getByText('一个问题，多种可能。',{exact:true}).waitFor();
 let second=(await state(page)).groups.find(g=>g.name==='第二个本地验收群');
 assert.equal(second.members[0].role,'创建时的角色');
 await page.getByRole('button',{name:'编辑群聊',exact:true}).click();
 await page.getByPlaceholder('角色说明（随首次消息发送，不是系统指令）').first().fill('编辑后的角色');
 await page.getByRole('button',{name:'保存群聊',exact:true}).click();
 await page.waitForFunction(async()=>{const s=await window.council.getState();return s.groups.find(g=>g.name==='第二个本地验收群')?.members[0].role==='编辑后的角色'});
 await page.getByRole('button',{name:'产品灵感讨论室 3 位 AI 成员 · 本地群聊',exact:true}).click();
 await page.locator('.conversation-timeline').getByText('本地单成员验证',{exact:false}).first().waitFor();
 const ids=s.messages.map(m=>m.id);
 await app.close();app=null;
 page=await launch();s=await state(page);assert.deepEqual(s.messages.map(m=>m.id),ids);
 assert.equal(s.groups.find(g=>g.name==='第二个本地验收群')?.members[0].role,'编辑后的角色');
 await page.locator('.conversation-timeline').getByText('本地单成员验证',{exact:false}).first().waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: empty state, three DEMO replies, selected Kimi only, create/edit group via UI, cancel, close/reopen persistence; sandbox/webSecurity true; no renderer/CSP console errors');
 writeFileSync('evidence/demo-smoke-result.json',JSON.stringify({passed:true,data,packaged,checks:['empty','visible streaming','three replies','selected Kimi','create/edit group via UI','cancel','empty/history room switching','restart persistence','sandbox','webSecurity'],errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await app?.close()});
