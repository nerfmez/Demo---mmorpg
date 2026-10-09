import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (GitHub Pages, Vercel, a folder).
// lab.html is the Skill Lab: a bare page for trying skill effects (src/lab/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', offline: 'offline.html', lab: 'lab.html' } },
  },
});
