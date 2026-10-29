// Offline UI harness: the real Game and Panels classes, without the 3D renderer.
import {data} from '../../src/data.js';
import {Game} from '../../src/core/game.js';
import {Panels} from '../../src/ui/panels.js';
// Match the live HUD's reserved EXP-strip area; the journal must escape it.
document.body.classList.add('ingame');
const game=new Game(data,{seed:7});game.time=.3;
const panels=new Panels(document.getElementById('hud'),game,{onChange:()=>{},graphics: { get: () => ({ quality: 'low', values: { pixelRatio: 1, shadowMapSize: 0, post: false, dynres: true }, antialias: 4, dpr: 1, buffer: [1, 1] }), setQuality() {}, setCustom() {}, setAntialias() {} }});
window.__frontier={game,panels,paused:true};
