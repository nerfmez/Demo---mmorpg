// Boot: data -> world -> view (the live map behind the title screen) -> menu -> a game session
// (simulation + HUD + input + panels), then one frame loop for everything.
import { createPresence } from './ui/presence.js';
import { onlineRuntime } from './network/online-runtime.js';
import { data } from './data.js';
import { createWorld } from './core/world.js';
import { createCharacter, equip } from './core/character.js';
import { OpenWorldGame as Game } from './core/open-world-game.js';
import { View } from './render/view.js';
import { useStartupTaskScheduling } from './render/build-queue.js';
import { trackStartupReadiness } from './render/startup-readiness.js';
import { renderConfig } from './render/settings.js';
import { ResolutionGovernor } from './render/resolution.js';
import { contactReady } from './render/fireball-v5-contact.js';
import { frostReady } from './render/frost-v2.js';
import { approvedClipsReady } from './render/approved-mesh-clips.js';
import { loadModels, weaponModelKey, weaponModelsReady } from './render/models.js';
import { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Panels } from './ui/panels.js';
import { Menu } from './ui/menu.js';
import { Opening } from './ui/opening.js';
import { QuestCompletion } from './ui/quest-completion.js';
import { QuestRoute } from './render/quest-route.js';
import { Supplies } from './ui/supplies.js';
import { createFullscreen } from './ui/fullscreen.js';
import { migrateLegacy, writeSlot, loadSlot, exportCode, loadPref, savePref, stashTravel, takeTravel } from './save.js';
import { characterMap, selectMap } from './core/maps.js';
import '@fontsource/mitr/thai-400.css';
import '@fontsource/mitr/thai-500.css';
import '@fontsource/mitr/thai-600.css';
import '@fontsource/mitr/latin-400.css';
import '@fontsource/mitr/latin-500.css';
import '@fontsource/mitr/latin-600.css';

const params = new URLSearchParams(location.search);
// ?fresh=1 skips the menu with a new character that is never saved (tests); ?kit=bow|staff picks its kit
const fresh = !onlineRuntime && params.has('fresh');
const coarse = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', coarse);
let quality = params.get('quality') || loadPref('quality', coarse ? 'medium' : 'high');
// Settings -> graphics: the custom preset's own choices and anti-aliasing (?aa=0|2|4 for reviews)
let customQuality = null;
try { customQuality = JSON.parse(loadPref('graphicsCustom', 'null')); } catch { customQuality = null; }
const antialias = params.get('aa') ?? loadPref('antialias', null);

