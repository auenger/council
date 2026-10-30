<script setup lang="ts">
import { NTooltip } from 'naive-ui'
import Icon from './Icon.vue'
defineOptions({inheritAttrs:false})
defineProps<{label:string;icon:string;disabled?:boolean;size?:number;placement?:'top'|'bottom'}>()
</script>
<template><NTooltip :delay="500" :show-arrow="false" :placement="placement || 'bottom'" :style="{borderRadius:'12px',fontSize:'13px',padding:'6px 10px',background:'#262626',color:'#fff'}"><template #trigger><button v-bind="$attrs" class="icon-button" :aria-label="label" :disabled="disabled"><Icon :name="icon" :size="size || 16"/></button></template><span role="tooltip">{{label}}</span></NTooltip></template>
