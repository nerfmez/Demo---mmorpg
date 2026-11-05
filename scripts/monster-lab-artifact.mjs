// Assemble the monster sandbox as a standalone page (a claude.ai artifact the owner opens on the iPad), like the
// Skill FX bench: publishing it takes seconds, instead of the ~20 minute Skill Lab preview + Pages deploy.
//
//   npm run build && node scripts/monster-lab-artifact.mjs [outDir]
//
// The page is the monster list (monsters.html as index.html); tapping a monster opens game.html#<type>, the game's
// own index.html with a small script in front that turns the hash into the sandbox's query (an artifact link only
// carries a plain #name) and a button back to the list. Only the arena is offered (no maps: they are most of the
// site's size); .glb and .bin files go as base64 text the page decodes. Files: the built page code and data (dist/assets top level), the monster icons, every monster
// model and the hero's base body, outfit and weapon the arena dresses it in.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = process.argv[2] || join(root, 'dist-monster-lab');
if (!existsSync(join(dist, 'monsters.html'))) throw new Error('run npm run build first (dist/monsters.html is missing)');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copy = (rel) => {
  const src = join(dist, rel);
  if (!existsSync(src)) return;
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  cpSync(src, join(out, rel), { recursive: true });
};
// page code and data: the top level of dist/assets (scripts, styles, fonts, effect atlases and baked bins); the
// map folders under it (city, crystal, moonroot) and the other pages' entries (dungeon, fxtest, lab) are left out
for (const f of readdirSync(join(dist, 'assets'))) {
  if (statSync(join(dist, 'assets', f)).isFile() && !/^(dungeon|fxtest|lab)-/.test(f)) copy(`assets/${f}`);
}
// what the arena loads (measured over every monster): monster models and icons, the hero dressed as it starts,
// and its HUD's attack and potion buttons
copy('assets/icons/monster');
for (const f of ['assets/icons/skill/slash.png', 'assets/icons/skill-round/slash.png', 'assets/icons/consumable/hp_potion_s.png', 'assets/icons/consumable/mp_potion_s.png']) copy(f);
copy('models/monsters');
for (const f of ['hero_chibi.glb', 'hero_chibi_hair.glb', 'hero_base.glb', 'outfits/travel_tunic.glb', 'outfits/travel_boots.glb', 'weapons/rusty_sword.glb']) copy(`models/${f}`);
// an artifact cannot serve .glb or .bin: they go as base64 text (<name>.b64.txt) and game.html's fetch decodes them
const encode = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) encode(p);
    else if (/\.(glb|bin)$/.test(f)) { writeFileSync(p + '.b64.txt', readFileSync(p).toString('base64')); rmSync(p); }
  }
};
encode(out);

// the list: its cards open game.html#<type> (the arena only)
const list = readFileSync(join(dist, 'monsters.html'), 'utf8');
writeFileSync(join(out, 'index.html'), list.replace('<title>Monster Lab</title>', '<title>Monster Lab</title>\n<script>window.__monsterLabArtifact = true;</script>'));
// the game: the hash becomes the sandbox's query before any module reads location.search
const game = readFileSync(join(dist, 'index.html'), 'utf8');
const front = `<script>(function(){var F=window.fetch.bind(window);
window.fetch=function(i,o){var u=typeof i==='string'?i:i&&i.url;if(u&&/\\.(glb|bin)([?#]|$)/.test(u)){var p=new URL(u,location.href);p.search='';p.hash='';
return F(p.href+'.b64.txt').then(function(r){if(!r.ok)return r;return r.text().then(function(t){var s=atob(t.trim()),n=s.length,b=new Uint8Array(n);for(var k=0;k<n;k++)b[k]=s.charCodeAt(k);
return new Response(b,{status:200,headers:{'Content-Type':'application/octet-stream'}});});});}return F(i,o);};
var t=decodeURIComponent((location.hash||'').slice(1));if(!t){location.replace('index.html');return;}
history.replaceState(null,'','game.html?fresh=1&load=dev&arena=1&monsterLab='+encodeURIComponent(t)+location.hash);
addEventListener('DOMContentLoaded',function(){var a=document.createElement('a');a.href='index.html';a.textContent='◀ รายชื่อมอน';
a.style.cssText='position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:99999;padding:8px 12px;border-radius:10px;background:rgba(20,28,40,.82);color:#fff;font:600 14px system-ui,sans-serif;text-decoration:none';
document.body.appendChild(a);});addEventListener('hashchange',function(){location.reload();});})();</script>`;
writeFileSync(join(out, 'game.html'), game.replace(/<head>/i, '<head>\n' + front));
// the map checkbox does nothing here: hide it
writeFileSync(join(out, 'index.html'), readFileSync(join(out, 'index.html'), 'utf8').replace('</head>', '<style>#list label{display:none}</style>\n</head>'));

let n = 0, bytes = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else { n++; bytes += statSync(p).size; } } };
walk(out);
console.log(`${relative(root, out) || out}: ${n} files, ${(bytes / 1e6).toFixed(1)} MB`);
