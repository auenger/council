<script setup lang="ts">
import {ref} from 'vue'
import IconButton from './IconButton.vue'
import {copyText} from './clipboard'
const props=defineProps<{code:string;language?:string}>()
const copied=ref(false),failed=ref(false)
async function copy(){try{await copyText(props.code);copied.value=true;failed.value=false}catch{failed.value=true}}
</script>
<template><section class="code-block"><header><span>{{language || 'text'}}</span><IconButton :label="failed?'复制失败，点击重试':copied?'代码已复制':'复制代码'" :icon="copied?'check':'copy'" @click="copy" @mouseleave="copied=false"/></header><pre><code>{{code}}</code></pre></section></template>
