import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api/catalog': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/catalog/, '/api')
      },
      '/api/users': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/users/, '/api')
      },
      '/api/auth': {
        target: 'http://localhost:3002',
        changeOrigin: true
      },
      '/api/orders': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/orders/, '/api')
      },
      '/api/cart': {
        target: 'http://localhost:3003',
        changeOrigin: true
      },
      '/api/payments': {
        target: 'http://localhost:3004',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})