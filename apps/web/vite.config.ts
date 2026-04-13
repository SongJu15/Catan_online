import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@catan/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      // 新增别名，方便后续在组件中引入图片，不用写很长的 ../../../
      '@assets': path.resolve(__dirname, './src/assets'), 
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // 改为 512KB。大于 512KB 的大背景图会独立输出，小于的卡牌图标会转 Base64
    assetsInlineLimit: 4096, 
  }
})
