const $ = id => document.getElementById(id);
const DEFAULTS = {kind: 'fbm', scale: 6, detail: 4, contrast: 1, seed: 1, dark: '#1c1d1b', light: '#d9dfd0',
  diameter: 40, height: 80, rdPreset: 'coral', feed: 0.0545, kill: 0.062, grid: 256, level: 0.5, bevel: 1, emboss: 1, display: 'height'};
const RD_PRESETS = {coral: [0.0545, 0.062], maze: [0.029, 0.057], spots: [0.035, 0.065], worms: [0.078, 0.061]};
const RD_MAX_STEPS = 30000;
const view = $('view');

// Deterministic lattice hash; coordinates wrap at `period` so every layer tiles.
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const wrap = (i, p) => ((i % p) + p) % p;
const smooth = t => t * t * (3 - 2 * t);

// Coordinates are in surface units: u runs once around the circumference (0..1) and v uses the
// same unit length along the height, so every lattice cell is square on the cylinder wall.
// Only u wraps; v is unbounded, which is what a cylinder wall needs.
function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash(wrap(x0, period), y0, seed), b = hash(wrap(x0 + 1, period), y0, seed);
  const c = hash(wrap(x0, period), y0 + 1, seed), d = hash(wrap(x0 + 1, period), y0 + 1, seed);
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
    const cx = ix + i, cy = iy + j, wx = wrap(cx, p);
    const dx = cx + hash(wx, cy, seed) - x, dy = cy + hash(wx, cy, seed + 77) - y;
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


// Gray-Scott reaction-diffusion run directly on the unrolled cylinder wall. A cylinder is flat
// when unrolled, so square cells on this grid are square on the surface: the pattern is not
// stretched when wrapped, and the left and right edges join exactly.
const sim = {nx: 0, ny: 0, vwrap: false, U: null, V: null, U2: null, V2: null, steps: 0};

function rng(seed) {
  let a = (seed + 1) * 2654435761 >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function simReset(nx, ny, vwrap, seed) {
  const n = nx * ny;
  Object.assign(sim, {nx, ny, vwrap, U: new Float32Array(n).fill(1), V: new Float32Array(n), U2: new Float32Array(n), V2: new Float32Array(n), steps: 0});
  const rand = rng(seed), blobs = Math.max(4, Math.round(n / 2500));
  for (let b = 0; b < blobs; b++) {
    const cx = Math.floor(rand() * nx), cy = Math.floor(rand() * ny), r = 2 + Math.floor(rand() * 4);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const yy = cy + y;
      if (x * x + y * y > r * r || (!vwrap && (yy < 0 || yy >= ny))) continue;
      const i = wrap(yy, ny) * nx + wrap(cx + x, nx);
      sim.U[i] = 0.5; sim.V[i] = 0.25 + rand() * 0.1;
    }
  }
}

function simStep(count, F, K) {
  const {nx, ny, vwrap} = sim, Du = 0.16, Dv = 0.08;
  for (let s = 0; s < count; s++) {
    const {U, V, U2, V2} = sim;
    for (let y = 0; y < ny; y++) {
      // Free (no-flux) rim at the top and bottom unless the texture must also tile vertically.
      const row = y * nx, up = (y ? y - 1 : vwrap ? ny - 1 : 0) * nx, dn = (y + 1 < ny ? y + 1 : vwrap ? 0 : ny - 1) * nx;
      for (let x = 0; x < nx; x++) {
        const l = x ? x - 1 : nx - 1, r = x + 1 < nx ? x + 1 : 0, i = row + x;
        const u = U[i], v = V[i], uvv = u * v * v;
        U2[i] = u + Du * (U[row + l] + U[row + r] + U[up + x] + U[dn + x] - 4 * u) - uvv + F * (1 - u);
        V2[i] = v + Dv * (V[row + l] + V[row + r] + V[up + x] + V[dn + x] - 4 * v) + uvv - (F + K) * v;
      }
    }
    sim.U = U2; sim.V = V2; sim.U2 = U; sim.V2 = V;
  }
  sim.steps += count;
}

