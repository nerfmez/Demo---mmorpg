// Input for PC and mobile.
// PC: WASD move, mouse aims (soft target follows the aim), left click = slot 1,
//     right click = slot 2, 1-4 = slots, Space/Shift = movement skill.
// Touch: floating joystick on the left, skill buttons on the right.
//     Tap a skill = quick cast at the soft target / facing. Drag a skill = aim it
//     (area skills place a circle; others pick a direction). Release to cast.
import { icon } from './icons.js';
import { art } from './art.js';

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
    this.resetHandlers = [];

    // ---- combat buttons ----
    this.combat = h(`<div class="combat"></div>`);
    const slotClass = ['attack', 's1', 's2', 's3'];
    const keyLabel = ['1 · LMB', '2 · RMB', '3 · Q', '4 · R'];
    this.buttons = slotClass.map((c, i) => {
      const b = h(`<button class="sbtn ${c}" aria-label="skill ${i + 1}"><span class="ic"></span><i class="cd"></i><span class="cdt"></span><span class="skill-cost"></span><span class="slabel"></span><span class="key">${keyLabel[i]}</span></button>`);
      this.combat.appendChild(b);
      this.bindSkillButton(b, i);
      return b;
    });
    this.moveBtn = h(`<button class="sbtn move" aria-label="สกิลเคลื่อนที่"><span class="ic"></span><i class="cd"></i><span class="cdt"></span><span class="charges"></span><span class="slabel"></span><span class="key">Space</span></button>`);
    this.combat.appendChild(this.moveBtn);
    this.bindMoveButton(this.moveBtn);
    root.appendChild(this.combat);
    this.cancelEl = h(`<div class="aim-cancel passive" hidden><b>✕</b><span>ลากมาที่นี่เพื่อยกเลิก</span></div>`);
    root.appendChild(this.cancelEl);

    // ---- joystick ----
    this.joyZone = h(`<div class="joyzone"></div>`);
    this.joyEl = h(`<div class="joy idle"><i></i></div>`);
    root.appendChild(this.joyZone);
    root.appendChild(this.joyEl);
    this.bindJoystick();

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    window.addEventListener('orientationchange', () => this.reset());

    // ---- mouse on the canvas ----
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.setTouch(false);
        this.mouse = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.ui.panelOpen()) return;
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

  reset() {
    this.keys.clear();
    this.mouseDown = [false, false, false];
    this.held.clear();
    this.repeatStart = null;
    this.aim = null;
    this.cancelEl.hidden = true;
    this.cancelEl.classList.remove('cancelled');
    this.pinch?.clear();
    this.resetHandlers.forEach((reset) => reset());
    this.resetJoystick?.();
    this.game.setMove(0, 0);
  }

  isCancelled(x, y) {
    const r = this.cancelEl.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
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
    // Key releases still count when focus moved into a menu input.
    if (!down) this.keys.delete(e.key.toLowerCase());
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if ((k === ' ' || k === 'enter') && e.target.closest?.('button')) return;
    if (down && k === 'escape' && this.ui.closeMenu?.()) return;
    if (down && e.repeat && this.ui.panelOpen()) return;
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
      if (down) this.setTouch(false);
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
    const clear = () => {
      const id = start?.id;
      start = null;
      this.held.delete(0);
      this.repeatStart = null;
      this.aim = null;
      this.cancelEl.hidden = true;
      this.cancelEl.classList.remove('cancelled');
      if (id !== undefined && b.hasPointerCapture(id)) b.releasePointerCapture(id);
    };
    this.resetHandlers.push(clear);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.ui.panelOpen() || start) return;
      if (e.pointerType !== 'mouse') this.setTouch(true);
      capture(b, e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), dragging: false };
      if (i === 0) this.repeatStart = performance.now();
    });
    b.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!start.dragging && Math.hypot(dx, dy) > 14) {
        start.dragging = true;
        this.held.delete(0);
        this.repeatStart = null;
      }
      if (start.dragging) {
        this.cancelEl.hidden = false;
        const cancel = this.isCancelled(e.clientX, e.clientY);
        this.cancelEl.classList.toggle('cancelled', cancel);
        this.aim = cancel ? null : this.dragAim(i, dx, dy);
      }
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      this.held.delete(0);
      if (e.type !== 'pointerup' || this.ui.panelOpen() || (start.dragging && this.isCancelled(e.clientX, e.clientY))) return clear();
      if (start.dragging && this.aim) {
        const a = this.aim;
        if (a.radius) this.game.castSlot(i, { x: a.x, z: a.z });
        else {
          this.game.setAimAngle(a.angle, true);
          this.game.player.facing = a.angle;
          this.game.player.targetId = this.targetInDirection(a.angle, a.length);
          this.game.castSlot(i);
        }
        this.pressFx(b);
      } else {
        if (!this.game.skills[i]) this.ui.configureSkill?.(i);
        else this.castSlot(i, true);
      }
      clear();
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
    b.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      if (!this.game.skills[i]) this.ui.configureSkill?.(i);
      else this.castSlot(i, true);
    });
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
    const clear = () => {
      const id = start?.id;
      start = null;
      if (id !== undefined && b.hasPointerCapture(id)) b.releasePointerCapture(id);
    };
    this.resetHandlers.push(clear);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.ui.panelOpen() || start) return;
      if (e.pointerType !== 'mouse') this.setTouch(true);
      capture(b, e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (e.type !== 'pointerup' || this.ui.panelOpen()) return clear();
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
      clear();
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
    b.addEventListener('click', (e) => { if (e.detail === 0) this.useMovement(); });
  }

  bindJoystick() {
    const z = this.joyZone;
    const R = 60;
    const home = () => {
      const r = this.joyZone.getBoundingClientRect();
      return { x: r.left + Math.min(112, r.width * 0.48), y: r.bottom - Math.min(114, r.height * 0.44) };
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
      if (this.ui.panelOpen() || this.joy.id !== null || e.pointerType === 'mouse') return;
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
    this.resetJoystick = () => {
      const id = this.joy.id;
      this.joy = { id: null, x: 0, y: 0, dx: 0, dz: 0 };
      this.joyEl.firstElementChild.style.transform = '';
      this.joyEl.classList.remove('on');
      this.joyEl.classList.add('idle');
      const p = home();
      place(p.x, p.y);
      if (id !== null && z.hasPointerCapture(id)) z.releasePointerCapture(id);
    };
    const end = (e) => { if (e.pointerId === this.joy.id) this.resetJoystick(); };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  /** Per-frame: push movement / aim into the game and refresh button states. */
  update() {
    const g = this.game;
    if (this.disabled) return this.refreshButtons(); // tests drive the game API directly
    if (this.repeatStart !== null && this.repeatStart !== undefined && performance.now() - this.repeatStart > 220) this.held.add(0);
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
      const key = s ? `${s.id}:${s.cost}:${s.requirementsMet}` : 'empty';
      if (b.dataset.skill !== key) {
        b.dataset.skill = key;
        b.querySelector('.ic').innerHTML = s ? art('skill',s.id) : icon('plus');
        b.classList.toggle('empty', !s);
        b.querySelector('.slabel').textContent = s ? s.def.nameTh : 'ใส่สกิล';
        b.querySelector('.skill-cost').textContent = s?.cost ? `${s.cost} MP` : '';
        const label = s ? `${s.def.nameTh} · ${s.cost} MP · ช่อง ${i + 1}` : `ใส่สกิลช่อง ${i + 1}`;
        b.setAttribute('aria-label', label);
        b.title = label;
      }
      if (!s) {
        b.style.setProperty('--cd', '0%');
        b.querySelector('.cdt').textContent = '';
        b.classList.remove('nomp', 'locked');
        return;
      }
      const cd = p.cooldowns[i];
      b.style.setProperty('--cd', `${(cd / s.cooldown) * 100}%`);
      b.querySelector('.cdt').textContent = cd > 0.1 ? cd < 1 ? cd.toFixed(1) : Math.ceil(cd) : '';
      b.classList.toggle('nomp', p.mp < s.cost);
      b.classList.toggle('locked', !s.requirementsMet);
    });
    const mv = g.move;
    if (this.moveBtn.dataset.skill !== mv.id) {
      this.moveBtn.dataset.skill = mv.id;
      this.moveBtn.querySelector('.ic').innerHTML = art('skill',mv.id);
      this.moveBtn.querySelector('.slabel').textContent = mv.def.nameTh;
      this.moveBtn.setAttribute('aria-label', `${mv.def.nameTh} · สกิลเคลื่อนที่`);
    }
    const ch = this.moveBtn.querySelector('.charges');
    const want = `${p.movement.charges}/${mv.charges}`;
    if (ch.dataset.v !== want) {
      ch.dataset.v = want;
      ch.innerHTML = Array.from({ length: mv.charges }, (_, k) => `<i class="${k < p.movement.charges ? 'on' : ''}"></i>`).join('');
    }
    const cdk = p.movement.charges < mv.charges ? 1 - p.movement.rechargeT / mv.recharge : 0;
    this.moveBtn.style.setProperty('--cd', `${p.movement.charges === 0 ? cdk * 100 : 0}%`);
    this.moveBtn.querySelector('.cdt').textContent = p.movement.charges === 0 ? Math.ceil(mv.recharge - p.movement.rechargeT) : '';
  }
}
