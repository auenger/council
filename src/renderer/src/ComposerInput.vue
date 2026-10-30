<script setup lang="ts">
import ProviderLogo from './ProviderLogo.vue'
import {ref,watch,onBeforeUnmount,nextTick} from 'vue'
import {PROVIDERS,type ProviderId} from '../../shared/types'
const props=defineProps<{modelValue:string;disabled:boolean;members:ProviderId[]}>()
const emit=defineEmits<{'update:modelValue':[value:string];send:[];mention:[id:ProviderId];'mention-open':[open:boolean]}>()
const input=ref<HTMLTextAreaElement>(),suggestions=ref<typeof PROVIDERS>([]),active=ref(0)
let mentionStart=-1,observer:ResizeObserver|undefined,lastWidth=0
function resize(){const el=input.value;if(!el)return;el.style.height='0px';el.style.height=Math.min(186,Math.max(22,el.scrollHeight))+'px';el.style.overflowY=el.scrollHeight>186?'auto':'hidden'}
watch(input,el=>{observer?.disconnect();if(el){resize();observer=new ResizeObserver(()=>{if(el.clientWidth!==lastWidth){lastWidth=el.clientWidth;resize()}});observer.observe(el)}},{flush:'post'})
watch(()=>props.modelValue,async()=>{await nextTick();resize();if(!props.modelValue)suggestions.value=[]})
watch(()=>suggestions.value.length>0,open=>emit('mention-open',open),{flush:'sync'})
onBeforeUnmount(()=>{observer?.disconnect();emit('mention-open',false)})
function detect(){const el=input.value;if(!el)return;const before=el.value.slice(0,el.selectionStart);const match=before.match(/(?:^|\s)@([^\s@]*)$/);if(!match){suggestions.value=[];return}mentionStart=before.lastIndexOf('@');const query=match[1].toLowerCase();suggestions.value=PROVIDERS.filter(p=>props.members.includes(p.id)&&(p.name.toLowerCase().includes(query)||p.id.includes(query)));active.value=0}
function change(event:Event){emit('update:modelValue',(event.target as HTMLTextAreaElement).value);resize();detect()}
async function choose(id:ProviderId){const el=input.value,p=PROVIDERS.find(p=>p.id===id);if(!el||!p)return;const end=el.selectionStart;const prefix=el.value.slice(0,mentionStart)+'@'+p.name+' ';emit('update:modelValue',prefix+el.value.slice(end));emit('mention',id);suggestions.value=[];await nextTick();el.focus();el.setSelectionRange(prefix.length,prefix.length);resize()}
function keydown(e:KeyboardEvent){if(e.isComposing)return;if(suggestions.value.length){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active.value=(active.value+(e.key==='ArrowDown'?1:-1)+suggestions.value.length)%suggestions.value.length;return}if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();void choose(suggestions.value[active.value].id);return}if(e.key==='Escape'){e.preventDefault();suggestions.value=[];return}}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();emit('send')}}
</script>
<template><div class="composer-input"><div v-if="suggestions.length" id="mention-options" class="mention-menu" role="listbox" aria-label="选择 AI 成员"><div class="mention-menu-label">提及 AI 成员</div><button v-for="(p,index) in suggestions" :id="'mention-'+p.id" :key="p.id" role="option" :aria-selected="active===index" :class="{highlighted:active===index}" @mousedown.prevent @click="choose(p.id)"><span class="mention-avatar" :style="{background:p.color}"><ProviderLogo :provider="p.id"/></span><strong>{{p.name}}</strong><span>↵</span></button></div><textarea ref="input" :value="modelValue" :disabled="disabled" rows="1" aria-label="消息内容" :aria-expanded="suggestions.length>0" :aria-controls="suggestions.length?'mention-options':undefined" :aria-activedescendant="suggestions.length?'mention-'+suggestions[active]?.id:undefined" aria-autocomplete="list" placeholder="分享你的想法，输入 @ 选择 AI…" maxlength="20000" @input="change" @keydown="keydown" @click="detect" @blur="suggestions=[]"></textarea></div></template>
