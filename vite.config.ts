import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileApiPlugin } from './vite-plugin-file-api'

export default defineConfig({
  plugins: [react(), tailwindcss(), fileApiPlugin()],
  // Ensure a single copy of React / Konva (pnpm + react-konva would otherwise
  // resolve duplicates, breaking hooks and the Konva renderer).
  resolve: {
    dedupe: ['react', 'react-dom', 'konva', 'react-konva'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'konva', 'react-konva'],
  },
  server: {
    port: 5173,
  },
})
