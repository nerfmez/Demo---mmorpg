import { Presence, presenceEndpoint } from '../network/presence.js';
import { RemotePlayers } from '../render/remote-players.js';
import { DEFAULT_LOOK } from '../render/hero.js';
import './presence.css';

export function createPresence(game, view, resetInput, modelsReady) {
  // Build-time configuration only: an arbitrary URL parameter cannot exfiltrate presence.
  const endpoint = presenceEndpoint(import.meta.env.VITE_PRESENCE_URL);
  const actors = new RemotePlayers(view);
  const root = document.createElement('details'); root.className = 'presence-panel';
  root.innerHTML = `<summary>ผู้เล่นออนไลน์ · ทดลอง</summary><div class="presence-content"><strong>Experimental presence prototype</strong><p>เห็นผู้เล่นและการเดินเท่านั้น · ต่อสู้และเซฟยังเล่นคนเดียว</p><label>ห้อง / Room <input maxlength="24" value="lobby" aria-label="Room"></label><div class="presence-actions"><button type="button" data-join>เข้าห้อง / Join</button><button type="button" data-leave>เล่นคนเดียว / Solo</button></div><output role="status"></output></div>`;
  document.body.append(root);
  const output = root.querySelector('output'), join = root.querySelector('[data-join]'), room = root.querySelector('input');
  join.disabled = !endpoint;
  const statuses = { solo: 'Solo · เล่นคนเดียว', connecting: 'กำลังเชื่อมต่อ… ยังเล่นคนเดียวได้', online: 'เชื่อมต่อแล้ว', reconnecting: 'ขาดการเชื่อมต่อ · เล่นคนเดียวได้ · กำลังลองใหม่…' };
  const client = new Presence({ endpoint,
    state: () => {
      const p = game.player;
      const look = Object.fromEntries(Object.keys(DEFAULT_LOOK).map(k => [k, game.ch.appearance?.[k] || DEFAULT_LOOK[k]]));
      return { map: game.world.data.id, ready: modelsReady() && view.region.staticReady && !!view.hero && game.ch.opening?.stage === 'done', look,
        pose: { x: p.x, z: p.z, facing: Math.atan2(Math.sin(p.facing), Math.cos(p.facing)), moving: !!p.moving } };
    },
    onPlayers: players => actors.sync(players),
    onStatus: (status, count) => { root.querySelector('summary').textContent = status === 'online' ? `ออนไลน์ · ทดลอง · ${count + 1} คน` : 'ผู้เล่นออนไลน์ · ทดลอง'; output.textContent = endpoint ? `${statuses[status]}${status === 'online' ? ` · ${count + 1} คน · ${client.room}` : ''}` : 'Solo · ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ทดลอง'; },
  });
  client.statusTo('solo');
  root.addEventListener('toggle', resetInput);
  const remember = value => { try { if (value) sessionStorage.setItem('frontier.presence', JSON.stringify({ endpoint, room: value })); else sessionStorage.removeItem('frontier.presence'); } catch { /* storage is optional */ } };
  join.onclick = () => {
    room.setCustomValidity(/^[a-z0-9-]{1,24}$/.test(room.value) ? '' : 'Use 1–24 characters: a–z, 0–9, or -');
    if (!room.reportValidity()) return;
    remember(room.value); client.start(room.value);
  };
  root.querySelector('[data-leave]').onclick = () => { remember(null); client.resumeRoom = null; client.stop(); };
  try {
    const saved = JSON.parse(sessionStorage.getItem('frontier.presence'));
    if (endpoint && saved?.endpoint === endpoint && /^[a-z0-9-]{1,24}$/.test(saved.room)) { room.value = saved.room; client.start(saved.room); }
  } catch { /* a malformed optional preference cannot block startup */ }
  // Prevent gameplay hotkeys while editing a room name.
  for (const event of ['keydown', 'keyup', 'pointerdown', 'pointerup']) root.addEventListener(event, e => e.stopPropagation());
  const suspend = () => { if (document.hidden) { client.resumeRoom = client.enabled ? client.room : null; client.stop(); } else if (client.resumeRoom) { const r = client.resumeRoom; client.resumeRoom = null; client.start(r); } };
  document.addEventListener('visibilitychange', suspend);
  const hide = () => { client.stop(); actors.dispose(); };
  const show = e => { if (e.persisted) client.statusTo('solo'); };
  addEventListener('pagehide', hide); addEventListener('pageshow', show);
  return { client, actors, get open() { return root.open; }, update: (dt, time) => actors.update(dt, time), dispose: () => { hide(); root.remove(); document.removeEventListener('visibilitychange', suspend); removeEventListener('pagehide', hide); removeEventListener('pageshow', show); } };
}
