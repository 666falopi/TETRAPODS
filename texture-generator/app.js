import * as THREE from './three.module.js';
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

// Concentric ripples radiating from one seeded point per lattice cell, like raindrops on water.
// Neighbouring cells overlap so rings interfere; distances are in cell units and u wraps via cx.
function ripples(u, v, p, rings, seed) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y);
  let sum = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = wrap(cx, p);
    const dx = cx + hash(wx, cy, seed) - x, dy = cy + hash(wx, cy, seed + 77) - y, d = Math.hypot(dx, dy);
    sum += Math.max(0, 1 - d / 1.5) ** 2 * Math.cos(d * rings * Math.PI * 2);
  }
  return Math.min(1, Math.max(0, 0.5 + sum * 0.6));
}

function height(kind, u, v, s) {
  switch (kind) {
    case 'ripples': return ripples(u, v, s.scale, s.detail, s.seed);
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

function render(canvas, w, h, s, field = heightField(w, h, s)) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  const d = hex(s.dark), l = hex(s.light);
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

let dirty = true, running = true, stepTarget = 0, pendingCapture = false;

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
  // A shared link of a reaction-diffusion state replays the simulation up to the shared step.
  if (s.kind === 'reaction' && sim.steps < stepTarget) {
    const t0 = performance.now();
    while (sim.steps < stepTarget && performance.now() - t0 < 12) simStep(Math.min(50, stepTarget - sim.steps), s.feed, s.kill);
    if (sim.steps >= stepTarget) running = stepTarget >= RD_MAX_STEPS ? false : running;
    dirty = true;
  }
  if (pendingCapture && (s.kind !== 'reaction' || sim.steps >= stepTarget)) { pendingCapture = false; capture(); }
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
// Share link: every control goes in the URL hash, plus the
// simulation step for reaction-diffusion, so the link rebuilds exactly this state.
const SHARED = [...document.querySelectorAll('input[id],select[id]')].map(el => el.id);
const isCheck = id => $(id).type === 'checkbox';
const readControl = id => isCheck(id) ? ($(id).checked ? '1' : '0') : $(id).value;

function shareUrl() {
  const q = new URLSearchParams();
  for (const id of SHARED) q.set(id, readControl(id));
  q.set('view', viewMode);
  if (captured) q.set('captured', '1');
  if ($('kind').value === 'reaction') { q.set('steps', sim.steps); if (!running) q.set('paused', '1'); }
  return location.origin + location.pathname + location.search + '#' + q;
}

function applyHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  for (const id of SHARED) {
    if (!q.has(id)) continue;
    if (isCheck(id)) $(id).checked = q.get(id) === '1'; else $(id).value = q.get(id);
  }
  restartSim();
  stepTarget = Math.min(RD_MAX_STEPS, Math.max(0, +q.get('steps') || 0));
  if (q.get('paused') === '1') running = false;
  if (q.get('view') === 'geometry') viewMode = 'geometry';
  pendingCapture = q.get('captured') === '1';
}

$('share').addEventListener('click', async () => {
  const url = shareUrl(), b = $('share');
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); b.textContent = 'LINK COPIED ✓'; }
  catch { b.textContent = 'COPY FROM ADDRESS BAR'; }
  setTimeout(() => { b.textContent = 'COPY SHARE LINK ⧉'; }, 2000);
});


// Capture: freeze the current state and show it on a cylinder, either as a texture or as real
// displaced geometry built from the same height field.
const stage = $('stage');
let viewer = null, captured = null, currentMesh = null, viewMode = 'texture';

