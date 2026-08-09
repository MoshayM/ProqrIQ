import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure a single instance of React and Leaflet are used across all chunks.
    // react-leaflet v5 fails with "r is not a function" in production when
    // duplicate copies are resolved via different module graph paths.
    dedupe: ['react', 'react-dom', 'leaflet', 'react-leaflet'],
    alias: {
      '@':       path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  optimizeDeps: {
    include: ['leaflet', 'react-leaflet'],
  },
  server: {
    port: 5299,
    proxy: {
      '/api': {
        target: 'http://localhost:3099',
        changeOrigin: true,
      },
    },
  },
})
