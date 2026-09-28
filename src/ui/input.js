// Input for PC and mobile.
// PC: WASD move, mouse aims (soft target follows the aim), left click = slot 1,
//     right click = slot 2, 1-4 = slots, Space/Shift = movement skill.
// Touch: floating joystick on the left, skill buttons on the right.
//     Tap a skill = quick cast at the soft target / facing. Drag a skill = aim it
//     (area skills place a circle; others pick a direction). Release to cast.
import { icon } from './icons.js';

// skills aimed at a point on the ground (drag places a circle)
const AREA_KINDS = ['ground_area', 'heal_zone', 'dot_zone', 'curse_zone'];

/** Pointer capture keeps a drag on its control; it can fail (synthetic or already-ended pointers). */
const capture = (el, id) => {
  try {
    el.setPointerCapture(id);
  } catch {
    /* the control still works without capture */
  }
};

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export class Input {
  constructor(root, canvas, game, view, ui) {
    this.game = game;
    this.view = view;
    this.ui = ui;
    this.keys = new Set();
    this.mouseDown = [false, false, false];
    this.touchMode = false;
    this.aim = null; // drag-aim preview for the view
    this.joy = { id: null, x: 0, y: 0, dx: 0, dz: 0 };
    this.held = new Set(); // slots held on touch (repeat attack)

    // ---- combat buttons ----
    this.combat = h(`<div class="combat"></div>`);
    const slotClass = ['attack', 's1', 's2', 's3'];
    const keyLabel = ['LMB', 'RMB', '3', '4'];
    this.buttons = slotClass.map((c, i) => {
      const b = h(`<button class="sbtn ${c}" aria-label="skill ${i + 1}"><span class="ic"></span><i class="cd"></i><span class="cdt"></span><span class="key">${keyLabel[i]}</span></button>`);
      this.combat.appendChild(b);
      this.bindSkillButton(b, i);
      return b;
    });
    this.moveBtn = h(`<button class="sbtn move" aria-label="dodge"><span class="ic"></span><i class="cd"></i><span class="charges"></span><span class="key">Space</span></button>`);
    this.combat.appendChild(this.moveBtn);
    this.bindMoveButton(this.moveBtn);
    root.appendChild(this.combat);

    // ---- joystick ----
    this.joyZone = h(`<div class="joyzone"></div>`);
    this.joyEl = h(`<div class="joy idle"><i></i></div>`);
    root.appendChild(this.joyZone);
    root.appendChild(this.joyEl);
    this.bindJoystick();

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = [false, false, false];
    });

    // ---- mouse on the canvas ----
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.setTouch(false);
        this.mouse = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        this.setTouch(true);
        // tapping the world on touch devices steers the joystick if on the left half
        return;
      }
      this.setTouch(false);
      this.mouse = { x: e.clientX, y: e.clientY };
      this.mouseDown[e.button] = true;
      if (e.button === 0) this.castSlot(0, true);
      if (e.button === 2) this.castSlot(1, true);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.mouseDown[e.button] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        view.zoom = Math.min(1.35, Math.max(0.7, view.zoom + Math.sign(e.deltaY) * 0.06));
        e.preventDefault();
      },
      { passive: false }
    );
    // pinch zoom (two fingers on the canvas)
    this.pinch = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      if (this.pinch.size >= 2) this.pinch.clear(); // drop stale fingers
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      capture(canvas, e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.pinch.has(e.pointerId)) return;
      const before = this.pinchDist();
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = this.pinchDist();
      if (before && after) view.zoom = Math.min(1.35, Math.max(0.7, view.zoom * (before / after)));
    });
    const endPinch = (e) => this.pinch.delete(e.pointerId);
    canvas.addEventListener('pointerup', endPinch);
    canvas.addEventListener('pointercancel', endPinch);
    canvas.addEventListener('lostpointercapture', endPinch);

    if (matchMedia('(pointer: coarse)').matches) this.setTouch(true);
  }

  pinchDist() {
    if (this.pinch.size !== 2) return 0;
    const [a, b] = [...this.pinch.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  setTouch(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
    if (on) this.game.input.aimFromPointer = false;
  }

  onKey(e, down) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (down && !e.repeat) {
      if (this.ui.panelOpen()) {
        if (k === 'escape') this.ui.closePanel();
        else if (k === 'i') this.ui.togglePanel('bag');
        else if (k === 'k') this.ui.togglePanel('skills');
        else if (k === 'j') this.ui.togglePanel('job');
        else if (k === 'c') this.ui.togglePanel('char');
        else if (k === 'l') this.ui.togglePanel('journal');
        else if (k === 'm') this.ui.togglePanel('map');
        return;
      }
      if (k === '1') this.castSlot(0, true);
      if (k === '2') this.castSlot(1, true);
      if (k === '3') this.castSlot(2, true);
      if (k === '4') this.castSlot(3, true);
      if (k === 'q') this.castSlot(2, true);
      if (k === 'r') this.castSlot(3, true);
      if (k === ' ' || k === 'shift') this.useMovement();
      if (k === 'e') this.ui.interact();
      if (k === 'i') this.ui.togglePanel('bag');
      if (k === 'k') this.ui.togglePanel('skills');
      if (k === 'j') this.ui.togglePanel('job');
      if (k === 'c') this.ui.togglePanel('char');
      if (k === 'l') this.ui.togglePanel('journal');
      if (k === 'm') this.ui.togglePanel('map');
      if (k === 'escape') this.ui.togglePanel('settings');
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      e.preventDefault();
    }
    if (k === ' ') e.preventDefault();
  }

  pointerGround() {
    if (!this.mouse) return null;
    const p = this.view.screenToGround(this.mouse.x, this.mouse.y);
    return p ? { x: p.x, z: p.z } : null;
  }

  castSlot(i, fromPress = false) {
    if (this.ui.panelOpen()) return;
    const pt = !this.touchMode ? this.pointerGround() : null;
    const ok = this.game.castSlot(i, pt);
    if (fromPress) this.pressFx(this.buttons[i]);
    return ok;
  }

  useMovement(point = null) {
    if (this.ui.panelOpen()) return;
    const pt = point || (!this.touchMode ? this.pointerGround() : null);
    this.game.useMovement(pt);
    this.pressFx(this.moveBtn);
  }

  pressFx(b) {
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 90);
  }

  bindSkillButton(b, i) {
    let start = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType !== 'mouse') this.setTouch(true);
      capture(b, e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), dragging: false };
      if (i === 0) this.held.add(0);
    });
    b.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!start.dragging && Math.hypot(dx, dy) > 14) {
        start.dragging = true;
        this.held.delete(0);
      }
      if (start.dragging) this.aim = this.dragAim(i, dx, dy);
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      this.held.delete(0);
      if (start.dragging && this.aim) {
        const a = this.aim;
        if (a.radius) this.game.castSlot(i, { x: a.x, z: a.z });
        else {
          this.game.setAimAngle(a.angle);
          this.game.player.facing = a.angle;
          this.game.player.targetId = this.targetInDirection(a.angle, a.length);
          this.game.castSlot(i);
        }
        this.pressFx(b);
      } else if (e.type === 'pointerup') {
        this.castSlot(i, true);
      }
      this.aim = null;
      start = null;
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }

  /** Map a drag on a skill button to an aim preview (world). */
  dragAim(i, dx, dy) {
    const s = this.game.skills[i];
    if (!s) return null;
    const p = this.game.player;
    const len = Math.hypot(dx, dy);
    // screen up = world -Z, screen right = world +X
    const angle = Math.atan2(dx, dy);
    const maxDrag = 110;
    if (AREA_KINDS.includes(s.kind)) {
      const r = Math.min(1, len / maxDrag) * s.range;
      return { x: p.x + Math.sin(angle) * r, z: p.z + Math.cos(angle) * r, radius: s.radius };
    }
    return { angle, length: s.range };
  }

  targetInDirection(angle, range) {
    const p = this.game.player;
    let best = null;
    let bestOff = 0.6;
    for (const m of this.game.monsters) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - p.x, m.z - p.z) - m.r;
      if (d > range) continue;
      let off = Math.atan2(m.x - p.x, m.z - p.z) - angle;
      off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
      if (off < bestOff) {
        bestOff = off;
        best = m.id;
      }
    }
    return best;
  }

  bindMoveButton(b) {
    let start = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType !== 'mouse') this.setTouch(true);
      capture(b, e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 18) {
        // swipe the dodge button to pick the direction
        const a = Math.atan2(dx, dy);
        const p = this.game.player;
        const d = this.game.move.distance;
        const saved = { mx: this.game.input.moveX, mz: this.game.input.moveZ };
        this.game.setMove(Math.sin(a), Math.cos(a));
        this.game.useMovement({ x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d });
        this.game.setMove(saved.mx, saved.mz);
        this.pressFx(b);
      } else if (e.type === 'pointerup') this.useMovement();
      start = null;
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }

  bindJoystick() {
    const z = this.joyZone;
    const R = 60;
    const home = () => {
      const r = this.joyZone.getBoundingClientRect();
      return { x: r.left + 120, y: r.bottom - 130 };
    };
    const place = (x, y) => {
      this.joyEl.style.left = `${x}px`;
      this.joyEl.style.top = `${y}px`;
    };
    const hp = home();
    place(hp.x, hp.y);
    window.addEventListener('resize', () => {
      if (this.joy.id === null) {
        const p = home();
        place(p.x, p.y);
      }
    });
    z.addEventListener('pointerdown', (e) => {
      if (this.ui.panelOpen()) return;
      e.preventDefault();
      this.setTouch(true);
      capture(z, e.pointerId);
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dz: 0 };
      place(e.clientX, e.clientY);
      this.joyEl.classList.add('on');
      this.joyEl.classList.remove('idle');
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.x;
      let dy = e.clientY - this.joy.y;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.joyEl.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, len / R);
      const dead = 0.12;
      if (k < dead) {
        this.joy.dx = 0;
        this.joy.dz = 0;
      } else {
        const n = Math.hypot(dx, dy) || 1;
        this.joy.dx = (dx / n) * k;
        this.joy.dz = (dy / n) * k;
      }
    });
    const end = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy = { id: null, x: 0, y: 0, dx: 0, dz: 0 };
      this.joyEl.firstElementChild.style.transform = '';
      this.joyEl.classList.remove('on');
      this.joyEl.classList.add('idle');
      const p = home();
      place(p.x, p.y);
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  }

  /** Per-frame: push movement / aim into the game and refresh button states. */
  update() {
    const g = this.game;
    if (this.disabled) return this.refreshButtons(); // tests drive the game API directly
    let mx = 0;
    let mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.joy.id !== null) {
      mx = this.joy.dx;
      mz = this.joy.dz;
    }
    if (this.ui.panelOpen()) {
      mx = 0;
      mz = 0;
    }
    g.setMove(mx, mz);
    if (!this.touchMode) {
      const pt = this.pointerGround();
      if (pt) g.setAimPoint(pt.x, pt.z);
      if (this.mouseDown[0]) this.castSlot(0);
      if (this.mouseDown[2]) this.castSlot(1);
    } else if (Math.hypot(mx, mz) > 0.1) {
      g.setAimAngle(Math.atan2(mx, mz));
    }
    if (this.held.has(0)) this.castSlot(0);

    // pointer preview for ground skills on PC: show reticle when hovering with one equipped? keep it quiet
    this.refreshButtons();
  }

  refreshButtons() {
    const g = this.game;
    const p = g.player;
    g.skills.forEach((s, i) => {
      const b = this.buttons[i];
      const key = s ? `${s.id}` : 'empty';
      if (b.dataset.skill !== key) {
        b.dataset.skill = key;
        b.querySelector('.ic').innerHTML = s ? icon(s.def.icon) : icon('plus');
        b.classList.toggle('empty', !s);
      }
      if (!s) return;
      const cd = p.cooldowns[i];
      b.style.setProperty('--cd', `${(cd / s.cooldown) * 100}%`);
      b.querySelector('.cdt').textContent = cd > 0.5 ? Math.ceil(cd) : '';
      b.classList.toggle('nomp', p.mp < s.cost);
      b.classList.toggle('locked', !s.requirementsMet);
    });
    const mv = g.move;
    if (this.moveBtn.dataset.skill !== mv.id) {
      this.moveBtn.dataset.skill = mv.id;
      this.moveBtn.querySelector('.ic').innerHTML = icon(mv.id);
    }
    const ch = this.moveBtn.querySelector('.charges');
    const want = `${p.movement.charges}/${mv.charges}`;
    if (ch.dataset.v !== want) {
      ch.dataset.v = want;
      ch.innerHTML = Array.from({ length: mv.charges }, (_, k) => `<i class="${k < p.movement.charges ? 'on' : ''}"></i>`).join('');
    }
    const cdk = p.movement.charges < mv.charges ? 1 - p.movement.rechargeT / mv.recharge : 0;
    this.moveBtn.style.setProperty('--cd', `${p.movement.charges === 0 ? cdk * 100 : 0}%`);
  }
}