migrateLegacy();
// The selected saved region chooses the fixed atlas origin; all regions form one
// resident world. Native region IDs remain content/discovery/save namespaces.
const trip = takeTravel();
const tripCharacter = trip ? (trip.slot ? loadSlot(trip.slot)?.character : trip.character) : null;
selectMap(data, tripCharacter ? characterMap(data, tripCharacter) : params.get('map'));
document.querySelector('#loading .load-title').textContent = data.world.name || '';
// All native collision/heightfields are built once; the unified simulation queries
// them in fixed atlas coordinates without border handovers.
const worlds = Object.fromEntries(Object.keys(data.maps).map((id) => [id, null]));
const coreWorld = (id) => (worlds[id] ||= createWorld(data.maps[id]));
const world = coreWorld(data.world.id);
for (const id of Object.keys(worlds)) coreWorld(id);
const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
// Development load (?load=dev, or the preview server's frontier-load meta under
// FRONTIER_LOAD=dev, which CI sets): only the start map's scene is prepared, so
// tests and reviews open fast. The game itself (no flag) prepares every map before
// play, as always: walking never builds a scene. Rules worlds are complete either way.
const loadMode = params.get('load') || document.querySelector('meta[name="frontier-load"]')?.content || 'full';
const resident = loadMode === 'dev' ? { [world.data.id]: world } : worlds;
const view = new View(canvas, world, { quality, custom: customQuality, antialias, worlds, resident });
view.loadMode = loadMode === 'dev' ? 'dev' : 'full';
// The owner plays on an iPad with no console: a fault that stops the picture is
// shown on screen (the first of each kind) so a screenshot carries its cause.
const faults = new Set();
function reportFault(title, detail = '') {
  const text = `${title}${detail ? `\n${String(detail).slice(0, 600)}` : ''}`;
  if (faults.has(text) || faults.size >= 4) return;
  faults.add(text);
  console.error(title, detail);
  let box = document.getElementById('fault');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fault';
    box.addEventListener('click', () => box.remove());
    document.body.append(box);
  }
  box.textContent = `ภาพเกมมีปัญหา · แคปหน้าจอนี้ส่งให้ Claude (แตะเพื่อปิด)\n${[...faults].join('\n\n')}`;
}
const errorText = (e) => `${e?.message || e}${e?.stack ? `\n${e.stack.split('\n').slice(0, 4).join('\n')}` : ''}`;
window.addEventListener('error', (e) => reportFault('Error', errorText(e.error || e.message)));
window.addEventListener('unhandledrejection', (e) => reportFault('Unhandled rejection', errorText(e.reason)));
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  reportFault('WebGL context lost (หน่วยความจำกราฟิกไม่พอ?)');
  // Resident scenery keeps no CPU copy of its GPU buffers (render/resident-geometry.js),
  // so a restored context could not redraw it: save and start again, at most once a
  // few minutes (a loss on every start is shown, not looped).
  let last = 0;
  try { last = Number(sessionStorage.getItem('frontier.contextReload')) || 0; } catch { /* storage blocked */ }
  if (!session || Date.now() - last < 180000) return;
  try { sessionStorage.setItem('frontier.contextReload', String(Date.now())); } catch { /* storage blocked */ }
  travelTo(session.game.snapshot(), session.slot, 'กำลังโหลดใหม่ (หน่วยความจำไม่พอ)');
});
canvas.addEventListener('webglcontextrestored', () => reportFault('WebGL context restored'));
view.renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join('\n');
  reportFault('Shader failed to compile/link', log.trim() || `status ${gl.getProgramParameter(program, gl.LINK_STATUS)}`);
};
const releaseStartupScheduling = useStartupTaskScheduling(view.buildQueue);
if (params.get('fireball') === 'legacy') view.vfx.fireballReviewVersion = 'legacy';
view.coreWorld = coreWorld;
// ?streamBudget=<ms> lets software-GPU tests stream the neighbour in fewer (slow) frames.
if (params.has('streamBudget')) view.streamBudgetMs = Number(params.get('streamBudget'));
// Character/monster models load at boot. Current weapons and chibi outfits load on demand; procedural shapes stand in,
// current hero, creation preview and portraits refresh when their requested templates arrive.
view.startupDependencies={};
trackStartupReadiness({models:loadModels(data.models, { onWeaponReady: (id) => {
  const bases = F.game?.gearLook().bases;
  // a weapon, or the chibi outfit model (outfit_<item>) of the worn armour, boots, gloves or helm
  const worn = bases && [bases.weapon, bases.offhand, `outfit_${bases.armor || 'travel_tunic'}`, `outfit_${bases.boots || 'travel_boots'}`, `outfit_${bases.gloves}`, `outfit_${bases.helm}`];
  // or the chibi hair model of the chosen hair style (hero_chibi_hair_<style>)
  const hair = id === `hero_chibi_hair_${F.game?.ch.appearance?.hairStyle}` || id === `face_${F.game?.ch.appearance?.face}`;
  if (worn?.includes(id) || hair) view.setHeroLook(F.game.ch.appearance, F.game.gearLook(), true);
  // Refresh only the currently selected creation kit, not an obsolete async selection.
  if (view.previewHero && (data.progression.start.kits[F.menu?.kit]?.weapon === id || id.startsWith('outfit_') || id === `hero_chibi_hair_${F.menu?.look?.hairStyle}` || id === `face_${F.menu?.look?.face}`)) F.menu.refreshPreview();
} }), world:view.worldReady, contact:contactReady, frost:frostReady, approvedClips:approvedClipsReady},view.startupDependencies).then(() => {
  view.heroLookKey = null;
  view.refreshModelRigs(); // pooled monsters were built before their models arrived
  if (F.menu?.refreshPreview && view.previewHero) F.menu.refreshPreview();
  F.modelsReady = true;
});
const setQuality = (q) => {
  // the first custom choice starts from the preset in use, so nothing changes until a row is changed
  if (q === 'custom' && !customQuality) {
    const { name, ...values } = view.qualityValues();
    customQuality = values;
    savePref('graphicsCustom', JSON.stringify(customQuality));
  }
  quality = q;
  savePref('quality', q);
  view.setQuality(q, customQuality);
  if (!view.dynres) { if (governor) governor.scale = 1; view.setRenderScale(1); }
};
// What the settings pages read and change (src/ui/graphics-settings.js).
const graphics = {
  get: () => ({ quality, values: view.qualityValues(), antialias: view.antialias, dpr: window.devicePixelRatio || 1, buffer: [canvas.width, canvas.height] }),
  setQuality,
  setCustom(key, value) {
    customQuality = { ...view.qualityValues(), [key]: value };
    delete customQuality.name;
    savePref('graphicsCustom', JSON.stringify(customQuality));
    setQuality('custom');
  },
  setAntialias(samples) {
    view.setAntialias(samples);
    savePref('antialias', String(view.antialias));
  },
};

