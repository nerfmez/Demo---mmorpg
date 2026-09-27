// Boot: data -> simulation -> view -> UI, then the frame loop.
import { data } from './data.js';
import { Game } from './core/game.js';
import { View } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Panels } from './ui/panels.js';
import { loadSave, writeSave, clearSave, loadPref, savePref } from './save.js';

const params = new URLSearchParams(location.search);
const fresh = params.has('fresh');
const saved = fresh ? null : loadSave();
const coarse = matchMedia('(pointer: coarse)').matches;
let quality = params.get('quality') || loadPref('quality', coarse ? 'medium' : 'high');

const game = new Game(data, { seed: Number(params.get('seed')) || (Date.now() % 100000), character: saved ? saved.character : null });
const canvas = document.getElementById('game');
const view = new View(canvas, game, { quality });
const hudRoot = document.getElementById('hud');
const hud = new Hud(hudRoot, game, view);

let saveTimer = 0;
const save = () => {
  if (!fresh) writeSave(game);
};

const panels = new Panels(hudRoot, game, {
  onChange: save,
  onReset: () => {
    clearSave();
    location.reload();
  },
  onQuality: (q) => {
    quality = q;
    savePref('quality', q);
    view.setQuality(q);
  },
  getQuality: () => quality,
});

const ui = {
  panelOpen: () => panels.isOpen,
  closePanel: () => panels.close(),
  togglePanel: (t) => panels.toggle(t),
  interact: () => {
    const n = game.nearby();
    if (n.workbench) panels.open('craft');
    else if (n.trainer) panels.open('job');
  },
};
const input = new Input(hudRoot, canvas, game, view, ui);

const menuButtons = {
  bag: hud.addMenuButton('bag', 'I', () => panels.toggle('bag')),
  book: hud.addMenuButton('book', 'K', () => panels.toggle('skills')),
  tree: hud.addMenuButton('tree', 'J', () => panels.toggle('job')),
  person: hud.addMenuButton('person', 'C', () => panels.toggle('char')),
  gear: hud.addMenuButton('gear', 'Esc', () => panels.toggle('settings')),
};
function refreshBadges() {
  const b = panels.badges();
  for (const [key, n] of [['person', b.char], ['tree', b.job]]) {
    const btn = menuButtons[key];
    let dot = btn.querySelector('.dot');
    if (n > 0) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'dot';
        btn.appendChild(dot);
      }
      dot.textContent = n;
    } else dot?.remove();
  }
}

addEventListener('resize', () => view.resize());
addEventListener('orientationchange', () => setTimeout(() => view.resize(), 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
addEventListener('pagehide', save);

try {
  view.warmup();
} catch (err) {
  console.warn('warmup skipped', err);
}
try {
  hud.setPortrait(view.portrait(128));
} catch {
  /* portrait is cosmetic */
}

let last = performance.now();
let time = 0;
let fpsAcc = 0;
let fpsN = 0;
window.__frontier = { game, view, hud, panels, input, fps: 0 };

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  input.update();
  if (!panels.isOpen && !window.__frontier.paused) game.update(dt);
  for (const e of game.drainEvents()) {
    view.handleEvent(e);
    hud.handleEvent(e);
    if (e.type === 'levelup' || e.type === 'joblevelup' || e.type === 'bossDefeated') save();
    if (e.type === 'levelup' || e.type === 'joblevelup') panels.render();
  }
  view.render(panels.isOpen ? 0 : dt, time, { aim: input.aim });
  hud.update(panels.isOpen ? 0 : dt, ui);
  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    save();
    refreshBadges();
  }
  if (Math.floor(time * 2) !== Math.floor((time - dt) * 2)) refreshBadges();
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    window.__frontier.fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  last = t;
  document.getElementById('loading').classList.add('done');
  if (!saved) hud.banner('Greenhollow Frontier', 'เดินตามถนนไปทางตะวันออก · ล่ามอน เก็บวัตถุดิบ แล้วกลับมาคราฟต์ที่นิคม');
  frame(t);
});
