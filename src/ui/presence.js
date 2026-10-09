import { Presence, presenceEndpoint } from '../network/presence.js';
import { GEAR_SLOTS, roomOK } from '../network/protocol.js';
import { RemotePlayers } from '../render/remote-players.js';
import { DEFAULT_LOOK } from '../render/hero.js';
import './presence.css';

export function createPresence(game, view, resetInput, modelsReady, options = {}) {
  const required = !!options.required;
  const endpoint = options.client?.endpoint || presenceEndpoint(import.meta.env.VITE_PRESENCE_URL);
  const actors = new RemotePlayers(view, game.data);
  const root = document.createElement('details'); root.className = 'presence-panel';
  root.innerHTML = `<summary>ผู้เล่นออนไลน์ · ทดลอง</summary><div class="presence-content"><strong>Experimental visual prototype</strong><p>เห็นผู้เล่น การเดินและท่าโจมตี · มอนสเตอร์ ไอเทมและเซฟยังแยกกัน</p><label>ห้อง / Room <input maxlength="24" value="lobby" aria-label="Room"></label><div class="presence-actions"><button type="button" data-join>เข้าห้อง / Join</button><button type="button" data-leave>${required ? 'เชื่อมต่อใหม่ / Retry' : 'เล่นคนเดียว / Solo'}</button></div><output role="status"></output></div>`;
  document.body.append(root);
  const output = root.querySelector('output'), join = root.querySelector('[data-join]'), room = root.querySelector('input');
  join.disabled = !endpoint;
  const statuses = { solo: 'Solo · เล่นคนเดียว', connecting: 'Connecting · กำลังเชื่อมต่อ', connected: 'เชื่อมต่อแล้ว · กำลังเตรียมเข้าห้อง', online: 'เชื่อมต่อแล้ว', reconnecting: 'Reconnecting · กำลังเชื่อมต่อใหม่', failed: 'Failed · เชื่อมต่อไม่ได้ · กดลองใหม่' };
  const state = () => {
    const p = game.player, bases = game.gearLook().bases;
    const look = Object.fromEntries(Object.keys(DEFAULT_LOOK).map(k => [k, game.ch.appearance?.[k] || DEFAULT_LOOK[k]]));
    const gear = Object.fromEntries(GEAR_SLOTS.map(k => [k, bases[k] || null]));
    return { map: game.world.data.id, ready: modelsReady() && view.region.staticReady && !!view.hero && game.ch.opening?.stage === 'done', look, gear,
      pose: { x: p.x, z: p.z, facing: Math.atan2(Math.sin(p.facing), Math.cos(p.facing)), moving: !!p.moving } };
  };
  const client = options.client || new Presence({ endpoint, data: game.data, state });
  client.state = state;
  const offPlayers = client.subscribe('players', players => actors.sync(players));
  const offAction = client.subscribe('action', (id, action) => actors.action(id, action));
  const status = (status, count) => {
    resetInput();
    root.querySelector('summary').textContent = status === 'online' ? `ออนไลน์ · ทดลอง · ${count + 1} คน` : 'ผู้เล่นออนไลน์ · ทดลอง';
    output.textContent = endpoint ? `${statuses[status]}${status === 'online' ? ` · ${count + 1} คน · ${client.room}` : ''}` : 'Developer / Offline · ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ทดลอง';
  };
  // Status changes reset held input; peer move/count notifications must not interrupt local movement.
  let previousStatus;
  const offStatus = client.subscribe('status', (s, n) => {
    if (s !== previousStatus) { resetInput(); previousStatus = s; }
    root.querySelector('summary').textContent = s === 'online' ? `ออนไลน์ · ทดลอง · ${n + 1} คน` : 'ผู้เล่นออนไลน์ · ทดลอง';
    output.textContent = endpoint ? `${statuses[s]}${s === 'online' ? ` · ${n + 1} คน · ${client.room}` : ''}` : 'Developer / Offline · ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ทดลอง';
  });
  status(client.status, client.players.size);
  if (client.room) room.value = client.room;
  root.addEventListener('toggle', resetInput);
  const remember = value => { try { if (value) sessionStorage.setItem('frontier.presence', JSON.stringify({ endpoint, room: value })); else sessionStorage.removeItem('frontier.presence'); } catch { /* optional preference */ } };
  join.onclick = () => {
    room.setCustomValidity(roomOK(room.value) ? '' : 'Use 1–24 characters: a–z, 0–9, or -');
    if (!room.reportValidity()) return;
    remember(room.value); client.start(room.value);
  };
  root.querySelector('[data-leave]').onclick = () => {
    if (required) client.retryNow();
    else { remember(null); client.resumeRoom = null; client.stop(); }
  };
  if (!required) try {
    const saved = JSON.parse(sessionStorage.getItem('frontier.presence'));
    if (endpoint && saved?.endpoint === endpoint && roomOK(saved.room)) { room.value = saved.room; client.start(saved.room); }
  } catch { /* malformed preference cannot block offline startup */ }
  root.addEventListener('keydown', e => { if (root.open) e.stopPropagation(); });
  for (const event of ['pointerdown', 'pointerup']) root.addEventListener(event, e => e.stopPropagation());
  const suspend = () => {
    if (required) { if (document.hidden) resetInput(); return; }
    if (document.hidden) { client.resumeRoom = client.enabled ? client.room : null; client.stop(); }
    else if (client.resumeRoom) { const r = client.resumeRoom; client.resumeRoom = null; client.start(r); }
  };
  document.addEventListener('visibilitychange', suspend);
  const hide = () => { client.stop(); actors.dispose(); };
  const show = e => { if (e.persisted && required) client.retryNow(); };
  addEventListener('pagehide', hide); addEventListener('pageshow', show);
  let localAction = null;
  const handleEvent = e => {
    const phase = { castStart: 'cast', chargeStart: 'charge', channelStart: 'channel', chargeEnd: 'cancel', channelEnd: 'cancel' }[e.type];
    if (!phase) return;
    const skill = e.skill || localAction?.skill;
    if (!skill || !Object.hasOwn(game.data.skills.combat, skill)) return;
    const action = { skill, phase, angle: Math.atan2(Math.sin(e.angle ?? game.player.facing), Math.cos(e.angle ?? game.player.facing)), duration: Math.min(3, Math.max(0, e.total || 0)), step: Math.min(2, Math.max(0, e.step || 0)) };
    client.action(action); localAction = phase === 'cancel' ? null : { skill, phase, until: game.time + action.duration };
  };
  return { client, actors, handleEvent, get open() { return root.open; }, update: (dt, time) => {
    if (localAction && game.time + .02 < localAction.until && !game.player[{ cast: 'cast', charge: 'charging', channel: 'channeling' }[localAction.phase]]) handleEvent({ type: 'channelEnd' });
    if (localAction && game.time >= localAction.until) localAction = null;
    actors.update(dt, time);
  }, dispose: () => { hide(); offPlayers(); offAction(); offStatus(); client.state = () => null; root.remove(); document.removeEventListener('visibilitychange', suspend); removeEventListener('pagehide', hide); removeEventListener('pageshow', show); } };
}
