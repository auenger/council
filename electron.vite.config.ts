import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
export default defineConfig({
 main:{plugins:[externalizeDepsPlugin()],build:{rollupOptions:{input:{index:resolve('src/main/index.ts'),'db.worker':resolve('src/main/db.worker.ts')},output:{entryFileNames:'[name].js'}}}},
 preload:{plugins:[externalizeDepsPlugin()],build:{rollupOptions:{input:resolve('src/preload/index.ts')}}},
 renderer:{root:'src/renderer',plugins:[vue({template:{compilerOptions:{isCustomElement:tag=>tag==='vue-advanced-chat'}}})],build:{rollupOptions:{input:resolve('src/renderer/index.html')}}}
})