function makeViewer() {
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x151615);
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  // `tilt` carries the pitch and the ruler; `pivot` spins the model inside it, so the ruler stays upright
  // relative to the cylinder axis while the cylinder turns.
  const tilt = new THREE.Group(), pivot = new THREE.Group(), ruler = new THREE.Group();
  scene.add(tilt); tilt.add(pivot, ruler);
  // Drag turns the cylinder about its own axis (x) and tips it (y); the wheel zooms. Auto-rotate
  // keeps spinning about the y axis until the pointer is pressed.
  const v = {pivot, ruler, yaw: 0, pitch: 0.22, dist: 5, bound: 1.5, dragging: false};
  const place = () => { camera.position.set(0, 0, v.dist); camera.lookAt(0, 0, 0); };
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  v.fit = bound => { v.bound = bound; v.dist = bound * 3.8; v.pitch = 0.22; place(); };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { v.dragging = true; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => { v.dragging = false; });
  el.addEventListener('pointercancel', () => { v.dragging = false; });
  el.addEventListener('pointermove', e => {
    if (!v.dragging) return;
    v.yaw += e.movementX * 0.01;
    v.pitch = Math.max(-1.5, Math.min(1.5, v.pitch + e.movementY * 0.01));
  });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    v.dist = Math.max(v.bound * 1.3, Math.min(v.bound * 12, v.dist * Math.exp(e.deltaY * 0.001)));
    place();
  }, {passive: false});
  new ResizeObserver(resize).observe(stage);
  resize();
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    if ($('auto').checked && !v.dragging) v.yaw += (now - last) / 1000 * 0.6;
    last = now;
    tilt.rotation.x = v.pitch;
    pivot.rotation.y = v.yaw;
    renderer.render(scene, camera);
  });
  return v;
}

function clearPivot() {
  for (const m of [...viewer.pivot.children]) {
    viewer.pivot.remove(m);
    m.geometry.dispose();
    for (const x of [].concat(m.material)) { x.map?.dispose(); x.normalMap?.dispose(); x.dispose(); }
  }
}

// Height 2 units; radius keeps the real diameter-to-height ratio, so the wall keeps its proportions.
function textureMesh(c) {
  const {s} = c, texture = new THREE.CanvasTexture(c.canvas), r = s.diameter / s.height;
  texture.colorSpace = s.display === 'normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  const side = s.display === 'normal'
    ? new THREE.MeshStandardMaterial({color: s.light, normalMap: texture, roughness: 0.8})
    : new THREE.MeshStandardMaterial({map: texture, roughness: 0.85});
  const cap = new THREE.MeshStandardMaterial({color: s.dark, roughness: 0.9});
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2, 128, 1), [side, cap, cap]);
}

