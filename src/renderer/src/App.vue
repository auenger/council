<script setup lang="ts">
import NativeConversation from './NativeConversation.vue'
import ProviderLogo from './ProviderLogo.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { darkTheme, NConfigProvider, NDrawer, NDrawerContent, NFormItem, NInput, NButton, NSwitch, NSelect, NModal, NCheckbox, NAlert } from 'naive-ui'
import { GROUP_ICONS, PROVIDERS, type Group, type ProviderId, type Status } from '../../shared/types'
import { routeTargets } from '../../shared/core'
import { bridge, isBrowserDemo } from './bridge'
import { useCouncil } from './store'
import Icon from './Icon.vue'
import CouncilLogo from './CouncilLogo.vue'
import ComposerInput from './ComposerInput.vue'
import IconButton from './IconButton.vue'
import MessageTimeline from './MessageTimeline.vue'
const store = useCouncil()
const composer = ref(''), search = ref(''), error = ref(''), busy = ref(false), showSettings = ref(false), showGroup = ref(false), showFiles = ref(false)
const showDelete=ref(false), deleting=ref(false), deleteTarget=ref<Group|null>(null), deleteError=ref('')
const iconNames:Record<string,string>={spark:'灵感',chat:'对话',book:'阅读',globe:'探索',code:'代码',bulb:'创意',target:'目标',coffee:'闲聊'}
function requestDelete(group:Group){deleteTarget.value=group;deleteError.value='';showDelete.value=true}
async function deleteGroup(){if(!deleteTarget.value||deleting.value)return;deleting.value=true;deleteError.value='';try{store.apply(await bridge.deleteGroup({groupId:deleteTarget.value.id}));showDelete.value=false;showGroup.value=false}catch(e){deleteError.value=e instanceof Error?e.message:String(e)}finally{deleting.value=false}}
const mentionOpen=ref(false)
const targets = ref<ProviderId[]>([])
const includeContext = ref(false)
const draft = ref<Group>({ id:'',name:'',description:'',members:[],createdAt:0 })
let unsubscribe: (()=>void)|undefined
onMounted(async()=>{try {unsubscribe=await store.init()}catch(e){error.value=String(e)}})
onUnmounted(()=>unsubscribe?.())
watch(()=>store.selectedId,()=>{targets.value=[];includeContext.value=false;composer.value='';error.value=''})
const provider = (id:string)=>PROVIDERS.find(p=>p.id===id)
const members = computed(()=>store.group?.members.filter(m=>m.enabled) || [])
const groups = computed(()=>store.state.groups.filter(g=>g.name.toLowerCase().includes(search.value.toLowerCase())))
const messages = computed(()=>store.state.messages.filter(m=>m.groupId===store.group?.id))
const runs = computed(()=>store.state.runs.filter(r=>r.groupId===store.group?.id))
const running = computed(()=>runs.value.some(r=>['sending','streaming','connecting'].includes(r.status)))
const blockedRuns=computed(()=>{if(!store.group||store.state.settings.mode!=='live')return [];const selected=routeTargets(store.group,composer.value,targets.value.length?targets.value:members.value.map(m=>m.provider));return runs.value.filter(r=>selected.includes(r.provider)&&(r.status==='uncertain'||r.init==='uncertain'))})
const isDemo = computed(()=>store.state.settings.mode==='demo')
const statuses:Record<Status,string> = {idle:'等待对话',connecting:'正在连接', 'login-required':'请先登录',ready:'网页就绪',sending:'发送中',streaming:'正在思考',error:'需检查',cancelled:'已取消',uncertain:'待确认',experimental:'实验性适配'}
function status(id:ProviderId){ const run=runs.value.find(r=>r.provider===id);return run ? statuses[run.status] : isDemo.value?'演示就绪':provider(id)?.experimental?'仅原网页':'未连接' }
function toggleTarget(id:ProviderId){targets.value=targets.value.includes(id)?targets.value.filter(p=>p!==id):[...targets.value,id]}
async function act(fn:()=>Promise<unknown>){error.value='';try{await fn()}catch(e){error.value=e instanceof Error?e.message:String(e)}}
async function send(){if(!composer.value.trim()||busy.value||running.value||!store.group||blockedRuns.value.length)return;busy.value=true;const text=composer.value;const groupId=store.group.id;await act(async()=>{store.apply(await bridge.send({groupId,text,sendContext:includeContext.value,requestId:crypto.randomUUID(),targets:targets.value.length ? targets.value : members.value.map(m=>m.provider)}));if(store.group?.id===groupId && composer.value===text)composer.value=''});busy.value=false}

