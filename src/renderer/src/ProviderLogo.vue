<script setup lang="ts">
import deepseek from './assets/providers/deepseek.png'
import doubao from './assets/providers/doubao.png'
import kimi from './assets/providers/kimi.png'
import qwen from './assets/providers/qwen.png'
import gemini from './assets/providers/gemini.png'
import type {ProviderId} from '../../shared/types'
defineProps<{provider:ProviderId}>()
const logos:Record<ProviderId,string>={deepseek,doubao,kimi,qwen,gemini}
</script>
<template><img class="provider-logo" :src="logos[provider]" alt="" aria-hidden="true" draggable="false"/></template>
<style scoped>.provider-logo{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit;background:#fff}</style>
