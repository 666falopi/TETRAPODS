const $ = id => document.getElementById(id);
const DEFAULTS = {kind: 'fbm', scale: 6, detail: 4, contrast: 1, seed: 1, dark: '#1c1d1b', light: '#d9dfd0'};
const view = $('view');

// Deterministic lattice hash; coordinates wrap at `period` so every layer tiles.
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const wrap = (i, p) => ((i % p) + p) % p;
const smooth = t => t * t * (3 - 2 * t);

function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash(wrap(x0, period), wrap(y0, period), seed), b = hash(wrap(x0 + 1, period), wrap(y0, period), seed);
  const c = hash(wrap(x0, period), wrap(y0 + 1, period), seed), d = hash(wrap(x0 + 1, period), wrap(y0 + 1, period), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(u, v, p, octaves, seed, ridged) {
  let sum = 0, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = p << o;
    let n = valueNoise(u * period, v * period, period, seed + o);
    if (ridged) n = 1 - Math.abs(n * 2 - 1);
    sum += n * amp; total += amp; amp /= 2;
  }
  return sum / total;
}

function cells(u, v, p, seed) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = wrap(cx, p), wy = wrap(cy, p);
    const dx = cx + hash(wx, wy, seed) - x, dy = cy + hash(wx, wy, seed + 77) - y;
    best = Math.min(best, dx * dx + dy * dy);
  }
  return Math.min(1, Math.sqrt(best));
}

function height(kind, u, v, s) {
  switch (kind) {
    case 'ridged': return fbm(u, v, s.scale, s.detail, s.seed, true);
    case 'cells': return cells(u, v, s.scale, s.seed);
    case 'stripes': return (Math.sin((v + (fbm(u, v, s.scale, s.detail, s.seed) - 0.5) * 0.3) * s.scale * Math.PI * 2) + 1) / 2;
    case 'grain': return valueNoise(u * s.scale * 32, v * s.scale * 32, s.scale * 32, s.seed);
    default: return fbm(u, v, s.scale, s.detail, s.seed, false);
  }
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

function render(canvas, n, s) {
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(n, n);
  const field = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const h = height(s.kind, x / n, y / n, s);
    field[y * n + x] = Math.min(1, Math.max(0, (h - 0.5) * s.contrast + 0.5));
  }
  const d = hex(s.dark), l = hex(s.light), at = (x, y) => field[wrap(y, n) * n + wrap(x, n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = (y * n + x) * 4;
    if (s.normal) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * n * 0.02, dy = (at(x, y + 1) - at(x, y - 1)) * n * 0.02;
      const len = Math.hypot(dx, dy, 1);
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / len * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
    } else {
      const t = field[y * n + x];
      for (let k = 0; k < 3; k++) img.data[o + k] = d[k] + (l[k] - d[k]) * t;
    }
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function state() {
  return {kind: $('kind').value, scale: +$('scale').value, detail: +$('detail').value, contrast: +$('contrast').value,
    seed: +$('seed').value || 0, dark: $('dark').value, light: $('light').value, normal: $('normal').checked};
}

let frame = 0;
function update() {
  $('scaleValue').textContent = $('scale').value;
  $('detailValue').textContent = $('detail').value;
  $('contrastValue').textContent = (+$('contrast').value).toFixed(2);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const s = state();
    render(view, 256, s);
    if ($('tile').checked) {
      const ctx = view.getContext('2d'), tile = document.createElement('canvas');
      tile.width = tile.height = 256; tile.getContext('2d').drawImage(view, 0, 0);
      view.width = view.height = 512;
      for (let i = 0; i < 4; i++) ctx.drawImage(tile, (i % 2) * 256, (i >> 1) * 256);
    }
  });
}

function reset() {
  for (const k of Object.keys(DEFAULTS)) $(k).value = DEFAULTS[k];
  $('normal').checked = false;
  update();
}

document.querySelectorAll('input,select').forEach(el => el.addEventListener('input', update));
$('random').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); update(); });
$('reset').addEventListener('click', reset);
$('export').addEventListener('click', () => {
  const out = document.createElement('canvas');
  render(out, +$('size').value, state());
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `texture-${$('kind').value}-${$('seed').value}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});
update();