const F = (window.__frontier = { view, fps: 0, paused: false, game: null, equip }); // equip: browser tests dress the hero
Object.defineProperty(F, 'world', { get: () => view.world }); // follows open-world crossings
let session = null;
const fullscreen = createFullscreen({
  bypass: fresh, // Existing never-saved browser-test fixture skips the entry menu.
  onBlocked: () => session?.input.reset(),
  onResize: () => view.resize(),
});
F.fullscreen = fullscreen;
const SAVE_ON = new Set(['levelup', 'joblevelup', 'bossDefeated', 'questDone', 'waypoint', 'zoneDiscovered', 'teleport', 'potion']);

/** Reload into the character's map (saved slot, or the unsaved test character). */
function travelTo(character, slot, name) {
  if (slot) writeSlot(slot, character);
  stashTravel(slot ? { slot } : { character });
  const loading = document.getElementById('loading');
  loading.querySelector('.load-title').textContent = name || '';
  loading.querySelector('.load-sub').textContent = 'กำลังเดินทาง…';
  loading.classList.remove('done');
  const url = new URL(location.href);
  url.searchParams.delete('map');
  // Let the overlay paint before the page unloads.
  requestAnimationFrame(() => setTimeout(() => location.replace(url.href), 30));
}

function startGame(character, slot) {
  if (characterMap(data, character) !== data.world.id) return travelTo(character, slot, data.maps[characterMap(data, character)]?.nameTh);
  if(fresh&&params.has('skillSandbox')){
    character.skills=Object.fromEntries(Object.keys(data.skills.combat).map(id=>[id,1]));
    character.movementSkills=Object.keys(data.skills.movement);
    character.movement ||= character.movementSkills[0];
    character.stats={STR:35,AGI:35,VIT:35,INT:35,DEX:35,LUK:35};
    character.mods=Object.keys(data.mods.mods).map(id=>({id,uid:character.nextUid++,level:1,grade:'C'}));
  }
  const sandbox=fresh&&params.has('skillSandbox');
  if(sandbox){
    const types=new Set(character.gear.map(i=>(data.items.gearBases[i.base].weaponType||data.items.gearBases[i.base].offhandType)));
    for(const [base,d]of Object.entries(data.items.gearBases))if((d.weaponType||d.offhandType)&&!types.has(d.weaponType||d.offhandType)){
      types.add(d.weaponType||d.offhandType);character.gear.push({uid:character.nextUid++,base,itemLevel:1,grade:'C',upgrade:0,options:[]});
    }
  }
  const game = new Game(data, { seed: Number(params.get('seed')) || Date.now() % 100000, character, world, worlds });
  game.worlds = worlds; // every map's rules world: the HUD and atlas show one world
  view.attachGame(game);
  view.mode = 'game';
  view.snapCamera();
  const hud = new Hud(hudRoot, game, view);
  view.floatText = (x, y, z, text, color, big) => hud.float(x, y, z, text, big ? 'crit' : '', color); // skill effect labels
  const save = () => {
    return slot ? writeSlot(slot, game.snapshot()) : true;
  };
  let completion;
  const panels = new Panels(hudRoot, game, {
    onChange: save,
    graphics,
    onTitle: () => {
      save();
      location.href = location.pathname;
    },
    exportSave: () => {
      save();
      return slot ? exportCode(slot) : '';
    },
    slot,
    getAvatarContext: () => ({renderer: view.renderer,
      modelsReady: F.modelsReady && weaponModelsReady(game.gearLook().bases),
      modelRevision: weaponModelKey(game.gearLook().bases)}),
    onVisibility: () => input.reset(),
  });
  hud.onPanel = (tab) => panels.open(tab);
  F.panels = panels; // browser tests open a page directly
  const ui = {
    blocked: () => fullscreen.blocked || !!completion?.isOpen || !!onlineRuntime?.gate.blocked,
    panelOpen: () => panels.isOpen || !!session?.presence?.open || fullscreen.blocked || !!completion?.isOpen || !!onlineRuntime?.gate.blocked,
    closePanel: () => panels.close(),
    togglePanel: (t) => panels.toggle(t),
    configureSkill: (i) => {
      panels.sel.skill = i;
      panels.open('skills');
    },
    interact: () => {
      const n = game.nearby();
      if (n.workbench) panels.open('craft');
      else if (n.trainer) panels.open('job');
      else if (n.shop) panels.open('shop');
      else if (n.waypoint) panels.open('map');
      else if (n.exit) {
        const result = game.travel(n.exit); // success arrives as a 'travel' event
        if (!result.ok) hud.toast(result.reason === 'combat' ? 'ออกเดินทางระหว่างต่อสู้ไม่ได้' : 'ยังเดินทางไม่ได้', '#ffb36b');
      }
    },
  };
  const input = new Input(hudRoot, canvas, game, view, ui);
  completion = new QuestCompletion(game, { save, reset: () => input.reset() });
  const buttons = {
    bag: hud.addMenuButton('bag', 'I', () => panels.toggle('bag'), 'กระเป๋า'),
    book: hud.addMenuButton('book', 'K', () => panels.toggle('skills'), 'สกิล'),
  };
  const questRoute = new QuestRoute(game, view.scene, hud);
  const supplies = new Supplies(hudRoot,game,{
    onArrows:()=>{if(!ui.panelOpen())panels.openArrowCraft();},
    onPotions:()=>{if(!ui.panelOpen())panels.openAutoPotions();},
  });
  hud.onTracker(() => { if (!ui.panelOpen()) questRoute.toggle(); });

  let portraitKey = '';
  let portraitPending = false;
  const currentPortraitKey = () => {
    const gear = game.gearLook();
    return JSON.stringify([game.ch.appearance, gear.helm, gear.weapon, !!F.modelsReady, weaponModelKey(gear.bases)]);
  };
  const refreshPortrait = () => {
    // Behind the loading card a portrait of the stand-in body is only replaced once
    // the models arrive; rendering it cost seconds of startup on slower devices.
    if (!F.modelsReady) return;
    const look = game.ch.appearance;
    const gear = game.gearLook();
    const key = JSON.stringify([look, gear.helm, gear.weapon, !!F.modelsReady, weaponModelKey(gear.bases)]);
    if (key === portraitKey || portraitPending) return;
    portraitKey = key;
    portraitPending = true;
    view.portrait(look || undefined, gear, 128).then(url => {
      // A later gear/model choice must not receive an obsolete asynchronous portrait.
      if (key === currentPortraitKey() && F.game === game) hud.setPortrait(url);
    }).catch(() => { /* the portrait is cosmetic */ }).finally(() => { portraitPending = false; });
  };
  refreshPortrait();

  const refreshBadges = () => {
    const b = panels.badges();
    hud.menuToggle.classList.toggle('has-points', b.char + b.job > 0);
  };

  session = { game, hud, panels, input, ui, save, slot, completion, questRoute, supplies, refreshPortrait, refreshBadges, saveT: 0, badgeT: 0 };
  Object.assign(F, { game, hud, panels, input, save, completion, questRoute, supplies, weaponModelsReady: () => weaponModelsReady(game.gearLook().bases) });
  session.presence = createPresence(game, view, () => input.reset(), () => F.modelsReady, onlineRuntime ? { client: onlineRuntime.client, required: true } : {});
  F.presence = session.presence;
  save();
  if(sandbox){
    const bar=document.createElement('div');bar.className='skill-sandbox';
    const title=document.createElement('b');title.textContent='ทดลอง · ไม่บันทึก';bar.append(title);
    const pick=document.createElement('select');pick.setAttribute('aria-label','สกิลทดลอง');
    for(const [id,d]of Object.entries(data.skills.combat).filter(([,d])=>d.prototype)){const o=document.createElement('option');o.value=id;o.textContent=d.nameTh;pick.append(o);}bar.append(pick);
    const choose=()=>{
      input.reset();const d=data.skills.combat[pick.value];game.ch.slots[0]={skill:pick.value,mods:[]};
      game.ch.equipped.weapon=game.ch.equipped.offhand=null;
      for(const type of [d.requiresWeapon?.[0]||(d.requiresOffhand?'sword':'staff'),...(d.requiresOffhand?['shield']:[])]){
        const it=game.ch.gear.find(i=>(data.items.gearBases[i.base].weaponType||data.items.gearBases[i.base].offhandType)===type);if(it)equip(game.ch,data,it.uid);
      }
      game.refresh();game.player.hp=game.player.maxHp;game.player.mp=game.player.maxMp;
    };
    pick.addEventListener('change',choose);hudRoot.append(bar);session.sandboxBar=bar;choose();
  }

  const ch = game.ch;
  const opening = new Opening(hudRoot, game, view, { hud, input, save, refresh: () => { session.refreshPortrait(); session.refreshBadges(); } });
  F.opening = opening;
  if (opening.begin()) return; // the opening ends with its own banner
  if(sandbox)hud.toast('เปิดสมุดสกิลเพื่อใส่ม็อด · ตัวละครทดลองไม่บันทึกเซฟ','#8fd0ff');
  else if (ch.progress.playTime < 1) hud.banner(`ยินดีต้อนรับ ${ch.name}`, 'ตามดาวทองบนแผนที่เพื่อเริ่มภารกิจ · ล่ามอน เก็บวัตถุดิบ แล้วกลับมาคราฟต์', 'long');
  else hud.toast(`โหลดเซฟแล้ว · ${ch.name} Lv.${ch.level}`, '#8fd0ff');
}

