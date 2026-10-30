import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
let html=readFileSync('web-demo/index.html','utf8')
const jsPath=html.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1]
const cssPath=html.match(/href="\.\/(assets\/[^\"]+\.css)"/)[1]
const js=readFileSync('web-demo/'+jsPath,'utf8').replace(/<\/script/gi,'<\\/script')
const css=readFileSync('web-demo/'+cssPath,'utf8')
const hash=createHash('sha256').update(js).digest('base64')
html=html.replace("script-src 'self'",`script-src 'sha256-${hash}'`).replace(/connect-src [^;]+;/,"connect-src 'none';")
html=html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/,()=>`<script type="module">${js}</script>`).replace(/<link rel="stylesheet" crossorigin href="[^"]+">/,()=>`<style>${css}</style>`)
writeFileSync('Council-DEMO-离线预览.html',html)
console.log('Offline DEMO built with hashed inline script CSP; no network access.')
