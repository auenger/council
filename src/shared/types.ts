export type ProviderId = 'deepseek' | 'doubao' | 'kimi' | 'qwen' | 'gemini'
export type Status = 'idle' | 'connecting' | 'login-required' | 'ready' | 'sending' | 'streaming' | 'error' | 'cancelled' | 'uncertain' | 'experimental'
export interface Provider { id: ProviderId; name: string; color: string; letter: string; url: string; experimental: boolean }
export const PROVIDERS: Provider[] = [
 { id:'deepseek', name:'DeepSeek',color:'#4d6bfe',letter:'D',url:'https://chat.deepseek.com/',experimental:false },
 { id:'doubao', name:'豆包',color:'#7367d5',letter:'豆',url:'https://www.doubao.com/chat/',experimental:false },
 { id:'kimi', name:'Kimi',color:'#242629',letter:'K',url:'https://www.kimi.com/',experimental:false },
 { id:'qwen', name:'通义千问',color:'#7256ef',letter:'通',url:'https://chat.qwen.ai/',experimental:false },
 { id:'gemini', name:'Gemini',color:'#3784ef',letter:'G',url:'https://gemini.google.com/app',experimental:true }
]
export interface Member { provider: ProviderId; role: string; enabled: boolean }
export const GROUP_ICONS = ['spark','chat','book','globe','code','bulb','target','coffee'] as const
export type GroupIcon = typeof GROUP_ICONS[number]
export interface Group { icon?: GroupIcon; id: string; name: string; description: string; members: Member[]; createdAt: number }
export interface FileCard { name: string; status: 'native-only'|'downloading'|'completed'|'failed'; path?: string; detail?: string }
export interface MessageVideo { title: string; index: number; url?: string }
export interface Message { sourceText?: string; videos?: MessageVideo[]; sourceMessageId?: string; sourceUrl?: string; id: string; groupId: string; sender: 'user'|'system'|ProviderId; text: string; createdAt: number; status: 'pending'|'streaming'|'done'|'cancelled'|'error'|'uncertain'; requestId?: string; kind?: 'text'|'file'|'notice'; file?: FileCard; demo?: boolean }
export interface ProviderRun { groupId: string; provider: ProviderId; status: Status; init: 'none'|'pending'|'done'|'uncertain'; requestId?: string; detail?: string; conversationUrl?: string }
export interface Settings { mode: 'demo'|'live'; theme: 'light'|'dark'; sendContext: boolean }
export interface AppState { groups: Group[]; messages: Message[]; settings: Settings; runs: ProviderRun[] }
export interface SendInput { groupId: string; text: string; requestId: string; targets?: ProviderId[]; sendContext?: boolean }
export interface CouncilBridge {
 refreshMessage?(input:{messageId:string}):Promise<AppState>;
 reloadProvider?(input:{groupId:string;provider:ProviderId}):Promise<void>;
 nativeLayout?(input:{groupId:string;panes:{provider:ProviderId;bounds:{x:number;y:number;width:number;height:number}}[]}):Promise<{provider:ProviderId;loading:boolean;error:string}[]>;
 platform?: string;
 copyText?(text:string): Promise<void>;
 windowAction?(action: 'minimize'|'maximize'|'close'): Promise<void>;
 getState(): Promise<AppState>;
 saveGroup(group: Group): Promise<AppState>;
 deleteGroup(input: {groupId:string}): Promise<AppState>;
 saveSettings(settings: Settings): Promise<AppState>;
 send(input: SendInput): Promise<AppState>;
 cancel(input: {groupId: string}): Promise<AppState>;
 openMessageVideo(input: {messageId:string;index:number}): Promise<void>;
 openProvider(input: {provider: ProviderId; groupId?: string}): Promise<void>;
 reconcile(input: {groupId: string; provider: ProviderId; action:'confirm'|'reset'}): Promise<AppState>;
 onState(callback: (state: AppState)=>void): ()=>void;
}
declare global { interface Window { council?: CouncilBridge } }
