import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const DEFAULTS = {branching: 0.5, pattern: 'spots', res: 5, seed: 7, seeds: 20, warm: 1500, layers: 24, interval: 40, taper: 0.2, part: 'white', dir: 'out', height: 18, level: 0.5, diameter: 50};
const NUMS = ['branching', 'seed', 'seeds', 'warm', 'layers', 'interval', 'taper', 'height', 'level', 'diameter'];
const PATTERNS = {spots: [0.035, 0.065], coral: [0.0545, 0.062], maze: [0.029, 0.057], worms: [0.078, 0.061]};

// ---------- sphere mesh ----------
// Icosphere: a subdivided icosahedron has near-uniform triangles all over the sphere, so the pattern is
// not stretched or pinched at the poles the way a latitude/longitude image would be.
function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < level; s++) {
    const cache = new Map(), mid = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = cache.get(key);
      if (m === undefined) { const p = v[a].map((c, k) => c + v[b][k]), l = Math.hypot(...p); m = v.push(p.map(c => c / l)) - 1; cache.set(key, m); }
      return m;
    };
    const next = [];
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = next;
  }
  const n = v.length, dir = new Float32Array(n * 3), index = new Uint32Array(f.length * 3);
  v.forEach((p, i) => dir.set(p, i * 3));
  f.forEach((q, i) => index.set(q, i * 3));
  // Neighbour lists in compressed form for the Laplacian.
  const sets = Array.from({length: n}, () => new Set());
  for (const [a, b, c] of f) { sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); }
  const start = new Uint32Array(n + 1), nb = new Uint32Array(f.length * 3 + 12 * 6);
  let k = 0;
  sets.forEach((s, i) => { start[i] = k; for (const j of s) nb[k++] = j; });
  start[n] = k;
  return {n, dir, index, start, nb};
}

