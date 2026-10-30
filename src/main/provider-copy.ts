import {domMarkdown} from './dom-markdown'
import type {ProviderId} from '../shared/types'
// Trigger a uniquely matched assistant turn, or the latest turn during normal collection. Capture the
// text passed to the site's clipboard API locally; never read/replace the OS
// clipboard or grant clipboard permissions to remote pages.
export async function copyProviderMarkdown(provider:ProviderId,target?:{id?:string;text?:string},markdown?:(el:HTMLElement)=>string):Promise<string|null>{
 const all=(selector:string,root:ParentNode=document)=>[...root.querySelectorAll<HTMLElement>(selector)]
 const pick=(selector:string)=>{
  const nodes=all(selector)
  if(!target)return nodes.at(-1)
  const matches=nodes.filter(n=>{
   const id=provider==='deepseek'?n.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key'):provider==='doubao'?n.querySelector('[data-message-id]')?.getAttribute('data-message-id'):provider==='qwen'?n.querySelector('.chat-response-message[id]')?.id:undefined
   if(target.id)return id===target.id
   if(!target.text?.trim()||!markdown)return false
   const blocks=provider==='deepseek'?[n]:provider==='doubao'?all('[data-testid="message_text_content"]',n):provider==='qwen'?all('.response-message-content.phase-answer',n):all('.markdown-container',n).filter(el=>!el.closest('.toolcall-content-text,.toolcall-flow'))
   const normalize=(text:string)=>text.replace(/\r\n/g,'\n').trim()
   return normalize(blocks.map(el=>markdown(el)).join('\n\n'))===normalize(target.text)
  })
  return matches.length===1?matches[0]:undefined
 }
 let button:HTMLElement|undefined
 if(provider==='deepseek'){
  const answer=pick('.ds-assistant-message-main-content')
  const turn=answer?.closest('[data-virtual-list-item-key]') || answer?.parentElement?.parentElement
  if(turn)button=all('[role="button"],button',turn).find(n=>n.getAttribute('aria-label')==='复制' || !!n.querySelector('svg path[d^="M6.14929 4.02032"]'))
 }else if(provider==='doubao'){
  const answer=pick('[data-message-role="assistant"]')
  if(answer)button=answer.querySelector<HTMLElement>('[data-testid="message_action_copy"]') || answer.parentElement?.querySelector<HTMLElement>('[data-testid="message_action_copy"]') || undefined
 }else if(provider==='qwen'){
  const answer=pick('.qwen-chat-message-assistant')
  button=answer?.querySelector<HTMLElement>('.response-message-footer button[aria-label="复制"],.response-message-footer button[aria-label="Copy"]') || undefined
 }else if(provider==='kimi'){
  const answer=pick('.segment-assistant')
  if(answer)button=all('.segment-assistant-actions .icon-button',answer).find(n=>n.getAttribute('aria-label')==='复制' || !!n.querySelector('svg path[d^="M725.333333 302.933333"]'))
 }
 if(!button || button.getAttribute('aria-disabled')==='true' || button.hasAttribute('disabled'))return null
 const clipboard=navigator.clipboard
 if(!clipboard)return null
 const originalWrite=Object.getOwnPropertyDescriptor(clipboard,'writeText')
 const originalExec=Object.getOwnPropertyDescriptor(document,'execCommand')
 const exec=document.execCommand
 let captured:string|null=null
 const record=(value:string)=>{if(typeof value==='string'&&value.trim()&&value.length<=2000000)captured=value}
 try{
  Object.defineProperty(clipboard,'writeText',{configurable:true,value:async(text:string)=>{record(text)}})
  Object.defineProperty(document,'execCommand',{configurable:true,value:function(command:string,showUI?:boolean,value?:string){
   if(command.toLowerCase()==='copy'){
    const selection=getSelection()
    const selectedNode=selection?.rangeCount?selection.getRangeAt(0).commonAncestorContainer:null
    const target=selectedNode instanceof Element?selectedNode:selectedNode?.parentElement || document
    const data=new DataTransfer()
    target.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}))
    if(data.getData('text/plain')){record(data.getData('text/plain'));return true}
    const el=document.activeElement
    const selected=el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement?el.value.slice(el.selectionStart||0,el.selectionEnd??el.value.length):getSelection()?.toString() || ''
    record(selected);return !!captured
   }
   return exec.call(document,command,showUI,value)
  }})
  button.click()
  const start=Date.now()
  while(!captured && Date.now()-start<1200)await new Promise(r=>setTimeout(r,40))
  return captured
 }catch{return null}
 finally{
  if(originalWrite)Object.defineProperty(clipboard,'writeText',originalWrite);else Reflect.deleteProperty(clipboard,'writeText')
  if(originalExec)Object.defineProperty(document,'execCommand',originalExec);else Reflect.deleteProperty(document,'execCommand')
 }
}
export function providerCopyScript(provider:ProviderId,target?:{id?:string;text?:string}){return `(${copyProviderMarkdown.toString()})(${JSON.stringify(provider)},${JSON.stringify(target)||'undefined'},${domMarkdown.toString()})`}
