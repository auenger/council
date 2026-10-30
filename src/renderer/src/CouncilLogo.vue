<script setup lang="ts">
import mark from './assets/brand/council-mark.svg'
defineProps<{size?:number}>()
</script>
<template><img :src="mark" :width="size || 24" :height="size || 24" alt="" aria-hidden="true" class="council-logo"/></template>
<style scoped>.council-logo{background:#faf9f5;border-radius:24%;padding:2px;object-fit:contain}</style>
