import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// @ts-ignore - ws types might be missing
import { WebSocket } from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore - Polyfill WebSocket
  globalThis.WebSocket = WebSocket;
}

export default defineConfig({
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['mediainfo.js'],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths({
      projectDiscovery: 'lazy',
    }),
  ],
  define: {
    __BUILD_NUMBER__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
});
