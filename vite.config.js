import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/qr-credential-verifier/',
  server: {
    allowedHosts: ['.trycloudflare.com']
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'デジタル資格者証 QR検証',
        short_name: 'QR検証',
        description: 'デジタル資格者証のQRコードをスキャンして検証サイトへ誘導するアプリ',
        theme_color: '#1a56db',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst'
          }
        ]
      }
    })
  ]
})