// ---------- Gray-Scott on the mesh ----------
// Same dynamics as the flat texture generator. On a triangular lattice the plain neighbour sum is 1.5x a
// square grid's, so the diffusion rates are divided by 1.5 to keep the same feature scale.
const sim = {mesh: null, U: null, V: null, U2: null, V2: null, steps: 0};
function rng(seed) {
  let a = (seed + 1) * 2654435761 >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const meshCache = {};
function simReset(level, seed, blobs) {
  const m = meshCache[level] ||= icosphere(level), n = m.n;
  Object.assign(sim, {mesh: m, U: new Float32Array(n).fill(1), V: new Float32Array(n), U2: new Float32Array(n), V2: new Float32Array(n), steps: 0});
  const rand = rng(seed), depth = level >= 5 ? 3 : 2;
  for (let b = 0; b < blobs; b++) {
    // A seed is a few rings of neighbours around a random point.
    let frontier = [Math.floor(rand() * n)];
    const seen = new Set(frontier);
    for (let d = 0; d <= depth; d++) {
      const nextF = [];
      for (const i of frontier) {
        sim.U[i] = 0.5; sim.V[i] = 0.25 + rand() * 0.1;
        for (let k = m.start[i]; k < m.start[i + 1]; k++) { const j = m.nb[k]; if (!seen.has(j)) { seen.add(j); nextF.push(j); } }
      }
      frontier = nextF;
    }
  }
}
function simStep(count, F, K, ds = 1) {
  const {n, start, nb} = sim.mesh, Du = 0.16 / 1.5 * ds, Dv = 0.08 / 1.5 * ds;
  for (let s = 0; s < count; s++) {
    const {U, V, U2, V2} = sim;
    for (let i = 0; i < n; i++) {
      const a = start[i], b = start[i + 1];
      let su = 0, sv = 0;
      for (let k = a; k < b; k++) { const j = nb[k]; su += U[j]; sv += V[j]; }
      const deg = b - a, u = U[i], v = V[i], uvv = u * v * v;
      U2[i] = u + Du * (su - deg * u) - uvv + F * (1 - u);
      V2[i] = v + Dv * (sv - deg * v) + uvv - (F + K) * v;
    }
    sim.U = U2; sim.V = V2; sim.U2 = U; sim.V2 = V;
  }
  sim.steps += count;
}
// Branching = how fast the pattern's feature size shrinks as the shells move outward. A sphere's area grows
// with radius squared, so shrinking the diffusion rates by (R0/r)^(2*gamma) makes columns divide to fill it.
// gamma = 1 keeps the feature size constant in millimetres (the natural coral case); 0 is plain extrusion.
const gammaOf = b => 2 * b;
const diffusionScale = (b, R0, r) => Math.pow(R0 / r, 2 * gammaOf(b));

// ---------- state ----------
function readState() {
  const s = {res: +$('res').value, pattern: $('pattern').value, part: $('part').value, dir: $('dir').value};
  for (const id of NUMS) s[id] = +$(id).value;
  s.seed = Math.floor(s.seed) || 0; s.diameter = Math.min(500, Math.max(10, s.diameter || 10));
  return s;
}
function readouts(s) {
  for (const id of ['branching', 'height', 'level', 'taper']) { const o = $(id).parentNode.querySelector(`label[for=${id}] output`); if (o) o.textContent = (+$(id).value).toFixed(2); }
  $('fk').textContent = s.branching === 0 ? 'Feature size stays the same: plain extrusion.' : `Feature size shrinks to ${(100 * Math.pow(1 / (1 + s.height / (s.diameter / 2)), gammaOf(s.branching))).toFixed(0)}% by the outer shell, so columns divide about ${Math.pow(1 + s.height / (s.diameter / 2), 2 * gammaOf(s.branching)).toFixed(1)}× over.`;
}

// ---------- viewer ----------
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch { stage.innerHTML = '<p class="nogl">WebGL is not available in this browser, so the 3D view cannot be shown. Turn on hardware acceleration.</p>'; }
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 8000), tilt = new THREE.Group(), pivot = new THREE.Group();
const cam = {yaw: 0.6, pitch: 0.25, dist: 200, bound: 30, dragging: false};
const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55, metalness: 0.05});
let mesh = null;
const place = () => { camera.position.set(0, 0, cam.dist); camera.lookAt(0, 0, 0); };
const fitView = bound => { cam.bound = bound; cam.dist = bound * 4.6; cam.pitch = 0.25; place(); };
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x151615);
  stage.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  scene.add(tilt); tilt.add(pivot);
  const dom = renderer.domElement;
  dom.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  dom.addEventListener('pointerdown', e => { cam.dragging = true; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointerup', () => { cam.dragging = false; });
  dom.addEventListener('pointercancel', () => { cam.dragging = false; });
  dom.addEventListener('pointermove', e => { if (cam.dragging) { cam.yaw += e.movementX * 0.01; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + e.movementY * 0.01)); } });
  dom.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(cam.bound * 1.3, Math.min(cam.bound * 12, cam.dist * Math.exp(e.deltaY * 0.001))); place(); }, {passive: false});
  new ResizeObserver(() => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }).observe(stage);
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    if ($('auto').checked && !cam.dragging) cam.yaw += (now - last) / 1000 * 0.4;
    last = now; tilt.rotation.x = cam.pitch; pivot.rotation.y = cam.yaw;
    tick();
    renderer.render(scene, camera);
  });
}

