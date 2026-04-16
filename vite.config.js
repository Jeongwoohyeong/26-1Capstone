import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Electron에서 file:// 프로토콜로 로드 시 상대 경로 필수
})
