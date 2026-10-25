import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        filmStudio: resolve(process.cwd(), 'film-studio.html')
      }
    }
  }
})