// ---------- growth stack -> solid ----------
// Each layer outward from the core is a later snapshot of the pattern on the sphere, so time becomes radius:
// a spot that divides while the simulation runs becomes a column that forks on its way out. Layer 0 is the
// solid core, the last layer is empty. Between layers the values are joined by marching tetrahedra on the
// triangular prisms of the icosphere, which gives a smooth surface that may fork, overhang and fuse.
const snaps = [];
function snapshot() {
  const {V} = sim, n = V.length, out = new Uint8Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
  const k = hi - lo > 1e-4 ? 255 / (hi - lo) : 0;
  for (let i = 0; i < n; i++) out[i] = (V[i] - lo) * k;
  snaps.push(out);
}
function extract(s) {
  const {n, dir, index} = sim.mesh, L = Math.min(s.layers, snaps.length), iso = s.level * 255;
  const layers = [], R0 = s.diameter / 2, dr = s.height / (L + 1), radii = [];
  // Pattern value of shell k (white or black part), thinned a little more per shell so the tips get slender.
  const part = (a, k) => {
    const out = new Float32Array(n), off = 255 * s.taper * (k + 1) / L;
    for (let i = 0; i < n; i++) out[i] = (s.part === 'black' ? 255 - a[i] : a[i]) - off;
    return out;
  };
  const full = new Float32Array(n).fill(255), empty = new Float32Array(n);
  if (s.dir === 'out') {
    layers.push(full); for (let k = 0; k < L; k++) layers.push(part(snaps[k], k)); layers.push(empty);
    for (let k = 0; k <= L + 1; k++) radii.push(R0 + k * dr);
  } else {
    // Carving inwards: pattern at the surface, the core below. Solid = what is not pattern.
    layers.push(full); for (let k = L - 1; k >= 0; k--) layers.push(part(snaps[k], k).map(v => 255 - v)); layers.push(empty);
    for (let k = 0; k <= L + 1; k++) radii.push(R0 - (L + 1 - k) * dr);
  }
  const nl = layers.length, M = n * nl, pos = [], idx = [], cache = new Map();
  const P = (g, c) => { const k = (g / n) | 0, i = g - k * n; return dir[i * 3 + c] * radii[k]; };
  const cross = (g1, v1, g2, v2) => {
    const key = g1 < g2 ? g1 * M + g2 : g2 * M + g1;
    let id = cache.get(key);
    if (id === undefined) {
      const t = (iso - v1) / (v2 - v1);
      for (let c = 0; c < 3; c++) pos.push(P(g1, c) + (P(g2, c) - P(g1, c)) * t);
      id = pos.length / 3 - 1; cache.set(key, id);
    }
    return id;
  };
  const tri = (a, b, c, inG) => {
    // Orient so that the normal points away from the inside (value >= iso).
    const A = a * 3, B = b * 3, C = c * 3;
    const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], vx = pos[C] - pos[A], vy = pos[C + 1] - pos[A + 1], vz = pos[C + 2] - pos[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let cx = 0, cy = 0, cz = 0;
    for (const g of inG) { cx += P(g, 0); cy += P(g, 1); cz += P(g, 2); }
    cx /= inG.length; cy /= inG.length; cz /= inG.length;
    const mx = (pos[A] + pos[B] + pos[C]) / 3, my = (pos[A + 1] + pos[B + 1] + pos[C + 1]) / 3, mz = (pos[A + 2] + pos[B + 2] + pos[C + 2]) / 3;
    if (nx * (cx - mx) + ny * (cy - my) + nz * (cz - mz) > 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const tet = (g0, g1, g2, g3, v0, v1, v2, v3) => {
    const g = [g0, g1, g2, g3], v = [v0, v1, v2, v3], ins = [], out = [];
    for (let q = 0; q < 4; q++) (v[q] >= iso ? ins : out).push(q);
    if (!ins.length || !out.length) return;
    const inG = ins.map(q => g[q]);
    if (ins.length === 1 || out.length === 1) {
      const lone = ins.length === 1 ? ins[0] : out[0], rest = [0, 1, 2, 3].filter(q => q !== lone);
      const e = rest.map(q => cross(g[lone], v[lone], g[q], v[q]));
      tri(e[0], e[1], e[2], inG);
    } else {
      const [a, b] = ins, [c, d] = out;
      const ac = cross(g[a], v[a], g[c], v[c]), ad = cross(g[a], v[a], g[d], v[d]), bd = cross(g[b], v[b], g[d], v[d]), bc = cross(g[b], v[b], g[c], v[c]);
      tri(ac, ad, bd, inG); tri(ac, bd, bc, inG);
    }
  };
  for (let f = 0; f < index.length; f += 3) {
    const t3 = [index[f], index[f + 1], index[f + 2]].sort((x, y) => x - y), p = t3[0], q = t3[1], r = t3[2];
    for (let k = 0; k < nl - 1; k++) {
      const a = layers[k], b = layers[k + 1];
      const p0 = a[p], q0 = a[q], r0 = a[r], p1 = b[p], q1 = b[q], r1 = b[r];
      const mn = Math.min(p0, q0, r0, p1, q1, r1), mx = Math.max(p0, q0, r0, p1, q1, r1);
      if (mx < iso || mn >= iso) continue;
      const o = k * n, o1 = (k + 1) * n;
      tet(o + p, o + q, o + r, o1 + r, p0, q0, r0, r1);
      tet(o + p, o + q, o1 + q, o1 + r, p0, q0, q1, r1);
      tet(o + p, o1 + p, o1 + q, o1 + r, p0, p1, q1, r1);
    }
  }
  return {pos: new Float32Array(pos), idx: new Uint32Array(idx), R0, top: radii[radii.length - 1], bottom: radii[0]};
}

const dark = [0.2, 0.17, 0.15], light = [0.93, 0.9, 0.82];
let solid = null, volumeMm3 = 0, dirty = true, paused = false, lastBuild = 0;
function surface() {
  const s = readState();
  solid = extract(s);
  const {pos, idx} = solid, nv = pos.length / 3, col = new Float32Array(nv * 3);
  let rmin = Infinity, rmax = -Infinity, r = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { r[i] = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); rmin = Math.min(rmin, r[i]); rmax = Math.max(rmax, r[i]); }
  for (let i = 0; i < nv; i++) {
    const h = rmax > rmin ? (r[i] - rmin) / (rmax - rmin) : 0, t = s.dir === 'out' ? h : 1 - h;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = dark[c] + (light[c] - dark[c]) * (0.15 + 0.85 * t);
  }
  let vol = 0;
  for (let q = 0; q < idx.length; q += 3) {
    const a = idx[q] * 3, b = idx[q + 1] * 3, c = idx[q + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  volumeMm3 = vol / 6;
  if (renderer) {
    if (mesh) { pivot.remove(mesh); mesh.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    mesh = new THREE.Mesh(g, material); pivot.add(mesh);
    material.wireframe = $('wire').checked;
  }
  const out = Math.max(solid.top, solid.R0);
  if (Math.abs(out - cam.bound) > cam.bound * 0.15) fitView(out);
  $('info').textContent = `Ø${(2 * out).toFixed(0)} MM · ${(volumeMm3 / 1000).toFixed(1)} CM³ · ${(idx.length / 3).toLocaleString('en')} TRIANGLES`;
  $('dims').textContent = `Core Ø${s.diameter} mm · growth ${s.dir === 'out' ? 'outwards' : 'inwards'} ${s.height} mm over ${Math.min(s.layers, snaps.length)} layers`;
}
function tick() {
  if (!sim.mesh) return;
  const s = readState(), [F, K] = PATTERNS[s.pattern] || PATTERNS.maze;
  let changed = false, phase = '';
  if (!paused && snaps.length < s.layers) {
    const t0 = performance.now();
    if (sim.steps < s.warm && snaps.length === 0) {
      // Core: grow the plain pattern first so shell 1 starts from a developed texture.
      while (sim.steps < s.warm && performance.now() - t0 < 12) simStep(Math.min(5, s.warm - sim.steps), F, K);
      phase = `Growing the core pattern · step ${sim.steps} of ${s.warm}`;
      if (sim.steps >= s.warm) { snapshot(); changed = true; }
    } else {
      // One shell per frame: grow `interval` steps at this radius' diffusion, then record it.
      const r = s.diameter / 2 + s.height * snaps.length / Math.max(1, s.layers - 1);
      if (snaps.length === 0) snapshot(); else simStep(s.interval, F, K, diffusionScale(s.branching, s.diameter / 2, r)), snapshot();
      changed = true;
    }
  }
  if (dirty || changed) {
    const now = performance.now();
    if (now - lastBuild > 250 || (!changed && dirty)) { lastBuild = now; dirty = false; if (snaps.length) surface(); }
    else dirty = true;
  }
  const grown = snaps.length >= s.layers;
  $('steps').textContent = phase || `Shell ${Math.min(snaps.length, s.layers)} of ${s.layers} · step ${sim.steps.toLocaleString('en')}${grown ? ' · fully grown' : paused ? ' · paused' : ''}`;
  $('run').textContent = grown ? 'GROWN ✓' : paused ? 'GROW ▶' : 'PAUSE ❚❚';
}

// ---------- STL ----------
function stlBlob() {
  const {pos, idx} = solid, count = idx.length / 3, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  view.setUint32(80, count, true);
  let zmin = Infinity;
  for (let i = 0; i < pos.length; i += 3) zmin = Math.min(zmin, pos[i + 1]);
  // three.js is y-up, STL is z-up: (x, y, z) -> (x, -z, y), resting on z = 0.
  const P = i => [pos[i * 3], -pos[i * 3 + 2], pos[i * 3 + 1] - zmin];
  for (let t = 0; t < count; t++) {
    const a = P(idx[t * 3]), b = P(idx[t * 3 + 1]), c = P(idx[t * 3 + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, q) => view.setFloat32(84 + t * 50 + q * 4, x, true));
  }
  return new Blob([buffer], {type: 'model/stl'});
}

// ---------- wiring ----------
function restart() { const s = readState(); simReset(s.res, s.seed, s.seeds); snaps.length = 0; paused = false; dirty = true; }
// Keep every parameter in the address bar so the page can be shared as it is (debounced).
let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(JSON.stringify(urlData()))); } catch { /* ignore */ } }, 300);
}
const urlData = () => readState();
const live = () => { readouts(readState()); dirty = true; syncUrl(); };
// These change the growth itself, so the stack is grown again from the core.
for (const id of ['branching', 'pattern', 'seeds', 'warm', 'interval', 'res', 'seed']) $(id).addEventListener('input', () => { restart(); live(); });
for (const id of ['part', 'dir', 'height', 'level', 'taper', 'diameter', 'layers']) $(id).addEventListener('input', live);
$('dice').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); restart(); live(); });
$('restart').addEventListener('click', () => { restart(); live(); });
$('run').addEventListener('click', () => { paused = !paused; dirty = true; });
$('wire').addEventListener('input', () => { material.wireframe = $('wire').checked; });
$('resetView').addEventListener('click', () => { cam.yaw = 0.6; fitView(cam.bound); });
function setDefaults() { for (const [k, v] of Object.entries(DEFAULTS)) $(k).value = v; }
$('reset').addEventListener('click', () => { setDefaults(); restart(); live(); });
$('exportStl').addEventListener('click', () => {
  if (!solid) return;
  const a = document.createElement('a'), s = readState();
  a.href = URL.createObjectURL(stlBlob());
  a.download = `reaction-coral-${s.part}-seed${s.seed}-${s.diameter}mm.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
// Share link: every control. Opening it grows the same stack again from the same seed.
$('share').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + '#' + encodeURIComponent(JSON.stringify(readState()));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); $('share').textContent = 'LINK COPIED ✓'; }
  catch { $('share').textContent = 'LINK IN ADDRESS BAR'; }
  setTimeout(() => { $('share').textContent = 'COPY SHARE LINK ⧉'; }, 1800);
});
function applyHash() {
  try {
    const d = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    for (const id of [...NUMS, 'res']) if (typeof d[id] === 'number') $(id).value = d[id];
    for (const id of ['part', 'dir', 'pattern']) if (typeof d[id] === 'string') $(id).value = d[id];
  } catch { /* no hash */ }
}
window.__rdLoaded = true;
fitView(cam.bound);
setDefaults();
applyHash();
restart();
live();
