<script setup lang="ts">
import ProviderLogo from './ProviderLogo.vue'
import {ref,watch,nextTick,computed} from 'vue'
import {PROVIDERS,type Message,type Member} from '../../shared/types'
import SafeText from './SafeText.vue'
import {repairLegacyDeepSeek} from './message-format'
import IconButton from './IconButton.vue'
import {copyText} from './clipboard'
import CouncilLogo from './CouncilLogo.vue'
import {bridge} from './bridge'
const props=defineProps<{messages:Message[];members:Member[];groupId:string}>()
const emit=defineEmits<{suggest:[];open:[id:string]}>()
const viewport=ref<HTMLElement>(),following=ref(true),copied=ref(''),copyError=ref('')
const refreshId=ref(''),refreshError=ref<Record<string,string>>({}),refreshed=ref('')
async function refresh(message:Message){if(refreshId.value)return;refreshId.value=message.id;delete refreshError.value[message.id];refreshed.value='';try{await bridge.refreshMessage?.({messageId:message.id});refreshed.value=message.id}catch(e){refreshError.value[message.id]=e instanceof Error?e.message:String(e)}finally{refreshId.value=''}}
const videoError=ref('')
async function openVideo(messageId:string,index:number){videoError.value='';try{await bridge.openMessageVideo({messageId,index})}catch(e){videoError.value=e instanceof Error?e.message:String(e)}}
const provider=(id:string)=>PROVIDERS.find(p=>p.id===id)
const timestamp=(value:number)=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})
const date=(value:number)=>new Date(value).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})
function onScroll(){const el=viewport.value;if(el)following.value=el.scrollHeight-el.scrollTop-el.clientHeight<64}
function bottom(){const el=viewport.value;if(el){el.scrollTop=el.scrollHeight;following.value=true}}
watch(()=>props.messages.map(m=>m.text+'|'+m.status).join('\n'),async()=>{const stick=following.value;await nextTick();if(stick)bottom()},{flush:'pre'})
watch(()=>props.groupId,async()=>{following.value=true;await nextTick();bottom()},{immediate:true})
async function copy(message:Message){try{await copyText(message.text);copied.value=message.id;copyError.value=''}catch{copyError.value=message.id}}
const windowRefresh=!!window.council?.refreshMessage
const pending=computed(()=>props.messages.some(m=>m.status==='pending'||m.status==='streaming'))
</script>
<template><div class="conversation-timeline"><div ref="viewport" class="message-viewport" role="region" aria-label="群聊消息" tabindex="0" @scroll="onScroll"><div class="message-stream"><div v-if="videoError" class="error-banner" role="alert">{{videoError}}<IconButton label="关闭视频提示" icon="close" @click="videoError=''"/></div>
<div v-if="!messages.length" class="empty-chat"><CouncilLogo :size="40"/><h2>一个问题，多种可能。</h2><p>让你的 AI 团队从不同视角出发，<br/>一起把想法变得更好。</p><button @click="emit('suggest')">聊聊一个产品想法</button></div>
<template v-for="(m,index) in messages" :key="m.id"><div v-if="index===0 || date(m.createdAt)!==date(messages[index-1].createdAt)" class="message-date">{{date(m.createdAt)}}</div>
<article class="chat-message" :class="{'from-user':m.sender==='user','from-system':m.sender==='system'}" :data-message-id="m.id">
<header class="chat-message-header"><span class="sender-mark" :style="{background:provider(m.sender)?.color || 'var(--chip)',color:provider(m.sender)?'#fff':'var(--muted)'}"><ProviderLogo v-if="provider(m.sender)" :provider="provider(m.sender)!.id"/><template v-else>{{m.sender==='user'?'我':'·'}}</template></span><strong>{{m.sender==='user'?'你':provider(m.sender)?.name || '群策'}}</strong><span v-if="m.demo && m.sender!=='user'" class="simulated">模拟回复</span><span v-if="m.status==='streaming'" class="streaming-label">正在回复</span></header>
<div class="chat-message-body"><div v-if="m.kind==='file' && m.file" class="file-card"><div><strong>{{m.file.name}}</strong><small>{{m.file.status==='completed'?'已保存 · 未自动打开':m.file.status==='downloading'?'下载中':m.file.status==='failed'?'下载失败':'请在原网页操作'}}</small><p v-if="m.file.detail">{{m.file.detail}}</p></div><IconButton v-if="provider(m.sender)" label="在原网页查看文件" icon="arrow" @click="emit('open',m.sender)"/></div><SafeText v-else-if="m.text" :text="m.sender==='deepseek' ? repairLegacyDeepSeek(m.text) : m.text"/><div v-else class="thinking" role="status"><span></span><span></span><span></span><span class="thinking-text">正在等待回复</span></div></div>
<div v-if="m.videos?.length" class="message-videos"><button v-for="video in m.videos" :key="video.index" class="message-video" :title="(video.url?'打开视频：':'在原网页播放：')+video.title" @click="openVideo(m.id,video.index)"><span class="video-play">▶</span><span><strong>{{video.title}}</strong><small>{{video.url?'打开视频链接':'在'+provider(m.sender)?.name+'原网页播放'}} ↗</small></span></button></div>
<div v-if="['cancelled','error','uncertain'].includes(m.status)" class="chat-message-status">{{m.status==='cancelled'?'已取消 · 不会自动重发':m.status==='uncertain'?'状态不确定 · 请检查原网页':'发送未完成 · 请检查连接'}}</div>
<p v-if="refreshError[m.id]" class="refresh-error" role="alert">{{refreshError[m.id]}}</p><footer class="message-actions"><time :datetime="new Date(m.createdAt).toISOString()">{{timestamp(m.createdAt)}}</time><IconButton v-if="m.text" :label="copyError===m.id?'复制失败，点击重试':copied===m.id?'消息已复制':'复制消息'" :icon="copied===m.id?'check':'copy'" :size="14" @click="copy(m)" @mouseleave="copied=''"/><IconButton v-if="provider(m.sender) && !m.demo && (!m.kind || m.kind==='text') && windowRefresh" :label="refreshId===m.id?'正在获取 Markdown':refreshed===m.id?'Markdown 已更新，点击重新获取':'重新获取 Markdown'" :icon="refreshed===m.id?'check':'refresh'" :class="{'is-refreshing':refreshId===m.id}" :disabled="!!refreshId || pending" :size="14" @click="refresh(m)"/><IconButton v-if="provider(m.sender) && !m.demo" label="打开原网页" icon="arrow" :size="14" @click="emit('open',m.sender)"/></footer>
</article></template>
</div></div><div v-if="!following && messages.length" class="jump-latest"><IconButton :label="pending?'查看正在生成的回复':'回到最新消息'" icon="down" @click="bottom"/></div></div></template>

<style scoped>
.refresh-error{font-size:12px;color:#b85f30;margin:6px 0}.is-refreshing :deep(svg){animation:refresh-spin 1s linear infinite}@keyframes refresh-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.is-refreshing :deep(svg){animation:none}}
</style>
