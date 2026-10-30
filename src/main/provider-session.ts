import type {ProviderId} from '../shared/types'
// Only visible new-chat controls; never history rows or framework internals.
export function newConversationDom(provider:ProviderId,click=false){
 const visible=(el:Element)=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'
 const controls=[...document.querySelectorAll<HTMLElement>('button,a,[role="button"],[tabindex="0"],[data-testid]')].filter(visible)
 const labels=/^(新建会话|新建对话|开启新对话|新对话|新建聊天|新聊天|New chat|New conversation)(?:\s*[（(].*[）)])?$/i
 let control=controls.find(el=>labels.test((el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||'').trim().split('\n')[0]))
 if(!control && provider==='doubao')control=controls.find(el=>/^(create_conversation_button|chat_new_chat_button|new_chat_button)$/.test(el.dataset.testid||''))
 if(click&&control&&!control.hasAttribute('disabled')&&control.getAttribute('aria-disabled')!=='true')control.click()
 const selector=provider==='deepseek'?'.ds-assistant-message-main-content,.ds-user-message':provider==='doubao'?'[data-message-role="assistant"],[data-message-role="user"]':provider==='qwen'?'.qwen-chat-message-assistant,.qwen-chat-message-user':'.segment-assistant,.segment-user'
 return {found:!!control,hasMessages:[...document.querySelectorAll(selector)].some(visible)}
}
export function newConversationScript(provider:ProviderId,click=false){return `(${newConversationDom.toString()})(${JSON.stringify(provider)},${click})`}
