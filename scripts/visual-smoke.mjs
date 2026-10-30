// Run on a desktop/CI host where sandbox-enabled Chromium is supported.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdir } from 'node:fs/promises'
const server=await createServer({configFile:'vite.preview.config.ts',server:{host:'127.0.0.1',port:5174}})
await mkdir('evidence', {recursive:true});await server.listen();let browser
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,chromiumSandbox:true})
 const page=await browser.newPage({viewport:{width:1440,height:960}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5174/');await page.getByText('一个问题，多种可能。').waitFor()
 await page.screenshot({path:'evidence/01-empty.png',fullPage:true})
 await page.getByRole('textbox',{name:'消息内容'}).fill('@Kimi 帮我规划一个产品 MVP')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.waitForTimeout(2500);await page.screenshot({path:'evidence/02-conversation.png',fullPage:true})
 const text=await page.locator('vue-advanced-chat').innerText();if(!text.includes('非真实 AI'))throw Error('Demo text absent')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('Visual smoke passed')
} finally {await browser?.close();await server.close()}
