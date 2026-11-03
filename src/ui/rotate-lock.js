// Landscape only (owner, 2026-11-03: "ไม่ต้องเล่นแบบแนวตั้งได้แล้ว"). A touch device held upright sees a
// "turn your device" card; the game pauses behind it (main.js) and carries on, unchanged, once the
// device is turned back. A desktop window is never locked, whatever its shape.
export function createRotateLock({ onChange = () => {} } = {}) {
  const portrait = matchMedia('(orientation: portrait)'), coarse = matchMedia('(pointer: coarse)');
  // a native modal dialog owns the top layer, above the fullscreen gate and any open journal dialog
  const card = document.createElement('dialog');
  card.className = 'rotate-lock';
  card.setAttribute('aria-labelledby', 'rotate-lock-title');
  card.innerHTML = `<div class="rotate-lock-card"><div class="rotate-lock-device" aria-hidden="true"><i></i></div>
    <h1 id="rotate-lock-title">หมุนเครื่องเป็นแนวนอน</h1><p>เกมนี้เล่นในแนวนอน · ตัวละครและหน้าที่เปิดไว้ยังอยู่เหมือนเดิม</p></div>`;
  card.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(card);
  let blocked = false;
  const sync = () => {
    const now = portrait.matches && coarse.matches;
    if (now && !card.open) card.showModal();
    if (!now && card.open) card.close();
    if (now === blocked) return;
    blocked = now;
    document.body.classList.toggle('rotate-blocked', now);
    onChange(now);
  };
  portrait.addEventListener('change', sync);
  coarse.addEventListener('change', sync);
  addEventListener('resize', sync);
  sync();
  // another modal opened since (the fullscreen gate): bring the card back on top
  const raise = () => { if (blocked && card.open) { card.close(); card.showModal(); } };
  return { get blocked() { return blocked; }, sync, raise };
}
