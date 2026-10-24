// The forearms' direction in body space while the hero runs (averaged over a gait cycle), to aim a
// run carry's blade square to the forearm: a fist holds its grip across the forearm, and a blade along
// it bends the wrist (the owner saw the hand fold on the run). Square the blade, then allow a small
// wrist tilt toward the wanted direction (15 degrees for swords and daggers, 30 to drag a heavy weapon).
//
//   node scripts/pose-retarget/forearm.mjs <bench skill> <offhand weapon|null>   -> {"R": [x, y, z], "L": [...]}
import { chromium } from 'playwright';

const [skill, off = 'null'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4190/fx-test.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fxtest?.hero?.holds, null, { timeout: 90000 });
const r = await page.evaluate(([skill, off]) => {
  const F = window.__fxtest;
  F.state.weapon = null; F.state.offhand = off === 'null' ? null : off; F.setSkill(skill); F.freeze(true); F.advance(1); F.game.setMove(1, 0);
  const b = F.hero.bones, V = b.body.position.constructor, acc = { R: new V(), L: new V() };
  for (let i = 0; i < 24; i++) {
    F.advance(1 / 30);
    const q = b.body.getWorldQuaternion(b.body.quaternion.clone()).invert();
    for (const s of ['R', 'L']) acc[s].add(b['hand' + s].getWorldPosition(new V()).sub(b['elbow' + s].getWorldPosition(new V())).applyQuaternion(q).normalize());
  }
  return { R: acc.R.normalize().toArray().map((x) => +x.toFixed(3)), L: acc.L.normalize().toArray().map((x) => +x.toFixed(3)) };
}, [skill, off]);
console.log(JSON.stringify(r));
await browser.close();
