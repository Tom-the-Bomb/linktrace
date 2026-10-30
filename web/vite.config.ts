import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cn } from 'cn/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cn({ out: 'src/lib/cn-tables.ts', content: ['src/**/*.{ts,tsx}'], css: 'src/index.css' }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // mirrors Caddy's /api route in prod
  server: {
    proxy: { '/api': { target: 'http://localhost:8080', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
