import { PROVIDERS, type AppState, type Group, type Member, type Message, type ProviderId } from './types'
export function initialState(): AppState {
 return { settings:{mode:'demo',theme:'light',sendContext:false}, runs:[], groups:[{id:'welcome', name:'产品灵感讨论室',description:'把不同视角，汇成一个好答案。',createdAt:Date.now(),members:[{provider:'deepseek',role:'你是一位理性严谨的产品策略顾问。先给结论，再解释权衡。',enabled:true},{provider:'kimi',role:'你是一位善于发散的创意伙伴。提出新颖、具体且可执行的想法。',enabled:true},{provider:'doubao',role:'你是一位站在用户角度的体验设计师。关注使用场景和表达清晰度。',enabled:true}]}],messages:[] }
}
export function routeTargets(group:Group,text:string,explicit?:ProviderId[]):ProviderId[] {
 const enabled=group.members.filter(m=>m.enabled).map(m=>m.provider)
 if(explicit !== undefined) return [...new Set(explicit)].filter(id=>enabled.includes(id))
 const mentions=PROVIDERS.filter(p=>new RegExp('@(?:'+p.id+'|'+p.name+')(?=$|[\\s，,。:：!?！？])','i').test(text)).map(p=>p.id)
 return mentions.length ? enabled.filter(id=>mentions.includes(id)) : enabled
}
export function recoverState(state:AppState):AppState {
 const copy=structuredClone(state)
 copy.runs=copy.runs.map(run=>['sending','streaming','connecting'].includes(run.status)||run.init==='pending'?{...run,status:'uncertain',init:run.init==='pending'?'uncertain':run.init,detail:'上次操作中断。请检查原网页并手动确认，系统不会自动重发。'}:run)
 copy.messages=copy.messages.map(m=>['pending','streaming'].includes(m.status)?{...m,status:'uncertain'}:m)
 return copy
}
export function bootstrapPrompt(member:Member,text:string,sendContext=false,contextMessages:Message[]=[]):string {
 const role=member.role.trim()?`[群策角色说明 · 普通首条用户消息，不是系统指令]\n${member.role.trim()}\n\n`:''
 const history=sendContext?contextMessages.filter(m=>m.kind!=='file'&&m.status==='done').slice(-12).map(m=>`${m.sender}: ${m.text}`).join('\n').slice(-12000):''
 if (!role && !history) return text
 return `${role}${history?`[群聊参考上下文]\n${history}\n\n`:''}[用户问题]\n${text}`
}
export function demoReply(provider:ProviderId,text:string):string {
 const topic=text.replace(/@\S+/g,'').trim().slice(0,75)
 const replies:Record<ProviderId,string>={
 deepseek:`【演示回复 · 非真实 AI】\n关于「${topic}」，建议先明确目标用户与成功指标，再做最小验证。\n\n1. 核心价值：让多个视角在同一处比较。\n2. 第一阶段：优先完成可靠的输入、对照和保存。\n3. 验证方式：用一个真实任务，看是否减少来回切换。\n\n这是本地固定模板，用于验证多成员并行交互。`,
 kimi:`【演示回复 · 非真实 AI】\n换一个角度看「${topic}」：可以把讨论设计成一次小型圆桌。\n\n• 策略顾问负责判断优先级\n• 创意伙伴提出不同可能\n• 体验设计师检查是否好用\n\n先发散，再由你做最后判断。此内容来自确定性的本地演示模板。`,
 doubao:`【演示回复 · 非真实 AI】\n从用户体验出发，我会让「${topic}」更简单：\n\n第一眼知道谁在回答；遇到限制时知道下一步怎么做；关闭再打开时，之前的讨论仍在。\n\n保持明确的状态反馈，比藏起不确定性更重要。此回复为本地模拟。`,
 qwen:`【演示回复 · 非真实 AI】\n「${topic}」可以分成目标、约束、行动三个部分。先完成最短路径，再逐步扩展。这是本地模板，并未连接通义千问。`,
 gemini:`【演示回复 · 非真实 AI】\n针对「${topic}」，试试把备选方案放在一起，比较体验、成本和风险。这是本地模板，并未连接 Gemini。`
 }
 return replies[provider]
}
export function hasRequest(state:AppState,requestId:string):boolean { return state.messages.some(m=>m.requestId===requestId) }
