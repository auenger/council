import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({root:'src/renderer',base:'./',plugins:[vue({template:{compilerOptions:{isCustomElement:tag=>tag==='vue-advanced-chat'}}})],build:{outDir:'../../web-demo',emptyOutDir:true}})
