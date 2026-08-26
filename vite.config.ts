import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Music Fly',
        short_name: 'Music Fly',
        description: 'Player de musica offline-first, sem anuncios e sem rastreamento.',
        lang: 'pt-BR',
        theme_color: '#0e0e12',
        background_color: '#0e0e12',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        categories: ['music', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Faixas de audio podem ser grandes; o cache offline delas e feito
        // manualmente no IndexedDB, nao pelo Workbox.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Capas de album do acervo livre: cache longo, atualizacao em background.
            urlPattern: /^https:\/\/archive\.org\/services\/img\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'capas-acervo',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Buscas no acervo: rede primeiro, com copia para uso offline.
            urlPattern: /^https:\/\/archive\.org\/(advancedsearch\.php|metadata\/)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'busca-acervo',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
