import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5220, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
})
