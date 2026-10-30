<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string,string> = {
 refresh:'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17',
 trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',code:'m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',bulb:'M9 18h6M9 21h6M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Z',target:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 11v2',coffee:'M3 4h14v10a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V4ZM17 5h2a3 3 0 1 1 0 6h-2M2 22h18',
 copy:'M9 9h11v12H9Z M5 15H3V3h12v2',down:'M12 4v16M5 13l7 7 7-7',
 left:'M4 4h16v16H4Z M9 4v16',right:'M4 4h16v16H4Z M15 4v16',focus:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',minus:'M5 12h14',maximize:'M5 5h14v14H5Z',
 chat:'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
 plus:'M12 5v14M5 12h14', search:'m21 21-4.4-4.4M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
 arrow:'M7 17 17 7M7 7h10v10',send:'m22 2-7 20-4-9L2 9l20-7ZM22 2 11 13',
 folder:'M3 5h6l2 3h10v12H3V5Z',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
 globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
 close:'m6 6 12 12M18 6 6 18',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
 file:'M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 13h8M8 17h5',stop:'M6 6h12v12H6V6Z',
 chevron:'m9 5 7 7-7 7', check:'m5 12 4 4L19 6',edit:'m16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5',
 book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm9 2v16'
}
</script>
<template><svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.chat"/></svg></template>
