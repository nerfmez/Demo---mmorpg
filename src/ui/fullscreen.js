// Fullscreen is a user gesture, never an automatic request loop. This controller
// owns presentation/input blocking only; character saves and game rules stay intact.
export function createFullscreen({ bypass = false, onBlocked = () => {}, onResize = () => {} } = {}) {
  const doc = document, target = doc.documentElement;
  const request = target.requestFullscreen || target.webkitRequestFullscreen;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
  const supported = Boolean(request && enabled);
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const active = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  let blocked = !bypass && !standalone && !active(), pending = false, entered = active(), fallback = bypass || standalone, failed = false, resizeFrame = 0;
  // A native modal must own the top layer: journal search/respec dialogs escape
  // ordinary CSS stacking and would otherwise remain interactive while paused.
  const overlay = doc.createElement('dialog');
  overlay.className = 'fullscreen-gate';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'fullscreen-title');
  overlay.innerHTML = `<div class="fullscreen-card"><span class="fullscreen-kicker">AZURE COAST</span><div class="fullscreen-symbol" aria-hidden="true">⛶</div><h1 id="fullscreen-title"></h1><p id="fullscreen-message"></p><button class="fullscreen-enter" type="button">เข้าเกมเต็มจอ</button><button class="fullscreen-fallback" type="button">เล่นในพื้นที่หน้าจอที่ใช้ได้</button><small>ออกจากเต็มจอได้ด้วย Esc หรือปุ่มของเบราว์เซอร์</small><p class="fullscreen-status" role="status" aria-live="polite"></p></div>`;
  const control = doc.createElement('button'); control.type = 'button'; control.className = 'fullscreen-control'; control.textContent = '⛶ เล่นเต็มจอ'; control.setAttribute('aria-label', 'เล่นเต็มจอ');
  doc.body.append(overlay, control);
  const enter = overlay.querySelector('.fullscreen-enter'), alt = overlay.querySelector('.fullscreen-fallback'), status = overlay.querySelector('.fullscreen-status');
  const suspendedDialogs = new Map();
  const paint = () => {
    const hud = doc.getElementById('hud');
    // Restore ancestors before close() returns focus to the preserved workspace.
    if (!blocked && hud) hud.inert = false;
    overlay.hidden = !blocked;
    if (blocked) {
      if (!overlay.open) overlay.showModal();
      // Explicit inertness also protects native dialogs that escape an inert
      // ancestor. Keep their content/open state for the return to fullscreen.
      for (const dialog of doc.querySelectorAll('dialog[open]')) {
        if (dialog === overlay) continue;
        if (!suspendedDialogs.has(dialog)) suspendedDialogs.set(dialog, dialog.inert);
        dialog.inert = true;
      }
    } else {
      for (const [dialog, inert] of suspendedDialogs) dialog.inert = inert;
      suspendedDialogs.clear();
      if (overlay.open) overlay.close();
    }
    control.hidden = blocked || active() || standalone;
    doc.body.classList.toggle('fullscreen-blocked', blocked);
    if (hud) hud.inert = blocked;
    overlay.querySelector('h1').textContent = entered ? 'พักเกมไว้แล้ว' : 'เข้าเกมเต็มจอ';
    overlay.querySelector('#fullscreen-message').textContent = supported
      ? (entered ? 'กลับเข้าเต็มจอเพื่อเล่นต่อ · ตัวละครและหน้าที่เปิดไว้ยังอยู่เหมือนเดิม' : 'เปิดพื้นที่ให้เกมและปุ่มสัมผัส ด้วยการแตะครั้งเดียว')
      : 'เบราว์เซอร์นี้ไม่รองรับเกมเต็มจอ ลองเปิดจากหน้าจอโฮม หรือเล่นในพื้นที่หน้าจอที่ใช้ได้';
    enter.hidden = !supported; enter.disabled = pending; control.disabled = pending;
    enter.textContent = pending ? 'กำลังเปิดเต็มจอ…' : entered ? 'กลับเข้าเกมเต็มจอ' : 'เข้าเกมเต็มจอ';
    alt.hidden = supported && !failed;
    onBlocked(blocked);
  };
  const resize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const v = window.visualViewport;
      // Read the visible viewport, including browser toolbar/orientation changes.
      target.style.setProperty('--viewport-w', `${Math.round(v?.width || innerWidth)}px`);
      target.style.setProperty('--viewport-h', `${Math.round(v?.height || innerHeight)}px`);
      onResize(); window.dispatchEvent(new Event('frontier:viewport'));
    });
  };
  const sync = () => {
    if (active()) { entered = true; fallback = false; blocked = false; failed = false; status.textContent = ''; }
    else if (entered && !fallback) blocked = true;
    paint(); resize();
    if (blocked) (supported ? enter : alt).focus({ preventScroll: true });
  };
  const open = async () => {
    if (pending || active()) return;
    if (!supported) { blocked = true; paint(); alt.focus({ preventScroll: true }); return; }
    pending = true; failed = false; status.textContent = ''; paint();
    try {
      // Call synchronously within the button's gesture before awaiting anything.
      await request.call(target);
      sync();
    } catch {
      failed = true; blocked = true;
      status.textContent = 'เบราว์เซอร์ไม่อนุญาตให้เปิดเต็มจอ ลองอีกครั้ง หรือเลือกเล่นในพื้นที่ที่ใช้ได้';
    } finally { pending = false; paint(); }
  };
  enter.addEventListener('click', open); control.addEventListener('click', open);
  // Esc may exit browser fullscreen, but cannot dismiss the paused-game gate.
  overlay.addEventListener('cancel', e => e.preventDefault());
  alt.addEventListener('click', () => { fallback = true; blocked = false; paint(); resize(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== 'Tab') return;
    const buttons = [...overlay.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled);
    if (!buttons.length) return;
    const first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  doc.addEventListener('fullscreenchange', sync); doc.addEventListener('webkitfullscreenchange', sync);
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  paint(); resize();
  return { get blocked() { return blocked; }, open, snapshot: () => ({ blocked, pending, supported, active: active(), fallback, entered }) };
}
