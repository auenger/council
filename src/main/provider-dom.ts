import { domMarkdown } from './dom-markdown'
import type { ProviderId } from '../shared/types'

export interface PageState {
  videos?: {title:string;index:number;url?:string}[]
  ready: boolean
  draft: string
  count: number
  text: string
  busy: boolean
  complete: boolean
  error: string
  answerIds: string[]
  answerId: string
  userText: string
  followsUser: boolean
  userTurnId?: string
  requiresUserMatch?: boolean
  canSubmit: boolean
  submitted: boolean
}

// This function runs in the provider's visible page. Keep it self-contained:
// inspect DOM only, never framework stores, network payloads or credentials.
export function providerDom(provider: ProviderId, action: 'read' | 'focus' | 'stop' | 'submit' = 'read', expectedText = '', markdown: (root:HTMLElement)=>string = domMarkdown, media = collectReplyVideos): PageState {
  const visible = (n: Element) => !!n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden'
  const all = (selector: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(selector)].filter(visible)
  const inputSelector = provider === 'deepseek' ? 'textarea#chat-input,textarea[placeholder*="DeepSeek"],textarea[placeholder*="发送消息"]'
    : provider === 'doubao' ? '[data-testid="chat_input_input"] [contenteditable="true"],textarea[data-testid="chat_input_input"]'
    : provider === 'kimi' ? '.chat-input-editor[contenteditable="true"]' : provider === 'qwen' ? 'textarea.message-input-textarea' : ':not(*)'
  const input = all(inputSelector)[0] as HTMLTextAreaElement | HTMLElement | undefined
  const draft = input instanceof HTMLTextAreaElement ? input.value
    : provider === 'doubao' && input?.classList.contains('ProseMirror')
      ? [...input.children].map(n => (n as HTMLElement).innerText.replace(/\n$/, '')).join('\n')
      : input?.innerText || ''
  const buttons = all('button,[role="button"]')
  let stop = buttons.find(n => /^(停止|停止生成|停止回答|Stop generating|Stop response)$/i.test((n.getAttribute('aria-label') || n.innerText || '').trim()))
  let answers: HTMLElement[] = []
  let text = ''
  let complete = false
  let busy = !!stop
  let answerIds: string[] = []
  let userText = ''
  let followsUser = false
  let userTurnId = ''
  let videos: {title:string;index:number;url?:string}[] = []
  if (provider === 'deepseek') {
    answers = all('.ds-assistant-message-main-content')
    // Current DeepSeek exposes an unlabeled square icon for stop.
    stop ||= all('.ds-button--primary.ds-button--circle:not(.ds-button--disabled)').find(n => !!n.querySelector('svg rect,svg path[d^="M2 4.88"]'))
    busy ||= !!stop || !!all('.ds-button--primary .ds-loading').length
    const last=answers.at(-1)
    answerIds = answers.map(n => n.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key') || '').filter(Boolean)
    const user = [...document.querySelectorAll<HTMLElement>('.ds-message .ds-collapsible-text')].at(-1)
    userTurnId = user?.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key') || ''
    userText = user?.textContent || ''
    followsUser = !!user && !!last && !!(user.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)
    text = last ? markdown(last) : ''
    complete = !!text && !busy && !!all('.ds-button--primary.ds-button--circle.ds-button--disabled').length
  } else if (provider === 'doubao') {
    answers = all('[data-message-role="assistant"]')
    const last = answers.at(-1)
    answerIds = answers.map(n => n.querySelector('[data-message-id]')?.getAttribute('data-message-id') || '').filter(Boolean)
    const user = all('[data-message-role="user"]').at(-1)
    userText = user ? all('[data-testid="message_text_content"]',user).map(n=>n.innerText).join('\n\n') : ''
    followsUser = !!user && !!last && !!(user.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)
    const blocks = last ? all('[data-testid="message_text_content"]', last) : []
    text = blocks.map(n => markdown(n)).join('\n\n')
    stop ||= all('[data-testid="chat_input_stop_button"],[data-testid="chat_input_local_break_button"]').at(0)
    busy ||= !!stop || !!last?.querySelector('[data-streaming="true"]')
    complete = !!text && !busy && blocks.length > 0 && blocks.every(n => n.getAttribute('data-streaming') === 'false')
  } else if (provider === 'qwen') {
    answers = all('.qwen-chat-message-assistant')
    const last=answers.at(-1), user=all('.qwen-chat-message-user').at(-1)
    answerIds=answers.map(n=>n.querySelector('.chat-response-message[id]')?.id || '').filter(Boolean)
    userText=user?all('.user-message-content',user).map(n=>n.innerText).join('\n'):''
    followsUser=!!user&&!!last&&!!(user.compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING)
    text=last?all('.response-message-content.phase-answer',last).map(n=>markdown(n)).join('\n\n'):''
    stop ||= all('.chat-prompt-send-button .stop-button')[0]
    busy ||= !!stop || !!(last && all('.response-loading',last).length)
    complete=!!text&&!busy&&!!last?.querySelector('.response-message-footer button[aria-label="复制"],.response-message-footer button[aria-label="Copy"]')
  } else if (provider === 'kimi') {
    answers = all('.segment-assistant')
    const last = answers.at(-1)
    // Exclude the separate thinking/tool transcript from the final answer.
    text = last ? all('.markdown-container', last).filter(n => !n.closest('.toolcall-content-text,.toolcall-flow')).map(n => markdown(n)).join('\n\n') : ''
    stop ||= all('.send-button-container.stop')[0]
    busy ||= !!stop || !!all('.send-button-container.loading').length
    complete = !!text && !busy && !!last?.querySelector('.segment-assistant-actions')
  }
  videos = answers.at(-1) ? media(answers.at(-1)!,provider) : []
  const notices = all('[role="dialog"],[role="alert"],[class*="modal"],[class*="dialog"],.toast,.message-list')
  const notice = notices.map(n => n.innerText).join('\n')
  const error = /和Kimi聊天的人太多|优先队列|稍后再试|请求过于频繁|达到.*上限|额度.*不足|too many requests|rate limit/i.test(notice)
    ? notice.trim().slice(0,500) : ''
  const ready = !!input && !(input as HTMLTextAreaElement).disabled && !/login|signin/.test(location.pathname)
  const send = provider === 'doubao' ? all('[data-testid="chat_input_send_button"]')[0] : provider === 'deepseek' ? all('.ds-button--primary.ds-button--circle').find(n => !!n.querySelector('svg path[d^="M8.3125 0.980206"]')) : provider === 'kimi' ? all('.send-button-container').find(n => !!n.querySelector('svg[name="Send"]')) : provider === 'qwen' ? all('.chat-prompt-send-button button.send-button')[0] : undefined
  const canSubmit = !!send && !send.classList.contains('disabled') && !send.classList.contains('ds-button--disabled') && !send.hasAttribute('disabled') && send.getAttribute('aria-disabled') !== 'true' && !busy
  let submitted = false
  if (action === 'submit' && canSubmit && ready && !error && draft.replace(/\r\n/g,'\n').trim() === expectedText.replace(/\r\n/g,'\n').trim()) { if(provider==='qwen')input!.focus();else send!.click(); submitted = true }
  if (action === 'focus' && ready && !draft.trim() && !busy && !error) input!.focus()
  if (action === 'stop') stop?.click()
  // DeepSeek virtualizes old turns; DOM node count can stay flat or decrease.
  // Its visible message sequence is monotonic within a conversation.
  const count = provider === 'deepseek'
    ? Math.max(0,...answers.map(n => Number(n.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key')) || 0)) || answers.length
    : answers.length
  return { videos, userTurnId, requiresUserMatch: provider === 'deepseek', ready, draft, count, text: text.slice(0,200_000), busy, complete, error, answerIds, answerId: answerIds.at(-1) || '', userText, followsUser, canSubmit, submitted }
}

export function providerScript(provider: ProviderId, action: 'read' | 'focus' | 'stop' | 'submit' = 'read', expectedText = '') {
  return `(${providerDom.toString()})(${JSON.stringify(provider)},${JSON.stringify(action)},${JSON.stringify(expectedText)},(${domMarkdown.toString()}),(${collectReplyVideos.toString()}))`
}

// Shared video extraction for every assistant reply, separate from its copied Markdown.
// Site cards without URLs are represented by a native index, never by invented URLs.
export function collectReplyVideos(root:HTMLElement,provider:ProviderId): {title:string;index:number;url?:string}[] {
 const result:{title:string;index:number;url?:string}[]=[]
 if(provider==='doubao')for(const card of [...root.querySelectorAll<HTMLElement>('[data-testid="carousel-item"]')].filter(n=>n.querySelector('[data-testid="video-box-bg-image"]'))){
  const index=result.length;result.push({index,title:card.getAttribute('aria-label') || card.getAttribute('title') || `推荐视频 ${index+1}`})
 }
 const seen=new Set<string>()
 const add=(raw:string,title:string,direct=false)=>{try{
  const url=new URL(raw,location.href)
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return
  const videoHost=/(^|\.)(bilibili\.com|b23\.tv|douyin\.com|iesdouyin\.com|ixigua\.com|kuaishou\.com|youtube\.com|youtu\.be|v\.qq\.com|youku\.com)$/.test(url.hostname)
  if(!direct&&!videoHost&&!/\.(mp4|webm|m3u8|mov)(?:$)/i.test(url.pathname))return
  if(seen.has(url.href)||result.length>=20)return;seen.add(url.href)
  result.push({index:result.length,title:title.trim().slice(0,180)||`视频 · ${url.hostname}`,url:url.href})
 }catch{}}
 for(const a of root.querySelectorAll<HTMLAnchorElement>('a[href]'))add(a.href,a.innerText || a.title)
 for(const video of root.querySelectorAll<HTMLVideoElement>('video')){const src=video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src');if(src)add(src,video.title,true)}
 for(const raw of root.innerText.match(/https?:\/\/[^\s<>"）)]+/g)||[])add(raw,'')
 return result
}
