import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppState } from '../../shared/types'
import { bridge } from './bridge'
export const useCouncil = defineStore('council', () => {
 const state = ref<AppState>({ groups:[], messages:[], runs:[], settings:{mode:'demo',theme:'light',sendContext:false} })
 const selectedId = ref('')
 const ready = ref(false)
 const group = computed(() => state.value.groups.find(g=>g.id===selectedId.value) || state.value.groups[0])
 function apply(next:AppState) { state.value=next; if(!next.groups.some(g=>g.id===selectedId.value)) selectedId.value=next.groups[0]?.id || '' }
 async function init() { apply(await bridge.getState()); ready.value=true; return bridge.onState(apply) }
 return { state, selectedId, ready, group, apply, init }
})