function editGroup(create=false){draft.value=create?{id:crypto.randomUUID(),name:'',icon:'spark',description:'',members:PROVIDERS.map((p,i)=>({provider:p.id,enabled:i<3,role:['严谨的分析师：拆解问题，给出依据。','创意搭档：提出新颖而可执行的想法。','研究助手：识别假设，补充不同视角。'][i]||'独立思考，清晰表达你的观点。'})),createdAt:Date.now()}:{...JSON.parse(JSON.stringify(store.group)),members:PROVIDERS.map(p=>JSON.parse(JSON.stringify(store.group?.members.find(m=>m.provider===p.id)||{provider:p.id,enabled:false,role:'独立思考，清晰表达你的观点。'})))};showGroup.value=true}
async function saveGroup(){if(!draft.value.name.trim()||!draft.value.members.some(m=>m.enabled))return;await act(async()=>{store.apply(await bridge.saveGroup({...draft.value,name:draft.value.name.trim()}));store.selectedId=draft.value.id;showGroup.value=false})}
async function settings(key:string,value:unknown){await act(async()=>store.apply(await bridge.saveSettings({...store.state.settings,[key]:value})))}
async function open(id:ProviderId){await act(()=>bridge.openProvider({provider:id,groupId:store.group?.id}))}
async function cancel(){if(store.group)await act(async()=>store.apply(await bridge.cancel({groupId:store.group!.id})))}
async function reconcile(id:ProviderId,action:'confirm'|'reset'){if(store.group)await act(async()=>store.apply(await bridge.reconcile({groupId:store.group!.id,provider:id,action})))}
const viewModes=ref<Record<string,'chat'|'native'>>({})
try{viewModes.value=JSON.parse(localStorage.getItem('council-view-modes')||'{}')}catch{}
const hasNativeView=!!window.council?.nativeLayout
const nativeMode=computed(()=>!isDemo.value&&!!window.council?.nativeLayout&&viewModes.value[store.group?.id||'']==='native')
function setView(mode:'chat'|'native'){if(!store.group)return;viewModes.value[store.group.id]=mode;try{localStorage.setItem('council-view-modes',JSON.stringify(viewModes.value))}catch{}}
const nativeSuspended=computed(()=>showSettings.value||showGroup.value||showFiles.value||showDelete.value||mentionOpen.value)
const dark = computed(()=>store.state.settings.theme==='dark')
watch(dark,value=>{document.documentElement.dataset.theme=value?'dark':'light'},{immediate:true})
const platform = window.council?.platform || 'browser'
const leftCollapsed = ref(false), rightCollapsed = ref(false)
try { const saved=JSON.parse(localStorage.getItem('council-layout-v1') || '{}'); leftCollapsed.value=saved.left===true;rightCollapsed.value=saved.right===true } catch {}
watch([leftCollapsed,rightCollapsed],([left,right])=>{try{localStorage.setItem('council-layout-v1',JSON.stringify({left,right}))}catch{}})
const focused = computed(()=>leftCollapsed.value && rightCollapsed.value)
let previousLayout=[false,false]
function toggleFocus(){if(focused.value){[leftCollapsed.value,rightCollapsed.value]=previousLayout}else{previousLayout=[leftCollapsed.value,rightCollapsed.value];leftCollapsed.value=true;rightCollapsed.value=true}}
function windowAction(action:'minimize'|'maximize'|'close'){void act(async()=>window.council?.windowAction?.(action))}
const themeOverrides=computed(()=>({common:{primaryColor:dark.value?'#bcbcbc':'#525252',primaryColorHover:dark.value?'#d4d4d4':'#404040',primaryColorPressed:dark.value?'#a3a3a3':'#262626',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'},Button:{borderRadiusMedium:'9999px',borderRadiusSmall:'9999px',heightMedium:'32px'},Input:{borderRadius:'9999px'},Card:{borderRadius:'12px'},Modal:{borderRadius:'12px'}}))
</script>
<template>
<NConfigProvider :theme="dark ? darkTheme : null" :theme-overrides="themeOverrides">
<div class="app-root">
<header class="app-titlebar" :class="{'is-mac':platform==='darwin'}" @dblclick.self="windowAction('maximize')">
 <span class="app-name"><CouncilLogo :size="22"/>Council <span>群策</span></span>
 <div class="titlebar-actions"><button class="mode-tag" @click="showSettings=true">{{isDemo?'DEMO · 演示模式':'LIVE · 网页账号模式'}}</button>
 <IconButton class="icon-button" :aria-expanded="!leftCollapsed" aria-controls="group-sidebar" @click="leftCollapsed=!leftCollapsed" :label="leftCollapsed?'展开群聊侧栏':'收起群聊侧栏'" icon="left"/>
 <IconButton class="icon-button" :aria-expanded="!rightCollapsed" aria-controls="member-sidebar" @click="rightCollapsed=!rightCollapsed" :label="rightCollapsed?'展开成员侧栏':'收起成员侧栏'" icon="right"/>
 <IconButton class="icon-button" :class="{active:focused}" :aria-pressed="focused" @click="toggleFocus" :label="focused?'退出专注模式':'专注模式'" icon="focus"/>
 <span class="titlebar-separator"></span><IconButton class="icon-button" @click="showSettings=true" label="设置" icon="settings"/>
 </div>
 <div v-if="platform!=='darwin' && platform!=='browser'" class="window-controls"><IconButton class="icon-button"  @click="windowAction('minimize')" label="最小化" icon="minus"/><IconButton class="icon-button"  @click="windowAction('maximize')" label="最大化或还原" icon="maximize"/><IconButton class="icon-button window-close"  @click="windowAction('close')" label="关闭窗口" icon="close"/></div>
</header>
<div class="app-shell" :class="{'left-collapsed':leftCollapsed,'right-collapsed':rightCollapsed || !store.group}">
<aside id="group-sidebar" class="sidebar">
 <button class="new-group" title="发起新群聊" aria-label="发起新群聊" @click="editGroup(true)"><Icon name="plus" :size="18"/> <span class="new-group-label">发起新群聊</span></button>
 <label class="search"><Icon name="search" :size="16"/><input v-model="search" placeholder="搜索群聊" aria-label="搜索群聊"/><kbd>⌕</kbd></label>
 <div class="section-label">我的群聊 <span>{{ store.state.groups.length }}</span></div>
 <nav class="group-list"><button v-for="g in groups" :key="g.id" class="group-item" :title="g.name" :class="{selected:store.group?.id===g.id}" @click="store.selectedId=g.id"><span class="group-symbol" ><Icon :name="g.icon || 'spark'" :size="19"/></span><span class="group-copy"><strong>{{g.name}}</strong><small>{{g.members.filter(m=>m.enabled).length}} 位 AI 成员 · 本地群聊</small></span><span v-if="store.group?.id===g.id" class="selected-dot"></span></button><div v-if="!groups.length" class="no-results">没有找到群聊</div></nav>
 <div class="sidebar-bottom"><div class="local-note"><Icon name="shield" :size="18"/><div>你的想法，留在你的电脑<small>本地存储 · 独立账号会话</small></div></div><button class="settings-button" @click="showSettings=true"><Icon name="settings" :size="18"/> 设置与连接 <span>↗</span></button><div class="profile"><div class="profile-avatar">我</div><div>个人工作空间<small>COUNCIL / LOCAL FIRST</small></div><span class="version">v0.1</span></div></div>
</aside>
<main class="workspace">
 <template v-if="store.group">
 <header class="conversation-header">
  <IconButton class="group-icon-trigger" label="修改群聊图标" :icon="store.group.icon || 'spark'" @click="editGroup()"/>
  <div class="conversation-heading"><h1 :title="store.group.name">{{store.group.name}}</h1><p :title="store.group.description">{{store.group.description}}</p></div>
  <div v-if="!isDemo && hasNativeView" class="view-toggle" aria-label="群聊展示模式"><button :class="{active:!nativeMode}" :aria-pressed="!nativeMode" @click="setView('chat')">对话</button><button :class="{active:nativeMode}" :aria-pressed="nativeMode" @click="setView('native')">原网页</button></div>
  <span class="conversation-count">{{members.length}} 位 AI</span>
  <IconButton v-if="isDemo" label="演示空间：回复由本地模拟生成，不连接真实 AI" icon="spark" @click="showSettings=true"/>
  <IconButton v-else label="仅保存在本地 · 使用自己的官网账号，首次请在原网页登录；网页适配可能失效" icon="shield" @click="showSettings=true"/>
  <IconButton class="group-edit" label="编辑群聊" icon="edit" @click="editGroup()"/><IconButton label="删除群聊" icon="trash" @click="requestDelete(store.group)"/>
 </header>
 <NativeConversation v-if="nativeMode" :key="store.group.id" :group-id="store.group.id" :members="members.map(m=>m.provider)" :runs="runs" :suspended="nativeSuspended"/>
 <MessageTimeline v-else :messages="messages" :members="members" :group-id="store.group.id" @open="id=>open(id as ProviderId)" @suggest="composer='请从各自的视角，帮我设计一个简洁、实用的 AI 群聊产品。'"/>
 <div class="composer-area">
  <div v-for="run in blockedRuns" :key="run.provider" class="recovery-banner" role="status"><span><strong>{{provider(run.provider)?.name}} 待恢复</strong> · {{run.conversationUrl?'上次发送结果未确认，可核对原会话或重新开始。':'上次发送未取得会话地址，请新建会话后继续。'}}</span><button v-if="run.conversationUrl" @click="open(run.provider)">核对原会话</button><button v-if="run.conversationUrl" @click="reconcile(run.provider,'confirm')">已核对，继续原会话</button><button @click="reconcile(run.provider,'reset')">新建会话并解除阻塞</button></div>
  <div v-if="error" class="error-banner" role="alert">{{error}}<IconButton @click="error=''"  label="关闭错误" icon="close"/></div>
  <div class="composer-box">
   <ComposerInput v-model="composer" @mention-open="mentionOpen=$event" :disabled="busy" :members="members.map(m=>m.provider)" @send="send" @mention="id=>{if(!targets.includes(id))targets=[...targets,id]}"/>
   <div class="composer-tools"><IconButton @click="showFiles=true" label="文件与原网页" icon="plus"/>
    <div class="routing" aria-label="选择回复成员"><button :class="{active:!targets.length}" :aria-pressed="!targets.length" @click="targets=[]">全部成员</button><button v-for="m in members" :key="m.provider" class="recipient-chip" :class="{active:targets.includes(m.provider)}" :style="{'--provider-color':provider(m.provider)?.color}" :aria-label="'@'+provider(m.provider)?.name" :aria-pressed="targets.includes(m.provider)" @click="toggleTarget(m.provider)"><span class="recipient-avatar"><ProviderLogo :provider="m.provider"/></span><span>{{provider(m.provider)?.name}}</span><Icon v-if="targets.includes(m.provider)" name="check" :size="12"/></button></div>
    <IconButton v-if="running" class="cancel-button" label="停止" icon="stop" @click="cancel()"/><IconButton v-else class="send-button" label="发送" icon="send" :disabled="!composer.trim() || busy" @click="send"/>
   </div>
  </div>
  <div class="composer-context"><NSwitch v-model:value="includeContext" size="small" aria-label="携带群聊上下文" :disabled="busy || running"/><span @click="!busy && !running && (includeContext=!includeContext)">携带群聊上下文</span><small>{{includeContext ? '附带最近的群聊内容' : '仅发送当前输入'}}</small></div>
  <div class="composer-hint">Enter 发送 · Shift + Enter 换行 <span>AI 的回答可能有误，请独立核实。</span></div>
 </div>
 </template><div v-else class="empty-loading">{{store.ready?'创建一个群聊，开始探索。':'正在打开你的工作空间…'}}<button @click="editGroup(true)">创建群聊</button></div>
</main>
<aside id="member-sidebar" class="members-panel" v-if="store.group" v-show="!rightCollapsed"><div class="panel-heading"><span>群聊成员</span><span class="count-pill">{{members.length}}</span><IconButton  @click="editGroup()" label="编辑成员" icon="plus"/></div><p class="panel-subtitle">各有所长，也一起思考。</p>
 <div class="member-list"><div class="member-card" v-for="m in members" :key="m.provider"><div class="member-top"><div class="ai-avatar" :style="{background:provider(m.provider)?.color}"><ProviderLogo :provider="m.provider"/></div><div><strong>{{provider(m.provider)?.name}}</strong><small :class="{'is-thinking':['sending','streaming'].includes(runs.find(r=>r.provider===m.provider)?.status || '')}"><i></i>{{status(m.provider)}}</small></div><IconButton class="member-open" @click="open(m.provider)" :label="'打开 '+provider(m.provider)?.name+' 原网页'" icon="arrow"/></div><p class="member-role">{{m.role}}</p><div v-if="runs.find(r=>r.provider===m.provider)?.detail" class="run-detail">{{runs.find(r=>r.provider===m.provider)?.detail}}</div><div v-if="runs.find(r=>r.provider===m.provider)?.init==='uncertain' || runs.find(r=>r.provider===m.provider)?.status==='uncertain' || runs.find(r=>r.provider===m.provider)?.init==='done'" class="reconcile"><p>{{runs.find(r=>r.provider===m.provider)?.conversationUrl?'核对原会话后可继续，也可以新建会话重新开始。':'尚未绑定官网会话，请新建会话后继续。旧消息不会重发。'}}</p><button v-if="runs.find(r=>r.provider===m.provider)?.conversationUrl" @click="reconcile(m.provider,'confirm')">已核对，继续原会话</button><button @click="reconcile(m.provider,'reset')">新建会话并解除阻塞</button></div></div></div>
 <button class="add-member" @click="editGroup()"><Icon name="plus" :size="16"/> 管理 AI 成员</button>
 <div class="role-note"><div><Icon name="book" :size="16"/><strong>不同角色，更好的讨论</strong></div><p>角色说明作为普通首条用户消息发送，不是真正系统提示。每位成员在自己的网页会话中独立回答。</p><button @click="editGroup()">编辑角色说明 <span>→</span></button></div>
 <div class="native-tip"><Icon name="globe" :size="20"/><strong>完整能力，在原网页</strong><p>登录、上传文件与复杂内容，<br/>都可以回到 AI 官网继续。</p><button @click="showFiles=true">打开网页工作台 <Icon name="arrow" :size="14"/></button></div>
 <div class="panel-footer">MANY MINDS. ONE CONVERSATION.</div>
</aside>
</div>
</div>
<NDrawer v-model:show="showSettings" :width="440"><NDrawerContent title="设置与连接" closable><div class="settings-intro"><span class="big-brand">✦</span><h2>为你的工作方式而设</h2><p>本地优先，不收集你的账号密码。</p></div><NFormItem label="外观"><NSelect :value="store.state.settings.theme" :options="[{label:'浅色',value:'light'},{label:'深色',value:'dark'}]" @update:value="v=>settings('theme',v)"/></NFormItem><NFormItem label="运行模式"><NSelect :value="store.state.settings.mode" :options="[{label:'DEMO · 本地演示（模拟回复）',value:'demo'},{label:'LIVE · 真实网页账号',value:'live',disabled:isBrowserDemo}]" @update:value="v=>settings('mode',v)"/></NFormItem><NAlert v-if="isBrowserDemo" type="info" title="当前是浏览器演示">真实官网连接仅在桌面应用中提供。此处不会登录或调用真实 AI。</NAlert><p class="settings-privacy">是否携带群聊上下文可在输入框下方切换。关闭后仅发送当前输入，官网会话仍保留自身历史；角色说明仅在首次发送时附加。</p><h3 class="drawer-section-title">账号连接</h3><div class="connection-row" v-for="p in PROVIDERS" :key="p.id"><span class="ai-avatar small" :style="{background:p.color}"><ProviderLogo :provider="p.id"/></span><div><strong>{{p.name}}</strong><small>{{p.experimental?'仅原网页 · 未实现自动收发':'文字收发 · 自动检测网页'}}</small></div><IconButton :label="'打开 '+p.name+' 原网页'" icon="arrow" @click="open(p.id)"/></div><NAlert type="warning" title="第一版能力边界" class="limitations">DeepSeek、豆包、Kimi、通义千问支持网页文字收发；Gemini 目前仅支持原网页操作。限流、会员额度或网页改版可能影响使用。验证码、登录、文件上传由你在官网完成；取消不会保证中止官网生成。</NAlert><p class="settings-privacy">网页会话使用独立持久化分区。群聊保存在本地；发送到官网的内容仍受对应服务条款约束。</p><p class="settings-error" v-if="error">{{error}}</p></NDrawerContent></NDrawer>
<NModal v-model:show="showGroup" preset="card" :title="store.state.groups.some(g=>g.id===draft.id)?'编辑群聊':'发起一个新群聊'" class="group-modal" :style="{width:'590px',maxWidth:'calc(100vw - 32px)'}"><p class="modal-description">选好你的 AI 搭档，让每个问题都有不同视角。</p><NFormItem label="群聊图标"><div class="group-icon-picker" role="group" aria-label="群聊图标"><IconButton v-for="icon in GROUP_ICONS" :key="icon" :icon="icon" :label="iconNames[icon]+'图标'" :aria-pressed="(draft.icon || 'spark')===icon" :class="{selected:(draft.icon || 'spark')===icon}" @click="draft.icon=icon"/></div></NFormItem><NFormItem label="群聊名称"><NInput v-model:value="draft.name" placeholder="例如：产品灵感实验室" :maxlength="60"/></NFormItem><NFormItem label="一句话描述"><NInput v-model:value="draft.description" placeholder="这个群聊想一起探索什么？" :maxlength="160"/></NFormItem><div class="editor-members"><div v-for="m in draft.members" :key="m.provider" class="editor-member"><div><NCheckbox v-model:checked="m.enabled"><strong>{{provider(m.provider)?.name}}</strong></NCheckbox><span>{{provider(m.provider)?.experimental?'实验性':'文字适配'}}</span></div><NInput v-if="m.enabled" v-model:value="m.role" type="textarea" :autosize="{minRows:2,maxRows:4}" :maxlength="2000" placeholder="角色说明（随首次消息发送，不是系统指令）"/></div></div><p class="modal-description">角色是普通首条用户消息，不是真正系统提示。已开始的真实会话需重置初始化；下次发送会新建独立对话并应用新角色，不会自动重发。</p><p class="settings-error" v-if="error">{{error}}</p><template #footer><div class="modal-actions"><IconButton v-if="store.state.groups.some(g=>g.id===draft.id)" class="delete-group-action" label="删除群聊" icon="trash" @click="requestDelete(draft)"/><NButton @click="showGroup=false">取消</NButton><NButton type="primary" :disabled="!draft.name.trim()||!draft.members.some(m=>m.enabled)" @click="saveGroup">保存群聊</NButton></div></template></NModal>
<NModal v-model:show="showFiles" preset="card" title="原网页工作台" :style="{width:'490px',maxWidth:'calc(100vw - 32px)'}"><NAlert type="info" title="文件与完整内容，请在官网操作">此版本不自动上传文件。图片、复杂表格、生成文件或登录验证，请打开对应原网页。由官网发起的下载通过原会话处理，不自动打开。</NAlert><div class="connection-row" v-for="p in PROVIDERS" :key="p.id"><span class="ai-avatar small" :style="{background:p.color}"><ProviderLogo :provider="p.id"/></span><div><strong>{{p.name}}</strong><small>{{isDemo?'演示模式，不连接账号':'独立账号会话'}}</small></div><IconButton :label="'打开 '+p.name+' 原网页'" icon="arrow" @click="open(p.id)"/></div><p class="settings-error" v-if="error">{{error}}</p></NModal>
<NModal v-model:show="showDelete" preset="card" title="删除群聊" :mask-closable="!deleting" :close-on-esc="!deleting" :closable="!deleting" :style="{width:'420px',maxWidth:'calc(100vw - 32px)'}"><p class="delete-description">确定删除「{{deleteTarget?.name}}」？本地群聊记录将永久删除，无法恢复。官网中的聊天记录和账号登录状态会保留。</p><p v-if="deleteError" class="settings-error" role="alert">{{deleteError}}</p><template #footer><div class="modal-actions"><NButton :disabled="deleting" @click="showDelete=false">取消</NButton><NButton type="error" :loading="deleting" @click="deleteGroup">确认删除</NButton></div></template></NModal>
</NConfigProvider>
</template>
