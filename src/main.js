// Boot: data -> world -> view (the live map behind the title screen) -> menu -> a game session
// (simulation + HUD + input + panels), then one frame loop for everything.
import { data } from './data.js';
import { createWorld } from './core/world.js';
import { createCharacter } from './core/character.js';
import { Game } from './core/game.js';
import { View } from './render/view.js';
import { renderConfig } from './render/settings.js';
import { ResolutionGovernor } from './render/resolution.js';
import { loadModels } from './render/models.js';
import { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Panels } from './ui/panels.js';
import { Menu } from './ui/menu.js';
import { createFullscreen } from './ui/fullscreen.js';
import { migrateLegacy, writeSlot, exportCode, loadPref, savePref } from './save.js';
import '@fontsource/mitr/thai-400.css';
import '@fontsource/mitr/thai-500.css';
import '@fontsource/mitr/thai-600.css';
import '@fontsource/mitr/latin-400.css';
import '@fontsource/mitr/latin-500.css';
import '@fontsource/mitr/latin-600.css';

const params = new URLSearchParams(location.search);
// ?fresh=1 skips the menu with a new character that is never saved (tests); ?kit=bow|staff picks its kit
const fresh = params.has('fresh');
const coarse = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', coarse);
let quality = params.get('quality') || loadPref('quality', coarse ? 'medium' : 'high');

migrateLegacy();
const world = createWorld(data.world);
const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const view = new View(canvas, world, { quality });
// Imported models load in the background; the procedural shapes stand in until they arrive,
// then the hero, the creation preview and the portrait are rebuilt once.
Promise.all([loadModels(data.models), view.cityReady]).then(() => {
  view.heroLookKey = null;
  view.refreshModelRigs(); // pooled monsters were built before their models arrived
  if (F.menu?.refreshPreview && view.previewHero) F.menu.refreshPreview();
  F.modelsReady = true;
});
const setQuality = (q) => {
  quality = q;
  savePref('quality', q);
  view.setQuality(q);
};

const F = (window.__frontier = { view, world, fps: 0, paused: false, game: null });
let session = null;
const fullscreen = createFullscreen({
  bypass: fresh, // Existing never-saved browser-test fixture skips the entry menu.
  onBlocked: () => session?.input.reset(),
  onResize: () => view.resize(),
});
F.fullscreen = fullscreen;
const SAVE_ON = new Set(['levelup', 'joblevelup', 'bossDefeated', 'questDone', 'waypoint', 'zoneDiscovered', 'teleport']);

function startGame(character, slot) {
  const game = new Game(data, { seed: Number(params.get('seed')) || Date.now() % 100000, character, world });
  view.attachGame(game);
  view.mode = 'game';
  view.snapCamera();
  const hud = new Hud(hudRoot, game, view);
  const save = () => {
    if (slot) writeSlot(slot, game.snapshot());
  };
  const panels = new Panels(hudRoot, game, {
    onChange: save,
    onQuality: setQuality,
    getQuality: () => quality,
    onTitle: () => {
      save();
      location.href = location.pathname;
    },
    exportSave: () => {
      save();
      return slot ? exportCode(slot) : '';
    },
    slot,
    getAvatarContext: () => ({renderer: view.renderer, modelsReady: F.modelsReady}),
    onVisibility: () => {
      hud.setMenuOpen(false);
      input.reset();
    },
  });
  hud.onPanel = (tab) => panels.open(tab);
  const ui = {
    blocked: () => fullscreen.blocked,
    panelOpen: () => panels.isOpen || fullscreen.blocked,
    closePanel: () => panels.close(),
    togglePanel: (t) => panels.toggle(t),
    closeMenu: () => {
      if (!hud.menuOpen) return false;
      hud.setMenuOpen(false);
      return true;
    },
    configureSkill: (i) => {
      panels.sel.skill = i;
      panels.open('skills');
    },
    interact: () => {
      const n = game.nearby();
      if (n.workbench) panels.open('craft');
      else if (n.trainer) panels.open('job');
      else if (n.waypoint) panels.open('map');
    },
  };
  const input = new Input(hudRoot, canvas, game, view, ui);
  const buttons = {
    bag: hud.addMenuButton('bag', 'I', () => panels.toggle('bag'), 'กระเป๋า'),
    book: hud.addMenuButton('book', 'K', () => panels.toggle('skills'), 'สกิล'),
    tree: hud.addMenuButton('tree', 'J', () => panels.toggle('job'), 'Job Tree'),
    person: hud.addMenuButton('person', 'C', () => panels.toggle('char'), 'ตัวละคร'),
    scroll: hud.addMenuButton('scroll', 'L', () => panels.toggle('journal'), 'ภารกิจ'),
    map: hud.addMenuButton('map', 'M', () => panels.toggle('map'), 'แผนที่'),
    gear: hud.addMenuButton('gear', 'Esc', () => panels.toggle('settings'), 'ตั้งค่า'),
  };
  hud.onTracker(() => panels.open('journal'));

  let portraitKey = '';
  const refreshPortrait = () => {
    const look = game.ch.appearance;
    const gear = game.gearLook();
    const key = JSON.stringify([look, gear.helm, gear.weapon, !!F.modelsReady]);
    if (key === portraitKey) return;
    portraitKey = key;
    try {
      hud.setPortrait(view.portrait(look || undefined, gear, 128));
    } catch {
      /* the portrait is cosmetic */
    }
  };
  refreshPortrait();

  const refreshBadges = () => {
    const b = panels.badges();
    for (const [key, n] of [['person', b.char], ['tree', b.job]]) {
      const btn = buttons[key];
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
    hud.menuToggle.classList.toggle('has-points', b.char + b.job > 0);
  };

  session = { game, hud, panels, input, ui, save, refreshPortrait, refreshBadges, saveT: 0, badgeT: 0 };
  Object.assign(F, { game, hud, panels, input, save });
  save();

  const ch = game.ch;
  if (ch.progress.playTime < 1) hud.banner(`ยินดีต้อนรับ ${ch.name}`, 'ตามดาวทองบนแผนที่เพื่อเริ่มภารกิจ · ล่ามอน เก็บวัตถุดิบ แล้วกลับมาคราฟต์', 'long');
  else hud.toast(`โหลดเซฟแล้ว · ${ch.name} Lv.${ch.level}`, '#8fd0ff');
}

// ---------- menu (title, save slots, character creation) ----------
const menu = new Menu(hudRoot, view, data, {
  onStart: (ch, slot) => startGame(ch, slot),
  onQuality: setQuality,
  getQuality: () => quality,
});
F.menu = menu;

// iPad Safari ignores user-scalable=no: block double-tap and pinch page zoom, which would
// otherwise zoom the whole page with no way back (the game swallows the gestures).
for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    // a quick second tap is a zoom gesture; menus keep their taps (they cannot zoom: touch-action)
    if (now - lastTouchEnd < 350 && !e.target.closest?.('.overlay, .menu-layer, button')) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1 || !e.target.closest?.('.pbody, .scrolly, .tabs, .questtrack, .fullscreen-gate')) e.preventDefault();
  },
  { passive: false }
);