// ---------- menu (title, save slots, character creation) ----------
const menu = new Menu(hudRoot, view, data, {
  onStart: (ch, slot) => startGame(ch, slot),
  graphics,
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
    if (e.touches.length > 1 || !e.target.closest?.('.pbody, .scrolly, .tabs, .questtrack, .fullscreen-gate, #atelier .window, .atelier-dialog')) e.preventDefault();
  },
  { passive: false }
);

addEventListener('resize', () => view.resize());
addEventListener('orientationchange', () => setTimeout(() => view.resize(), 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) session?.save();
});
addEventListener('pagehide', () => { session?.save(); session?.questRoute.dispose(); view.vfx.disposeMovement(); });

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
// The opaque loading card hides the world. Let construction advance without
// repeatedly drawing its still-unbatched scene behind that card.
let initialWorldReady = false;

// A throw inside a frame used to end the loop for good (a frozen, blank world).
// Report it and keep drawing.
function frame(now) {
  try {
    frameBody(now);
  } catch (error) {
    reportFault('Frame error', errorText(error));
    requestAnimationFrame(frame);
  }
}

function frameBody(now) {
  const scale = session?.panels.tab === 'job' || !view.dynres ? null : governor?.update(now - last);
  if (scale) view.setRenderScale(scale);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  // The loading card owns presentation while every resident region is prepared.
  // Keep the clock/rAF alive, then process retained input/events and refresh the
  // HUD on the first ready frame instead of updating hidden gameplay controls.
  if (!initialWorldReady) {
    requestAnimationFrame(frame);
    return;
  }
  const s = session;
  if (s) {
    if (!fullscreen.blocked) s.input.update();
    if (onlineRuntime?.gate.blocked) s.input.reset();
    if(s.sandboxBar)s.sandboxBar.hidden=s.panels.isOpen||fullscreen.blocked;
    const paused = !view.worldPrepared || s.panels.isOpen || s.completion.isOpen || F.paused || fullscreen.blocked || !!onlineRuntime?.gate.blocked;
    // hit-stop: heavy hits freeze the action for a few frames so they land with weight
    const sdt = view.hitStop > 0 ? dt * 0.08 : dt;
    view.hitStop = Math.max(0, (view.hitStop || 0) - dt);
    if (!paused) s.game.update(sdt);
    for (const e of s.game.drainEvents()) {
      if (e.type === 'worldChanged' && e.seamless) { view.switchRegion(e.to); s.save(); }
      if (e.type === 'travel') {
        if (view.neighbourReady(e.to)) {
          // Open world: the neighbouring map is already streamed in; carry on in place
          // (walking across a seam, or a stone just over the border).
          s.game.enterWorld(coreWorld(e.to));
          view.switchRegion(e.to);
          if (!e.seam) view.snapCamera();
          s.hud.toast(e.name, '#bfe6ff');
          s.save();
          continue;
        }
        // A far map (stone travel) or a seam reached before it finished streaming: reload.
        s.questRoute.dispose();
        s.presence.dispose();
        session = null;
        travelTo(s.game.ch, s.slot, e.name);
        break;
      }
      if (e.type === 'travelRefused') s.hud.toast(e.reason === 'combat' ? 'ข้ามเขตแดนระหว่างต่อสู้ไม่ได้' : e.reason === 'loading' ? 'กำลังเตรียมพื้นที่ข้างหน้า' : 'ยังข้ามเขตแดนไม่ได้', '#ffb36b');
      view.handleEvent(e);
      s.presence?.handleEvent(e);
      s.hud.handleEvent(e);
      if (SAVE_ON.has(e.type)) s.save();
      if (e.type === 'levelup' || e.type === 'joblevelup' || e.type === 'questDone') s.panels.render();
    }
    s.completion.update(fullscreen.blocked || s.panels.isOpen || s.game.ch.opening?.stage !== 'done' || !view.worldPrepared);
    s.questRoute.update(dt);
    s.presence?.update(dt, time);
    // The job journal is opaque and already pauses the game. Keep the completed
    // world frame while its DOM camera/leaf animates; resume normal drawing on exit.
    if (initialWorldReady && s.panels.tab !== 'job' && !fullscreen.blocked) view.render(paused ? 0 : sdt, time, { aim: s.input.aim });
    s.hud.update(paused ? 0 : dt, s.ui);
    s.supplies.update();
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
  } else if (initialWorldReady && !fullscreen.blocked) view.render(dt, time);
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    F.fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

if (tripCharacter) startGame(tripCharacter, trip.slot || null);
else if (fresh) startGame(createCharacter(data, { kit: params.get('kit') || undefined, name: 'Tester' }), null);
else menu.showTitle();
// Readiness and scheduler restoration must not depend on the first UI rAF.
view.worldReady.then(() => {
  releaseStartupScheduling();
  initialWorldReady = true;
  document.getElementById('loading').classList.add('done');
}).catch(error => {
  releaseStartupScheduling();
  console.error('City assets could not load', error);
  document.getElementById('loading').textContent = 'City assets could not load. Reload to retry.';
});
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
