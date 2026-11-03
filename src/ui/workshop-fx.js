// Workshop result effects (owner, 2026-11-03: "ปรับปรุงหน้าคราฟหรือตีบวก ปรับเอฟเฟคด้วย"). Cosmetic only:
// built after the rules have committed the result (workshop-controller), never changing it. The layer is
// fixed over the stage and outlives the stage's re-render at the end of the busy time, then removes itself.
// It plays alongside the stage's own hammer stroke (workshop.css, contact at 442 ms):
//   upgrade  heat builds in the blank, the strike throws sparks and a shock ring, then the new "+N" and
//            the item rise out of a gold burst of rays and stars
//   grade    a rune circle in the new grade's colour turns under the item, motes rise, a pillar of light,
//            then the old letter breaks and the new one stamps in (S in rainbow)
//   craft    the spent materials fly into the anvil and fuse into a bright core; on the strike the new
//            item bursts out in its grade's colour and the grade letter pops beside it
// No allocation per frame: every element is made once and driven by the Web Animations API.
const CONTACT = 442;

const el = (tag, cls, parent, style = '') => { const e = document.createElement(tag); e.className = cls; if (style) e.style.cssText = style; parent?.appendChild(e); return e; };
const anim = (e, frames, opts) => e.animate(frames, { fill: 'both', easing: 'cubic-bezier(.2,.7,.3,1)', ...opts });

