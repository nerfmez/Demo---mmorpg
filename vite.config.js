import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// base './' so the build works from any sub-path (GitHub Pages, Vercel, a folder).
// lab.html is the Skill Lab: a bare page for trying skill effects (src/lab/).
// dungeon.html previews the Pearlshell Grotto on its own before it joins the game (src/dungeon/).
// src/entry.js imports '@frontier/entry': only `--mode player` gets the lazy relay entry.
// FRONTIER_LOAD=dev (CI browser tests): the preview server marks served pages for the
// development load (main.js). Builds and the published site are never marked.
const devLoad = () => ({
  name: 'frontier-dev-load',
  configurePreviewServer(server) {
    if (process.env.FRONTIER_LOAD !== 'dev') return;
    const dist = fileURLToPath(new URL('./dist/', import.meta.url));
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '/').split('?')[0], file = path.endsWith('/') ? path + 'index.html' : path;
      if (req.method !== 'GET' || !/^\/(index|offline)\.html$/.test(file)) return next();
      readFile(dist + file.slice(1), 'utf8').then(html => {
        res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'no-store');
        res.end(html.replace('<head>', '<head><meta name="frontier-load" content="dev">'));
      }, () => next());
    });
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [devLoad()],
  resolve: { alias: { '@frontier/entry': fileURLToPath(new URL(mode === 'player' ? './src/player.js' : './src/offline.js', import.meta.url)) } },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', offline: 'offline.html', lab: 'lab.html', fxtest: 'fx-test.html', dungeon: 'dungeon.html' } },
  },
}));
