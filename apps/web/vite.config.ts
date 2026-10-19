import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@wapo/sdk': new URL('../../packages/sdk/src/index.ts', import.meta.url).pathname,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['radix-ui', 'cmdk'],
          'vendor-icons': ['lucide-react'],
          'vendor-motion': ['motion'],
          'vendor-data': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
  server: { port: 5173 },
})
