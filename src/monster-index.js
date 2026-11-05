// The monster sandbox's own page (monsters.html; published at <site>/lab/monsters.html from an effects branch):
// every monster as a big button that opens the game's sandbox (?monsterLab, ui/monster-lab.js) on it, so the
// owner can watch attacks live on the iPad instead of waiting for a recorded video. It opens on the bare arena
// (&arena=1: no map, owner 2026-11-04 "no need to load the map, just the monster and the character"); a tick
// opens the real map instead. Monsters with their own kit (the overhauled ones) come first.
import monsters from '../data/monsters.json';

const css = `
:root { --bg: #16203a; --card: #22305a; --card2: #2c3d70; --fg: #f4f1e8; --dim: #aab3cf; --hot: #ffcf6a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.4 system-ui, -apple-system, "Noto Sans Thai", sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left)); }
h1 { font-size: 22px; margin: 4px 0 2px; }
p { color: var(--dim); margin: 0 0 14px; font-size: 14px; }
h2 { font-size: 15px; color: var(--hot); margin: 18px 0 8px; letter-spacing: .02em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
a { display: flex; flex-direction: column; gap: 3px; padding: 14px 14px 12px; border-radius: 14px; background: var(--card); color: var(--fg); text-decoration: none; min-height: 64px; }
a:active { background: var(--card2); }
a b { font-size: 17px; }
a span { color: var(--dim); font-size: 13px; }
label { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--dim); }
input { width: 20px; height: 20px; }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

const list = document.getElementById('list');
list.innerHTML = '<h1>ห้องทดลองท่ามอน</h1><p>แตะมอนเพื่อดูท่าโจมตีสดในเกม · เลือกท่า หยุด ช้าลง และทีละเฟรมได้จากแถบด้านบน · ไม่บันทึกเซฟ</p>';
// the arena (no map at all: only the hero, the monster and the effects) opens fast; the real map is a tick away
const map = document.createElement('label');
map.innerHTML = '<input type="checkbox" id="map"> ใช้แผนที่จริง (โหลดนานกว่า)';
list.append(map);

const defs = monsters.monsters;
const card = (id, d) => {
  const a = document.createElement('a');
  const lv = d.levels ? `Lv ${d.levels[0]}${d.levels[1] !== d.levels[0] ? '-' + d.levels[1] : ''}` : '';
  a.innerHTML = `<b></b><span></span>`;
  a.querySelector('b').textContent = d.nameTh || id;
  a.querySelector('span').textContent = `${lv} · ${Object.keys(d.attacks || {}).length} ท่า`;
  // the standalone artifact page (scripts/monster-lab-artifact.mjs) opens game.html#<type>: the arena only
  if (window.__monsterLabArtifact) { a.href = `game.html#${encodeURIComponent(id)}`; return a; }
  const href = `index.html?fresh=1&load=dev&monsterLab=${encodeURIComponent(id)}`;
  a.href = href + '&arena=1';
  a.addEventListener('click', () => { a.href = href + (document.getElementById('map').checked ? '' : '&arena=1'); });
  return a;
};
for (const [title, pick] of [['ท่าใหม่ (ยกเครื่องแล้ว)', (d) => d.behavior === 'kit'], ['มอนเดิม (ยังไม่ยกเครื่อง)', (d) => d.behavior !== 'kit']]) {
  const h = document.createElement('h2'); h.textContent = title;
  const grid = document.createElement('div'); grid.className = 'grid';
  for (const [id, d] of Object.entries(defs)) if (pick(d)) grid.append(card(id, d));
  list.append(h, grid);
}
