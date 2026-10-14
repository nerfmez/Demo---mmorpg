import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// base './' so the build works from any sub-path (GitHub Pages, Vercel, a folder).
// lab.html is the Skill Lab: a bare page for trying skill effects (src/lab/).
// src/entry.js imports '@frontier/entry': only `--mode player` gets the lazy relay entry.
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@frontier/entry': fileURLToPath(new URL(mode === 'player' ? './src/player.js' : './src/offline.js', import.meta.url)) } },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', offline: 'offline.html', lab: 'lab.html' } },
  },
}));