// Printable relief shell. The original smooth cylinder is removed: what remains is the displaced
// outer surface and an inner surface offset inwards along the surface normal by `shellMm`, so
// the wall has an even thickness everywhere, flat at the top and bottom rims.
// With `cutLevel` the black is removed: a cell is clipped along the exact iso-line where the
// height crosses that level (marching squares, linear along cell edges), so edges are not
// limited to the mesh grid. `smooth` blurs only the height used to place that line, in mesh
// cells, which rounds off jagged edges; the relief itself comes from the unblurred height.
// Only the horizontal index wraps, so the seam shares vertices.
function shellMesh(c, depthMm, shellMm, cutLevel, smooth = 0) {
  const {s, w, h, field} = c, r0 = s.diameter / s.height, aspect = Math.PI * s.diameter / s.height, TAU = Math.PI * 2;
  const R = Math.min(w, 512), Hs = Math.min(1200, Math.max(2, Math.round(R / aspect)));
  const amp = depthMm * 2 / s.height, T = shellMm * 2 / s.height, N = R * (Hs + 1), minInner = 0.02, cut = cutLevel != null;
  const sample = (i, j) => {
    const fx = i / R * w - 0.5, fy = Math.min(h - 1, Math.max(0, j / Hs * h - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, y1 = Math.min(h - 1, y0 + 1), a = wrap(x0, w), b = wrap(x0 + 1, w);
    const top = field[y0 * w + a] + (field[y0 * w + b] - field[y0 * w + a]) * tx;
    const bot = field[y1 * w + a] + (field[y1 * w + b] - field[y1 * w + a]) * tx;
    return top + (bot - top) * ty;
  };
  const tv = new Float32Array(N);
  for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) tv[j * R + i] = sample(i, j);
  let mv = tv;
  if (cut && smooth > 0.05) {
    const rad = Math.ceil(smooth * 3), kernel = Array.from({length: 2 * rad + 1}, (_, k) => Math.exp(-((k - rad) ** 2) / (2 * smooth * smooth)));
    const norm = kernel.reduce((p, q) => p + q, 0), tmpField = new Float32Array(N);
    mv = new Float32Array(N);
    for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) {
      let acc = 0;
      for (let k = -rad; k <= rad; k++) acc += kernel[k + rad] * tv[j * R + wrap(i + k, R)];
      tmpField[j * R + i] = acc / norm;
    }
    for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) {
      let acc = 0;
      for (let k = -rad; k <= rad; k++) acc += kernel[k + rad] * tmpField[Math.min(Hs, Math.max(0, j + k)) * R + i];
      mv[j * R + i] = acc / norm;
    }
  }
  const dark = new THREE.Color(s.dark), light = new THREE.Color(s.light), tmp = new THREE.Color();
  const P = [], C = [], I = [];
  let clamped = false;
  const outerAt = (t, a, y) => [(r0 + t * amp) * Math.sin(a), y, (r0 + t * amp) * Math.cos(a)];
  // Outer grid positions, then smooth surface normals from central differences.
  const op = new Float32Array(N * 3), gn = new Float32Array(N * 3);
  for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) op.set(outerAt(tv[j * R + i], i / R * TAU, 1 - 2 * j / Hs), (j * R + i) * 3);
  for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) {
    const m = (j * R + wrap(i - 1, R)) * 3, n = (j * R + (i + 1) % R) * 3, u = (Math.max(0, j - 1) * R + i) * 3, d = (Math.min(Hs, j + 1) * R + i) * 3;
    const a = [op[n] - op[m], op[n + 1] - op[m + 1], op[n + 2] - op[m + 2]], b = [op[d] - op[u], op[d + 1] - op[u + 1], op[d + 2] - op[u + 2]];
    let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const k = (j * R + i) * 3, len = Math.hypot(nx, ny, nz) || 1;
    // Make the normal point away from the axis.
    const sign = nx * op[k] + nz * op[k + 2] < 0 ? -1 : 1;
    gn.set([sign * nx / len, sign * ny / len, sign * nz / len], k);
  }
  // Inner point: step back along the normal; rim points stay in their plane so the ends are flat.
  const inward = (p, n, rim) => {
    let x = p[0] - T * n[0], z = p[2] - T * n[2];
    const rad = Math.hypot(x, z);
    if (rad < minInner) { x *= minInner / (rad || 1); z *= minInner / (rad || 1); clamped = true; }
    return [x, rim ? p[1] : p[1] - T * n[1], z];
  };
  const vertex = (p, color) => { P.push(p[0], p[1], p[2]); C.push(color.r, color.g, color.b); return P.length / 3 - 1; };
  // Grid vertices: outer 0..N-1, inner N..2N-1.
  for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) {
    const k = (j * R + i) * 3;
    tmp.copy(dark).lerp(light, tv[j * R + i]);
    vertex([op[k], op[k + 1], op[k + 2]], tmp);
  }
  for (let j = 0; j <= Hs; j++) for (let i = 0; i < R; i++) {
    const k = (j * R + i) * 3;
    tmp.copy(dark).lerp(light, tv[j * R + i]);
    vertex(inward([op[k], op[k + 1], op[k + 2]], [gn[k], gn[k + 1], gn[k + 2]], j === 0 || j === Hs), tmp);
  }
  // Points where the iso-line crosses a grid edge, shared by the two cells on either side.
  const crossings = new Map();
  const crossing = (key, from, to, horizontal, i, j) => {
    let x = crossings.get(key);
    if (x) return x;
    const q = Math.min(0.999, Math.max(0.001, (cutLevel - mv[from]) / (mv[to] - mv[from])));
    const t = tv[from] + (tv[to] - tv[from]) * q;
    const a = (horizontal ? i + q : i) / R * TAU, y = 1 - 2 * (horizontal ? j : j + q) / Hs;
    const n = [0, 1, 2].map(m => gn[from * 3 + m] + (gn[to * 3 + m] - gn[from * 3 + m]) * q), len = Math.hypot(...n) || 1;
    const p = outerAt(t, a, y);
    tmp.copy(dark).lerp(light, t);
    x = {o: vertex(p, tmp), i: vertex(inward(p, n.map(v => v / len), horizontal && (j === 0 || j === Hs)), tmp), q};
    crossings.set(key, x);
    return x;
  };
  const walls = [];
  const cu = [0, 1, 1, 0], cv = [0, 0, 1, 1];
  for (let j = 0; j < Hs; j++) for (let i = 0; i < R; i++) {
    const k1 = (i + 1) % R, g = [j * R + i, j * R + k1, (j + 1) * R + k1, (j + 1) * R + i];
    const ins = g.map(v => !cut || mv[v] >= cutLevel);
    if (!ins[0] && !ins[1] && !ins[2] && !ins[3]) continue;
    // Walk the cell's corners clockwise; keep inside corners and add a vertex where the line crosses an edge.
    const poly = [];
    for (let k = 0; k < 4; k++) {
      if (ins[k]) poly.push({x: false, o: g[k], i: N + g[k], u: cu[k], v: cv[k]});
      if (ins[k] !== ins[(k + 1) % 4]) {
        let x, u, v;
        if (k === 0) { x = crossing(`h${i},${j}`, g[0], g[1], true, i, j); u = x.q; v = 0; }
        else if (k === 1) { x = crossing(`v${k1},${j}`, g[1], g[2], false, k1, j); u = 1; v = x.q; }
        else if (k === 2) { x = crossing(`h${i},${j + 1}`, g[3], g[2], true, i, j + 1); u = x.q; v = 1; }
        else { x = crossing(`v${i},${j}`, g[0], g[3], false, i, j); u = 0; v = x.q; }
        poly.push({x: true, o: x.o, i: x.i, u, v});
      }
    }
    for (let m = 1; m < poly.length - 1; m++) {
      I.push(poly[0].o, poly[m + 1].o, poly[m].o);      // outer face, normals point away from the axis
      I.push(poly[0].i, poly[m].i, poly[m + 1].i);      // mirrored inner face, normals point toward it
    }
    for (let m = 0; m < poly.length; m++) {
      const p = poly[m], q = poly[(m + 1) % poly.length];
      const contour = p.x && q.x, top = j === 0 && p.v === 0 && q.v === 0, bottom = j === Hs - 1 && p.v === 1 && q.v === 1;
      if (contour || top || bottom) walls.push([p, q, i]);
    }
  }
  // Side walls get their own vertices so every edge of the solid stays crisp.
  for (const [p, q, i] of walls) {
    const base = P.length / 3, copy = (from, to) => { P.push(P[from * 3], P[from * 3 + 1], P[from * 3 + 2]); C.push(dark.r, dark.g, dark.b); return to; };
    const o1 = copy(p.o, base), o2 = copy(q.o, base + 1), i1 = copy(p.i, base + 2), i2 = copy(q.i, base + 3);
    // Travelling clockwise keeps the solid on the right, so outward is to the left.
    const du = q.u - p.u, dv = q.v - p.v, theta = (i + (p.u + q.u) / 2) / R * TAU;
    const out = [dv * Math.cos(theta), du, -dv * Math.sin(theta)];
    const A = o1 * 3, B = o2 * 3, D = i2 * 3;
    const e1 = [P[B] - P[A], P[B + 1] - P[A + 1], P[B + 2] - P[A + 2]], e2 = [P[D] - P[A], P[D + 1] - P[A + 1], P[D + 2] - P[A + 2]];
    const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * out[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * out[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * out[2];
    if (dot >= 0) I.push(o1, o2, i2, o1, i2, i1); else I.push(o1, i2, o2, o1, i1, i2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(I), 1));
  geometry.computeVertexNormals();
  return Object.assign(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.75, side: THREE.DoubleSide})), {triangles: I.length / 3, clamped});
}

