// Serialized into the provider page alongside providerDom. No imports, remote
// calls, clipboard actions or framework internals: read the rendered DOM only.
export function domMarkdown(root: HTMLElement): string {
 const escape = (s:string) => s.replace(/\\/g,'\\\\').replace(/([`*_[\]<>])/g,'\\$1').replace(/(^|\n)([ \t]*)(#{1,6}|>|[-+] |\d+\. )/g,'$1$2\\$3')
 const children = (node:Node):string => [...node.childNodes].map(walk).join('')
 function walk(node:Node):string {
  if(node.nodeType===Node.TEXT_NODE)return escape(node.textContent || '')
  if(!(node instanceof HTMLElement))return ''
  const tag=node.tagName.toLowerCase()
  if(['script','style','button','svg','noscript','input','textarea'].includes(tag)||node.hidden||node.getAttribute('aria-hidden')==='true')return ''
  const style=getComputedStyle(node)
  if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return ''
  // Keep citation numbers inline, not the site's decorative dashes/buttons.
  if(tag==='sup'||/citation|cite-ref|search-reference|ds-markdown-cite/.test(node.className)){
   const numbers=(node.innerText || node.textContent || '').match(/\d+/g)
   if(numbers?.length && numbers.length<=6)return numbers.map(n=>`[${n}]`).join('')
  }
  if(node.getAttribute('role')==='button')return ''
  if(tag==='pre'){
   const code=node.querySelector('code') || node
   const body=code.textContent || ''
   const lang=(code.className.match(/language-([\w+-]+)/)||[])[1] || ''
   const fence='`'.repeat(Math.max(3,...(body.match(/`+/g)||[]).map(s=>s.length+1)))
   return `\n\n${fence}${lang}\n${body.replace(/\n$/,'')}\n${fence}\n\n`
  }
  if(tag==='code'){
   const body=node.textContent || '';const fence='`'.repeat(Math.max(1,...(body.match(/`+/g)||[]).map(s=>s.length+1)))
   return `${fence} ${body} ${fence}`
  }
  if(tag==='br')return '\n'
  if(tag==='hr')return '\n\n***\n\n'
  if(tag==='img')return node.getAttribute('alt')?`[图片：${escape(node.getAttribute('alt')!)}]`:''
  if(tag==='table'){
   const rows=[...node.querySelectorAll('tr')].filter(r=>r.closest('table')===node).map(r=>[...r.children].filter(c=>/^(TH|TD)$/.test(c.tagName)).map(c=>children(c).trim().replace(/\|/g,'\\|').replace(/\n+/g,' ')))
   if(!rows.length)return ''
   const width=Math.max(...rows.map(r=>r.length));const row=(cells:string[])=>'| '+Array.from({length:width},(_,i)=>cells[i] || '').join(' | ')+' |'
   return '\n\n'+[row(rows[0]),row(Array(width).fill('---')),...rows.slice(1).map(row)].join('\n')+'\n\n'
  }
  if(tag==='ul'||tag==='ol'){
   const start=Number(node.getAttribute('start')) || 1
   const lines=[...node.children].filter(c=>c.tagName==='LI').map((li,i)=>{const marker=tag==='ol'?`${start+i}. `:'- ';const body=children(li).trim();return marker+body.replace(/\n/g,'\n'+' '.repeat(marker.length))})
   return '\n\n'+lines.join('\n')+'\n\n'
  }
  const body=children(node)
  if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+body.trim()+'\n\n'
  if(tag==='strong'||tag==='b')return body.trim()?`**${body.trim()}**`:body
  if(tag==='em'||tag==='i')return body.trim()?`*${body.trim()}*`:body
  if(tag==='del'||tag==='s')return `~~${body}~~`
  if(tag==='blockquote')return '\n\n'+body.trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n'
  if(tag==='a'){
   const href=node.getAttribute('href') || ''
   return /^https?:\/\//i.test(href)?`[${body.trim()}](${href.replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/\s/g,'%20')})`:body
  }
  if(['p','div','section','article'].includes(tag))return '\n\n'+body.trim()+'\n\n'
  return body
 }
 return walk(root).trim()
}
