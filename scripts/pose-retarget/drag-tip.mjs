// A dragged run carry (hold.run with arms and socket): find the socket, the weapon's turn in the fist,
// that lays the blade tip on the ground at the low point of the run cycle. Prints one line per carry;
// write `socket` into data/models.json. Needs the dev server. See docs/POSE-RETARGET.md.
//
//   node scripts/pose-retarget/drag-tip.mjs '[["frontline_split","two",null],["armor_cleave","two",null]]'
import { chromium } from 'playwright';
const cases = JSON.parse(process.argv[2]); // [[skill, key, offhand]]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4190/fx-test.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__fxtest?.hero?.holds, null, { timeout: 90000 });
for (const [skill, key, off] of cases) {
  await p.evaluate(([skill, off]) => { const F = window.__fxtest; F.state.auto = false; F.state.weapon = null; F.state.offhand = off; F.setSkill(skill); F.freeze(true); F.advance(0.1); }, [skill, off]);
  await p.waitForTimeout(3000);
  const r = await p.evaluate(([key]) => {
    const F = window.__fxtest, h = F.hero, run = h.holds[h.weaponKind][key].run, w = h.bones.weapon, V = w.position.constructor;
    F.advance(1); F.game.setMove(1, 0); F.advance(1.2);
    w.updateWorldMatrix(true, true); const inv = w.matrixWorld.clone().invert(), v = new V(); let zmax = -1e9;
    w.traverse((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += 5) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); zmax = Math.max(zmax, v.z); } });
    const low = (sock) => { run.socket = sock; F.advance(0.3); let m = 1e9; for (let i = 0; i < 24; i++) { F.advance(1 / 30); w.updateWorldMatrix(true, false); m = Math.min(m, new V(0, 0, zmax).applyMatrix4(w.matrixWorld).y - (F.game.player.y ?? 0)); } return m; };
    let lo = 1.6, hi = 3.1; // the tip is lower at a smaller socket
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (low(mid) > 0.01) hi = mid; else lo = mid; }
    const sock = +((lo + hi) / 2).toFixed(2), tip = low(sock);
    F.game.setMove(0, 0); F.advance(1);
    return { kind: h.weaponKind, key, socket: sock, tipLow: +tip.toFixed(3), length: +zmax.toFixed(2) };
  }, [key]);
  console.log(JSON.stringify(r));
}
await b.close();
