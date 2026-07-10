import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { WebSocket } from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

export default defineConfig({
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['mediainfo.js'],
  },
  resolve: {
    alias: {
      'lucide-react': 'lucide-react/dist/cjs/lucide-react.js',
    },
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    reactRouter(),
  ],
  define: {
    __BUILD_NUMBER__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
});
