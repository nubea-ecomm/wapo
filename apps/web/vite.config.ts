import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const vendorChunks = [
  ['vendor-charts', ['recharts']],
  ['vendor-ui', ['radix-ui', 'cmdk']],
  ['vendor-icons', ['lucide-react']],
  ['vendor-motion', ['motion']],
  ['vendor-data', ['@tanstack/react-query']],
  ['vendor-react', ['react', 'react-dom', 'react-router-dom']],
] as const

function manualChunks(id: string) {
  if (!id.includes('/node_modules/')) return

  for (const [chunk, packages] of vendorChunks) {
    if (packages.some((name) => id.includes(`/node_modules/${name}/`))) {
      return chunk
    }
  }
}

export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@nubea-ecomm/wapo-sdk': new URL(
        '../../packages/sdk/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: { port: 5173 },
})