// Binary STL in millimetres, z up with the cylinder axis vertical and its base on z = 0.
function stlBlob(mesh, heightMm) {
  const pos = mesh.geometry.attributes.position.array, index = mesh.geometry.index.array, k = heightMm / 2;
  const count = index.length / 3, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  view.setUint32(80, count, true);
  const p = i => [pos[i * 3] * k, -pos[i * 3 + 2] * k, (pos[i * 3 + 1] + 1) * k];
  for (let t = 0; t < count; t++) {
    const a = p(index[t * 3]), b = p(index[t * 3 + 1]), c = p(index[t * 3 + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...nrm) || 1;
    const o = 84 + t * 50;
    [nrm[0] / len, nrm[1] / len, nrm[2] / len, ...a, ...b, ...c].forEach((x, q) => view.setFloat32(o + q * 4, x, true));
  }
  return new Blob([buffer], {type: 'model/stl'});
}

// Rulers in millimetres in the plane through the axis, where the perspective scale is true:
// one beside the cylinder for its height and one beneath it for its diameter.
function labelSprite(text, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9ece3'; ctx.font = '600 34px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true}));
  sprite.scale.set(size * 2, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function buildRuler(c, reliefMm) {
  const group = viewer.ruler;
  for (const m of [...group.children]) {
    group.remove(m);
    m.geometry?.dispose();
    m.material.map?.dispose(); m.material.dispose();
  }
  const {s} = c, k = 2 / s.height, r = s.diameter / s.height, bound = viewer.bound, tick = bound * 0.04, size = bound * 0.07;
  const niceStep = total => [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(x => total / x <= 10) ?? 1000;
  const xr = -(r + reliefMm * k + bound * 0.12), yr = -1 - bound * 0.1;
  const v = [], label = (text, x, y) => { const sp = labelSprite(text, size); sp.position.set(x, y, 0); group.add(sp); };
  // Height ruler.
  v.push(xr, -1, 0, xr, 1, 0);
  for (let m = 0; m <= s.height + 1e-6; m += niceStep(s.height)) {
    const y = -1 + m * k;
    v.push(xr, y, 0, xr + tick, y, 0);
    label(String(m), xr - size * 1.3, y);
  }
  label('mm', xr - size * 1.3, 1 + size * 1.2);
  // Diameter ruler.
  v.push(-r, yr, 0, r, yr, 0);
  for (let m = 0; m <= s.diameter + 1e-6; m += niceStep(s.diameter)) {
    const x = -r + m * k;
    v.push(x, yr, 0, x, yr - tick, 0);
    label(String(m), x, yr - tick - size * 0.7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0xe9ece3, depthTest: false, transparent: true}));
  lines.renderOrder = 10;
  group.add(lines);
}

function showCaptured() {
  clearPivot();
  const geometry = viewMode === 'geometry', depth = +$('depth').value, wall = +$('wall').value, cut = $('cut').checked ? +$('cutLevel').value : null;
  const mesh = geometry ? shellMesh(captured, depth, wall, cut, +$('cutSmooth').value) : textureMesh(captured);
  viewer.pivot.add(mesh);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === viewMode)));
  $('depthRow').hidden = $('wallRow').hidden = $('exportStl').hidden = $('cutRow').hidden = !geometry;
  $('cutLevelRow').hidden = $('cutSmoothRow').hidden = !geometry || !$('cut').checked;
  $('cutSmoothValue').textContent = (+$('cutSmooth').value).toFixed(1);
  $('cutLevelValue').textContent = (+$('cutLevel').value).toFixed(2);
  $('exportStl').disabled = geometry && mesh.triangles === 0;
  $('depthValue').textContent = depth.toFixed(1);
  $('wallValue').textContent = wall.toFixed(1);
  currentMesh = mesh;
  buildRuler(captured, geometry ? depth : 0);
  viewer.ruler.visible = $('ruler').checked;
  const {w, h, label} = captured;
  $('captureInfo').textContent = `${label} · Ø${captured.s.diameter} × ${captured.s.height} MM · ${w} × ${h} PX` + (geometry ? ` · ${mesh.triangles.toLocaleString('en')} TRIANGLES` + (mesh.triangles === 0 ? ' · NOTHING ABOVE THE CUT LEVEL' : mesh.clamped ? ' · INNER WALL CLAMPED AT THE AXIS' : '') : '');
}

