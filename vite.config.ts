import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    // /api 转发给本地 wrangler pages dev（Pages Functions + R2 模拟），
    // 需另开终端运行：npx wrangler pages dev dist --port 8789
    //（8788 已被主站本地开发占用）
    proxy: { '/api': 'http://localhost:8789' },
  },
})
