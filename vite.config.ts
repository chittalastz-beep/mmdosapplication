import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mmdos-icon.svg'],
      manifest: {
        name: 'MMDOS Application - Mantra Manor Duplex Owners Society',
        short_name: 'MMDOS',
        description: 'Society management workspace for Mantra Manor Duplex Owners Society.',
        theme_color: '#f5f7f5',
        background_color: '#f5f7f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/mmdos-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules[\\/]/ }],
        },
      },
    },
  },
})
