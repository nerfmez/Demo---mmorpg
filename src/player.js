// Player entry: no renderer, Game or world import until the relay admits this connection.
import { data } from './data.js';
import { Presence, presenceEndpoint } from './network/presence.js';
import { setOnlineRuntime } from './network/online-runtime.js';
import { createOnlineGate } from './ui/online-gate.js';
import '@fontsource/mitr/thai-400.css';
import '@fontsource/mitr/latin-400.css';

export function startPlayer({ endpoint = presenceEndpoint(import.meta.env.VITE_PRESENCE_URL), loadGame = () => import('./main.js') } = {}) {
  const client = new Presence({ endpoint, data });
  const gate = createOnlineGate(client);
  setOnlineRuntime({ client, gate });
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
  let booted = false;
  const off = client.subscribe('status', () => {
    if (!client.connected || booted) return;
    booted = true;
    if (loading) { loading.hidden = false; loading.querySelector('.load-sub').textContent = 'กำลังสร้างโลก…'; }
    loadGame().catch(error => {
      console.error('Player startup failed', error);
      client.fail(); gate.dispose();
      const message = document.createElement('div'); message.className = 'online-gate';
      const reload = document.createElement('button'); reload.textContent = 'โหลดใหม่ / Reload'; reload.onclick = () => location.reload();
      message.append('สร้างโลกไม่สำเร็จ / World could not load. ', reload); document.body.append(message);
    });
  });
  const hide = () => client.stop();
  const show = e => { if (e.persisted) client.retryNow(); };
  addEventListener('pagehide', hide); addEventListener('pageshow', show);
  client.start('lobby');
  return { client, gate, get booted() { return booted; }, dispose() { off(); hide(); gate.dispose(); removeEventListener('pagehide', hide); removeEventListener('pageshow', show); setOnlineRuntime(null); } };
}
if (!import.meta.env.VITE_PLAYER_HARNESS) startPlayer();
