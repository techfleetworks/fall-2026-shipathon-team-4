import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // In local development, forward /api requests to the Express server (`npm run dev:api`).
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  // Split big libraries into their own files: smaller downloads per file, and they stay cached
  // between deploys when only the app's own code changes.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Appointment Ready',
        short_name: 'Appt Ready',
        description: 'Tell your story in your own words. Walk into your visit with a one-page brief.',
        theme_color: '#1F6B63',
        background_color: '#F5F2EB',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never answer API addresses with the offline app shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
