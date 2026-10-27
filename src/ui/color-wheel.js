// A free colour picker for touch: a hue/saturation wheel and a brightness slider. The wheel is
// drawn once into a canvas; dragging calls onPreview(hex) every move and onPick(hex) on release.
const hsv = (h, s, v) => {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
};
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}

/** The picker's markup (a canvas, a marker and a slider); mount() wires it once it is in the page. */
export function colorWheelHtml(id, hex) {
  const [, , v] = hexToHsv(hex);
  return `<div class="cwheel" id="${id}"><div class="cwheel-disc"><canvas width="200" height="200"></canvas><i class="cwheel-dot"></i></div>
    <div class="cwheel-side"><span class="cwheel-now" style="background:${hex}"></span>
    <input type="range" min="8" max="100" value="${Math.round(v * 100)}" aria-label="ความสว่าง"></div></div>`;
}

export function mountColorWheel(root, hex, { onPreview, onPick }) {
  const cv = root.querySelector('canvas'), dot = root.querySelector('.cwheel-dot'), now = root.querySelector('.cwheel-now'), slider = root.querySelector('input');
  const R = cv.width / 2, ctx = cv.getContext('2d'), img = ctx.createImageData(cv.width, cv.height);
  let [h, s, v] = hexToHsv(hex);
  const draw = () => {
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, r = Math.hypot(dx, dy) / R, i = (y * cv.width + x) * 4;
      if (r > 1) { img.data[i + 3] = 0; continue; }
      const c = hsv((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, r, v);
      img.data[i] = c[0] * 255; img.data[i + 1] = c[1] * 255; img.data[i + 2] = c[2] * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  const place = () => {
    const a = (h * Math.PI) / 180;
    dot.style.left = `${50 + 50 * s * Math.cos(a)}%`; dot.style.top = `${50 + 50 * s * Math.sin(a)}%`;
    now.style.background = toHex(hsv(h, s, v));
  };
  const at = (e) => {
    const b = cv.getBoundingClientRect(), dx = (e.clientX - b.left) / b.width * 2 - 1, dy = (e.clientY - b.top) / b.height * 2 - 1;
    h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; s = Math.min(1, Math.hypot(dx, dy));
    place(); onPreview(toHex(hsv(h, s, v)));
  };
  let drag = false;
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (drag) at(e); });
  const end = () => { if (!drag) return; drag = false; onPick(toHex(hsv(h, s, v))); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  slider.addEventListener('input', () => { v = slider.value / 100; draw(); place(); onPreview(toHex(hsv(h, s, v))); });
  slider.addEventListener('change', () => onPick(toHex(hsv(h, s, v))));
  draw(); place();
}