function capture() {
  const s = state(), [w, h] = dims(+$('size').value, s), canvas = document.createElement('canvas');
  const field = heightField(w, h, s);
  render(canvas, w, h, s, field);
  const label = s.kind === 'reaction' ? `REACTION–DIFFUSION · ${sim.steps} STEPS` : $('kind').selectedOptions[0].text.toUpperCase();
  captured = {s, w, h, field, canvas, label};
  viewer ||= makeViewer();
  viewer.fit(Math.hypot(s.diameter / s.height + 0.5, 1.2));
  $('captureHint').hidden = true;
  $('viewbar').hidden = false;
  showCaptured();
}

let depthFrame = 0;
$('capture').addEventListener('click', capture);
$('ruler').addEventListener('input', () => { if (viewer) viewer.ruler.visible = $('ruler').checked; });
$('resetView').addEventListener('click', () => { if (viewer) { viewer.yaw = 0; viewer.fit(viewer.bound); } });
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { viewMode = b.dataset.view; if (captured) showCaptured(); }));
for (const id of ['depth', 'wall', 'cut', 'cutLevel', 'cutSmooth']) $(id).addEventListener('input', () => {
  cancelAnimationFrame(depthFrame);
  depthFrame = requestAnimationFrame(() => { if (captured && viewMode === 'geometry') showCaptured(); });
});
$('exportStl').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(stlBlob(currentMesh, captured.s.height));
  a.download = `texture-shell-${captured.s.kind}-${captured.s.seed}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

applyHash();
tick();
