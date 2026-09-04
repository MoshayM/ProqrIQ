import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(async () => {
  const plugins: Plugin[] = [react()]

  // Dynamic import so the build doesn't hard-fail on platforms (e.g. Vercel)
  // where npm workspace hoisting puts vite-plugin-pwa outside the ESM loader's
  // resolution scope. PWA is fully enabled in local dev and any env where the
  // package is locally resolvable.
  try {
    const { VitePWA } = await import('vite-plugin-pwa')
    plugins.push(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-*.png', 'og-image.png'],
      manifest: false, // we use our own public/manifest.json
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false },
    }) as Plugin)
  } catch {
    // vite-plugin-pwa unavailable — service worker skipped, manifest.json still served
  }

  return {
    plugins,
    define: {
      'global': 'globalThis',
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'leaflet', 'react-leaflet'],
      alias: {
        '@':       path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    optimizeDeps: {
      include: ['leaflet', 'react-leaflet'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
              return 'leaflet'
            }
          },
        },
      },
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
  }
})