// Resample normalised V at w×h pixels. Both axes use the same cells-per-pixel ratio so cells
// stay square; only the horizontal axis wraps unless the texture tiles vertically.
function reactionField(w, h) {
  const {nx, ny, vwrap, V} = sim, out = new Float32Array(w * h);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < V.length; i++) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
  const k = hi - lo > 1e-4 ? 1 / (hi - lo) : 0, sx = nx / w, sy = vwrap ? ny / h : sx;
  const row = j => (vwrap ? wrap(j, ny) : Math.min(ny - 1, Math.max(0, j))) * nx;
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * sy - 0.5, y0 = Math.floor(fy), ty = fy - y0, r0 = row(y0), r1 = row(y0 + 1);
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) * sx - 0.5, x0 = Math.floor(fx), tx = fx - x0, c0 = wrap(x0, nx), c1 = wrap(x0 + 1, nx);
      const top = V[r0 + c0] + (V[r0 + c1] - V[r0 + c0]) * tx, bot = V[r1 + c0] + (V[r1 + c1] - V[r1 + c0]) * tx;
      out[y * w + x] = (top + (bot - top) * ty - lo) * k;
    }
  }
  return out;
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

// Height map in 0..1: pattern → contrast → level/bevel profile. Bevel 1 leaves values untouched;
// smaller values squeeze the transition around `level` into a narrower sloped edge.
function heightField(w, h, s) {
  const rd = s.kind === 'reaction', field = rd ? reactionField(w, h) : new Float32Array(w * h);
  const bw = Math.max(s.bevel, 0.02);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = rd ? field[i] : height(s.kind, x / w, y / w, s);
    v = Math.min(1, Math.max(0, (v - 0.5) * s.contrast + 0.5));
    if (s.bevel < 1) { const t = Math.min(1, Math.max(0, (v - s.level) / bw + 0.5)); v = t * t * (3 - 2 * t); }
    field[i] = v;
  }
  return field;
}

// Canvas size for a texture w pixels around the cylinder: square pixels, so the height follows
// the real height-to-circumference ratio. Capped so extreme proportions stay exportable.
function dims(w, s) {
  const aspect = Math.PI * s.diameter / s.height;
  const h = Math.max(8, Math.round(w / aspect));
  return h > 8192 ? [Math.round(8192 * aspect), 8192] : [w, h];
}

