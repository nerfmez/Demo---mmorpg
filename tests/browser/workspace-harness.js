// Offline UI harness: the real Game and Panels classes, without the 3D renderer.
import {data} from '../../src/data.js';
import {Game} from '../../src/core/game.js';
import {Panels} from '../../src/ui/panels.js';
const game=new Game(data,{seed:7});game.time=.3;
const panels=new Panels(document.getElementById('hud'),game,{onChange:()=>{},onQuality:()=>{},getQuality:()=> 'low'});
window.__frontier={game,panels,paused:true};