addEventListener('resize', () => view.resize());
addEventListener('orientationchange', () => setTimeout(() => view.resize(), 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) session?.save();
});
addEventListener('pagehide', () => session?.save());

try {
  view.warmup();
} catch (err) {
  console.warn('warmup skipped', err);
}

// ---------- frame loop ----------
// Dynamic resolution (data/rendering.json); off under browser automation so captures stay fixed.
const dynres = renderConfig.dynamicResolution;
const governor = dynres?.enabled && params.get('dynres') !== '0' && !navigator.webdriver ? new ResolutionGovernor(dynres) : null;
F.renderScale = () => view.renderScale ?? 1;
let last = performance.now();
let time = 0;
let fpsAcc = 0;
let fpsN = 0;

function frame(now) {
  const scale = session?.panels.tab === 'job' ? null : governor?.update(now - last);
  if (scale) view.setRenderScale(scale);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  const s = session;
  if (s) {
    if (!fullscreen.blocked) s.input.update();
    const paused = s.panels.isOpen || F.paused || fullscreen.blocked;
    // hit-stop: heavy hits freeze the action for a few frames so they land with weight
    const sdt = view.hitStop > 0 ? dt * 0.08 : dt;
    view.hitStop = Math.max(0, (view.hitStop || 0) - dt);
    if (!paused) s.game.update(sdt);
    for (const e of s.game.drainEvents()) {
      view.handleEvent(e);
      s.hud.handleEvent(e);
      if (SAVE_ON.has(e.type)) s.save();
      if (e.type === 'levelup' || e.type === 'joblevelup' || e.type === 'questDone') s.panels.render();
    }
    // The job journal is opaque and already pauses the game. Keep the completed
    // world frame while its DOM camera/leaf animates; resume normal drawing on exit.
    if (s.panels.tab !== 'job' && !fullscreen.blocked) view.render(paused ? 0 : sdt, time, { aim: s.input.aim });
    s.hud.update(paused ? 0 : dt, s.ui);
    s.saveT += dt;
    if (s.saveT > 10) {
      s.saveT = 0;
      s.save();
    }
    s.badgeT += dt;
    if (s.badgeT > 0.5) {
      s.badgeT = 0;
      s.refreshBadges();
      s.refreshPortrait();
    }
  } else if (!fullscreen.blocked) view.render(dt, time);
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    F.fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

if (fresh) startGame(createCharacter(data, { kit: params.get('kit') || undefined, name: 'Tester' }), null);
else menu.showTitle();
requestAnimationFrame((t) => {
  last = t;
  view.cityReady.then(() => document.getElementById('loading').classList.add('done')).catch(error => {
    console.error('City assets could not load', error);
    document.getElementById('loading').textContent = 'City assets could not load. Reload to retry.';
  });
  frame(t);
});