export function playWorkshopFx(ui, result) {
  if (typeof document === 'undefined' || !result?.ok) return null;
  const stage = ui.body?.querySelector('[data-workshop-stage]');
  const pedestal = stage?.querySelector('.ws-pedestal'), impact = stage?.querySelector('[data-impact-origin]');
  if (!pedestal || !impact) return null;
  const data = ui.game.data, grades = data.items.grades;
  const box = pedestal.getBoundingClientRect(), hit = impact.getBoundingClientRect();
  const ox = hit.left + hit.width / 2 - box.left, oy = hit.top + hit.height / 2 - box.top;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const layer = el('div', 'wsfx', document.body, `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`);
  const at = (cls, x, y, style = '') => el('div', cls, layer, `left:${x}px;top:${y}px;${style}`);
  const item = result.items?.[0];
  const grade = item?.grade, color = grades.colors[grade] || '#ffd98a';
  const kind = result.action === 'gear-up' ? 'upgrade' : result.action === 'gear-grade' ? 'grade' : 'craft';
  const art = stage.querySelector('.ws-item-art')?.innerHTML || '';
  const S = box.height / 210; // the scene's own scale (viewBox 320 x 210)
  const end = reduced ? 700 : 1700;

  if (reduced) {
    const flash = at('wsfx-flash', ox, oy, `--c:${color}`);
    anim(flash, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: .9, offset: .3 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' }], { duration: 500 });
    reveal(0);
  } else {
    if (kind === 'upgrade') heat();
    if (kind === 'grade') rune();
    if (kind === 'craft') gather();
    strike();
    reveal(CONTACT + 90);
  }
  setTimeout(() => layer.remove(), end + 50);
  return layer;

  function heat() {
    const glow = at('wsfx-heat', ox, oy - 3 * S);
    anim(glow, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.5)' }, { opacity: 1, offset: .85, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }], { duration: CONTACT + 120, easing: 'ease-in' });
    for (let i = 0; i < 6; i++) {
      const e = at('wsfx-ember', ox + (i - 2.5) * 6 * S, oy - 4 * S);
      anim(e, [{ opacity: 0, transform: 'translate(-50%,-50%)' }, { opacity: 1, offset: .3 }, { opacity: 0, transform: `translate(-50%,${-40 - i * 7}px)` }], { duration: 650, delay: i * 55, easing: 'ease-out' });
    }
  }
  function rune() {
    // a flat circle on the anvil: the wrapper lies it down, the drawing inside turns
    const ring = at('wsfx-rune', ox, oy, `--c:${color};width:${150 * S}px;height:${150 * S}px`);
    ring.innerHTML = '<svg viewBox="-100 -100 200 200"><circle r="92"/><circle r="74" class="d"/><circle r="56"/><path d="M0-92L0-74M65-65L52-52M92 0L74 0M65 65L52 52M0 92L0 74M-65 65L-52 52M-92 0L-74 0M-65-65L-52-52"/></svg>';
    anim(ring, [{ opacity: 0, transform: 'translate(-50%,-50%) scaleY(.3) scale(.6)' }, { opacity: 1, offset: .35, transform: 'translate(-50%,-50%) scaleY(.3) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scaleY(.3) scale(1.15)' }], { duration: 1300, easing: 'ease-out' });
    anim(ring.firstChild, [{ transform: 'rotate(0)' }, { transform: 'rotate(200deg)' }], { duration: 1300, easing: 'linear' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, rx = Math.cos(a) * 62 * S, ry = Math.sin(a) * 18 * S;
      const m = at('wsfx-mote', ox + rx, oy + ry, `--c:${color}`);
      anim(m, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, offset: .25 }, { opacity: 0, transform: `translate(-50%,${-70 - (i % 4) * 14}px) scale(1)` }], { duration: 900, delay: (i % 6) * 60, easing: 'ease-out' });
    }
    const pillar = at('wsfx-pillar', ox, oy, `--c:${color};width:${70 * S}px;height:${oy + 20}px`);
    anim(pillar, [{ opacity: 0, transform: 'translate(-50%,-100%) scaleX(.2) scaleY(.2)' }, { opacity: .95, offset: .25, transform: 'translate(-50%,-100%) scaleX(1) scaleY(1)' }, { opacity: 0, transform: 'translate(-50%,-100%) scaleX(.4) scaleY(1.1)' }], { duration: 750, delay: CONTACT - 40, easing: 'ease-out' });
  }
  function gather() {
    const mats = Object.keys(result.spent || {}).filter((id) => id !== 'gold' && data.items.materials[id]).slice(0, 4);
    const icons = mats.map((id) => ui.body.querySelector(`.ws-cost[data-material="${id}"] .ws-cost-art`)?.innerHTML).filter(Boolean);
    icons.forEach((html, i) => {
      const sx = box.width + 10, sy = 20 + i * 34;
      const m = at('wsfx-mat', sx, sy); m.innerHTML = html;
      anim(m, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85, transform: `translate(calc(-50% + ${ox - sx}px), calc(-50% + ${oy - 6 * S - sy}px)) scale(.45)` }, { opacity: 0, transform: `translate(calc(-50% + ${ox - sx}px), calc(-50% + ${oy - 6 * S - sy}px)) scale(.1)` }], { duration: 380, delay: i * 50, easing: 'cubic-bezier(.5,0,.7,1)' });
    });
    const core = at('wsfx-core', ox, oy - 6 * S);
    anim(core, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 1, offset: .6, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 1, offset: .92, transform: 'translate(-50%,-50%) scale(1.25)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }], { duration: CONTACT + 40, delay: 120, easing: 'ease-in' });
  }
  function strike() {
    setTimeout(() => {
      // the stage shakes with the blow
      anim(pedestal, [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }], { duration: 220, fill: 'none', easing: 'linear' });
    }, CONTACT);
    const flash = at('wsfx-flash', ox, oy, `--c:${kind === 'upgrade' ? '#fff3c8' : color}`);
    anim(flash, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }, { opacity: 1, offset: .12, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2.6)' }], { duration: 420, delay: CONTACT, easing: 'ease-out' });
    const ring = at('wsfx-ring', ox, oy, `--c:${kind === 'upgrade' ? '#ffd27a' : color}`);
    anim(ring, [{ opacity: .9, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(3.2)' }], { duration: 520, delay: CONTACT, easing: 'cubic-bezier(.1,.7,.3,1)' });
    const n = kind === 'upgrade' ? 22 : 14;
    for (let i = 0; i < n; i++) {
      // an upward fan with gravity: sparks fly out, arc over and fall
      const a = -Math.PI * (0.08 + 0.84 * (i / (n - 1))) + (Math.random() - 0.5) * 0.18, v = (60 + Math.random() * 70) * S;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v;
      const s = at('wsfx-spark', ox, oy, `--c:${kind === 'upgrade' ? (i % 3 ? '#ffcf6a' : '#fff6d8') : color};transform:translate(-50%,-50%) rotate(${a}rad)`);
      anim(s, [
        { opacity: 1, transform: `translate(-50%,-50%) rotate(${a}rad) scaleX(1.6)` },
        { opacity: 1, offset: .55, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${a + 0.4}rad) scaleX(1)` },
        { opacity: 0, transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy + 40 * S}px)) rotate(${a + 1.1}rad) scaleX(.4)` },
      ], { duration: 520 + Math.random() * 260, delay: CONTACT, easing: 'cubic-bezier(.15,.6,.4,1)' });
    }
  }
  function reveal(delay) {
    const cx = box.width / 2, cy = Math.min(oy - 40 * S, box.height * 0.42);
    const rays = at('wsfx-rays', cx, cy, `--c:${kind === 'upgrade' ? '#ffd56e' : color};width:${box.height * 1.1}px;height:${box.height * 1.1}px`);
    anim(rays, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(0) scale(.3)' }, { opacity: .8, offset: .25, transform: 'translate(-50%,-50%) rotate(25deg) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) rotate(70deg) scale(1.1)' }], { duration: 1100, delay, easing: 'ease-out' });
    const card = at('wsfx-card', cx, cy);
    const label = kind === 'upgrade' ? `+${item?.upgrade ?? ''}` : kind === 'grade' ? grade : grade || '';
    card.innerHTML = `<span class="wsfx-art">${art}<i class="wsfx-shine"></i></span>${label ? `<b class="wsfx-label${grade === 'S' && kind !== 'upgrade' ? ' is-s' : ''}" style="--c:${kind === 'upgrade' ? '#ffcf5a' : color}">${label}</b>` : ''}`;
    anim(card, [
      { opacity: 0, transform: 'translate(-50%,-30%) scale(.2)' },
      { opacity: 1, offset: .18, transform: 'translate(-50%,-50%) scale(1.22)' },
      { opacity: 1, offset: .3, transform: 'translate(-50%,-50%) scale(.96)' },
      { opacity: 1, offset: .38, transform: 'translate(-50%,-50%) scale(1)' },
      { opacity: 1, offset: .82, transform: 'translate(-50%,-56%) scale(1)' },
      { opacity: 0, transform: 'translate(-50%,-64%) scale(.96)' },
    ], { duration: end - delay - 60, delay, easing: 'ease-out' });
    const shine = card.querySelector('.wsfx-shine');
    if (shine) anim(shine, [{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: 'translateX(220%) skewX(-20deg)' }], { duration: 650, delay: delay + 220, easing: 'ease-in-out' });
    if (kind === 'grade' && !reduced) {
      // the old letter breaks before the new one lands
      const old = result.before?.grade;
      if (old) {
        const o = at('wsfx-old', cx + 34, cy, `--c:${grades.colors[old] || '#ccc'}`); o.textContent = old;
        anim(o, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' }, { opacity: 1, offset: .45, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 1, offset: .7, transform: 'translate(-50%,-50%) scale(1.05)' }, { opacity: 0, transform: 'translate(-50%,-30%) scale(1.5) rotate(-12deg)', filter: 'blur(3px)' }], { duration: 560, delay: delay - 380, easing: 'ease-in' });
      }
    }
    const stars = kind === 'grade' && grade === 'S' ? 10 : 6;
    for (let i = 0; i < stars; i++) {
      const a = (i / stars) * Math.PI * 2 + 0.3, r = (52 + (i % 3) * 14) * S;
      const st = at('wsfx-star', cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, `--c:${kind === 'upgrade' ? '#fff1b8' : color}`);
      anim(st, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(0) rotate(0)' }, { opacity: 1, offset: .4, transform: 'translate(-50%,-50%) scale(1) rotate(45deg)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.2) rotate(90deg)' }], { duration: 600, delay: delay + 120 + i * 45, easing: 'ease-out' });
    }
  }
}
