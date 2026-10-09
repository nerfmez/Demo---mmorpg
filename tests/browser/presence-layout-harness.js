// Real production UI/input/core; omit only rendering and external networking.
import { data } from '../../src/data.js';
import { selectMap } from '../../src/core/maps.js';
import { createCharacter } from '../../src/core/character.js';
import { Game } from '../../src/core/game.js';
import { Hud } from '../../src/ui/hud.js';
import { Panels } from '../../src/ui/panels.js';
import { Input } from '../../src/ui/input.js';
import { Supplies } from '../../src/ui/supplies.js';
import { createPresence } from '../../src/ui/presence.js';
import { createFullscreen } from '../../src/ui/fullscreen.js';
selectMap(data, 'moonroot-grove-v1');
const game = new Game(data, { seed: 7, character: createCharacter(data, { kit: 'bow', name: 'Layout fixture' }) });
game.monsters = [];
const view = { game, world: game.world, region: { staticReady: true }, hero: {}, zoom: 1, monsterViews: new Map(), screenToGround: () => null, project: () => null };
const root = document.getElementById('hud');
const hud = new Hud(root, game, view);
const panels = new Panels(root, game, { onChange() {}, onQuality() {}, getQuality: () => 'low' });
let presence;
const ui = { blocked: () => false, panelOpen: () => panels.isOpen || !!presence?.open, closePanel: () => panels.close(), togglePanel: tab => panels.toggle(tab), interact() {}, configureSkill() {} };
const input = new Input(root, document.getElementById('game'), game, view, ui);
const supplies = new Supplies(root, game, { onArrows: () => { if (!ui.panelOpen()) panels.openArrowCraft(); }, onPotions: () => { if (!ui.panelOpen()) panels.openAutoPotions(); } });
hud.onPanel = tab => panels.open(tab);
hud.addMenuButton('bag', 'I', () => panels.toggle('bag'), 'กระเป๋า');
hud.addMenuButton('book', 'K', () => panels.toggle('skills'), 'สกิล');
const fullscreen = createFullscreen({ bypass: true, onResize() {}, onBlocked: () => input.reset() });
presence = createPresence(game, view, () => input.reset(), () => true);
// Exercise real Join/Solo handlers and DOM status without opening any socket.
presence.client.start = room => { presence.client.room = room; presence.client.statusTo('online'); };
window.__frontier = { game, hud, panels, input, supplies, presence, fullscreen, rendererOmitted: true, networkStubbed: true };
function frame() { input.update(); if (!panels.isOpen) game.update(1 / 60); hud.update(1 / 60, ui); supplies.update(); requestAnimationFrame(frame); }
frame();