function render(canvas, w, h, s) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  const field = heightField(w, h, s), d = hex(s.dark), l = hex(s.light);
  const vw = s.kind === 'reaction' && s.vwrap;
  const at = (x, y) => field[(vw ? wrap(y, h) : Math.min(h - 1, Math.max(0, y))) * w + wrap(x, w)];
  const slope = w * 0.02 * s.emboss;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let t = field[y * w + x];
    if (s.display !== 'height') {
      const dx = (at(x + 1, y) - at(x - 1, y)) * slope, dy = (at(x, y + 1) - at(x, y - 1)) * slope, len = Math.hypot(dx, dy, 1);
      if (s.display === 'normal') {
        img.data[o] = (-dx / len * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / len * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
        continue;
      }
      // Light from the top left: raised edges facing it brighten, the far side darkens.
      t = Math.min(1, Math.max(0, 0.5 + (-dx - dy) * 0.5 / len * 1.4 + (1 / len - 0.7) * 0.2));
    }
    for (let k = 0; k < 3; k++) img.data[o + k] = d[k] + (l[k] - d[k]) * t;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const NUM = ['diameter', 'height', 'scale', 'detail', 'contrast', 'seed', 'feed', 'kill', 'grid', 'level', 'bevel', 'emboss'];
function state() {
  const s = {kind: $('kind').value, dark: $('dark').value, light: $('light').value, display: $('display').value, vwrap: $('vwrap').checked};
  for (const k of NUM) s[k] = +$(k).value || 0;
  s.diameter = s.diameter > 0 ? s.diameter : DEFAULTS.diameter;
  s.height = s.height > 0 ? s.height : DEFAULTS.height;
  return s;
}

let dirty = true, running = true;

function restartSim() {
  const s = state(), nx = s.grid;
  simReset(nx, Math.max(8, Math.round(nx / (Math.PI * s.diameter / s.height))), s.vwrap, s.seed);
  running = true;
  dirty = true;
}

function labels() {
  const fmt = (id, d) => { $(id + 'Value').textContent = (+$(id).value).toFixed(d); };
  fmt('scale', 0); fmt('detail', 0); fmt('contrast', 2); fmt('feed', 4); fmt('kill', 4); fmt('level', 2); fmt('bevel', 2); fmt('emboss', 2);
  const rd = $('kind').value === 'reaction';
  $('rdControls').hidden = !rd;
  $('noiseControls').hidden = rd;
  $('run').textContent = running ? 'PAUSE ❚❚' : 'RUN ▶';
  $('steps').textContent = sim.steps + ' steps';
  const s = state(), [w, h] = dims(+$('size').value, s), c = Math.PI * s.diameter;
  $('dims').textContent = `Wall ${c.toFixed(1)} × ${s.height} mm unrolled. Export ${w} × ${h} px, ${(c / w).toFixed(3)} mm per pixel, square pixels.`;
}

function draw() {
  const s = state(), [w, h] = dims(256, s);
  render(view, w, h, s);
  // Repeat the wall side by side to check the seam; also stack it when it tiles vertically.
  const down = s.kind === 'reaction' && s.vwrap ? 2 : 1;
  if ($('tile').checked) {
    const ctx = view.getContext('2d'), tile = document.createElement('canvas');
    tile.width = w; tile.height = h; tile.getContext('2d').drawImage(view, 0, 0);
    view.width = w * 2; view.height = h * down;
    for (let i = 0; i < 2 * down; i++) ctx.drawImage(tile, (i % 2) * w, (i >> 1) * h);
  }
  view.style.aspectRatio = view.width + ' / ' + view.height;
  view.style.width = `min(100%, 760px, ${85 * view.width / view.height}vh)`;
}

function tick() {
  const s = state();
  if (s.kind === 'reaction' && running) {
    simStep(Math.max(2, Math.round(10 * 65536 / (sim.nx * sim.ny))), s.feed, s.kill);
    if (sim.steps >= RD_MAX_STEPS) running = false;
    dirty = true;
  }
  if (dirty) { dirty = false; draw(); labels(); }
  requestAnimationFrame(tick);
}

function reset() {
  for (const k of Object.keys(DEFAULTS)) $(k).value = DEFAULTS[k];
  $('vwrap').checked = false;
  restartSim();
}

const RESTARTS = new Set(['seed', 'grid', 'rdPreset', 'diameter', 'height', 'vwrap']);
document.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => {
  if (el.id === 'rdPreset') { [$('feed').value, $('kill').value] = RD_PRESETS[el.value]; }
  if (el.id === 'kind' && el.value === 'reaction') running = sim.steps < RD_MAX_STEPS;
  if (RESTARTS.has(el.id)) restartSim();
  dirty = true;
}));
$('random').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); restartSim(); });
$('restart').addEventListener('click', restartSim);
$('run').addEventListener('click', () => { if (sim.steps >= RD_MAX_STEPS) restartSim(); else running = !running; dirty = true; });
$('reset').addEventListener('click', reset);
$('export').addEventListener('click', () => {
  const out = document.createElement('canvas');
  const s = state(), [w, h] = dims(+$('size').value, s);
  render(out, w, h, s);
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `texture-${$('kind').value}-${$('seed').value}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});
restartSim();
tick();
