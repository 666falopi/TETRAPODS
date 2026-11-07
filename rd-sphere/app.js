import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const DEFAULTS = {branching: 0.5, res: 6, seed: 7, part: 'white', dir: 'out', height: 4, level: 0.5, soft: 0.3, diameter: 60};
const NUMS = ['branching', 'seed', 'height', 'level', 'soft', 'diameter'];
const MAX_STEPS = 30000;

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
function simReset(level, seed) {
  const m = meshCache[level] ||= icosphere(level), n = m.n;
  Object.assign(sim, {mesh: m, U: new Float32Array(n).fill(1), V: new Float32Array(n), U2: new Float32Array(n), V2: new Float32Array(n), steps: 0});
  const rand = rng(seed), blobs = Math.max(4, Math.round(n / 500));
  for (let b = 0; b < blobs; b++) {
    // A blob is a few rings of neighbours around a random point.
    let frontier = [Math.floor(rand() * n)];
    const depth = 1 + Math.floor(rand() * 3), seen = new Set(frontier);
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
function simStep(count, F, K) {
  const {n, start, nb} = sim.mesh, Du = 0.16 / 1.5, Dv = 0.08 / 1.5;
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
// Branching slider walks the (feed, kill) plane: isolated spots -> branching coral -> dense maze.
const FK = [[0.035, 0.065], [0.0545, 0.062], [0.029, 0.057]];
function feedKill(b) {
  const x = Math.min(1, Math.max(0, b)) * 2, i = x < 1 ? 0 : 1, t = x - i;
  return [FK[i][0] + (FK[i + 1][0] - FK[i][0]) * t, FK[i][1] + (FK[i + 1][1] - FK[i][1]) * t];
}

// ---------- state ----------
function readState() {
  const s = {res: +$('res').value, part: $('part').value, dir: $('dir').value};
  for (const id of NUMS) s[id] = +$(id).value;
  s.seed = Math.floor(s.seed) || 0; s.diameter = Math.min(500, Math.max(10, s.diameter || 10));
  return s;
}
function readouts(s) {
  for (const id of ['branching', 'height', 'level', 'soft']) { const o = $(id).parentNode.querySelector(`label[for=${id}] output`); if (o) o.textContent = (+$(id).value).toFixed(2); }
  const [F, K] = feedKill(s.branching);
  $('fk').textContent = `feed ${F.toFixed(4)} · kill ${K.toFixed(4)}`;
}
const smoothstep = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// ---------- viewer ----------
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch { stage.innerHTML = '<p class="nogl">WebGL is not available in this browser, so the 3D view cannot be shown. Turn on hardware acceleration.</p>'; }
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 8000), tilt = new THREE.Group(), pivot = new THREE.Group();
const cam = {yaw: 0.6, pitch: 0.25, dist: 200, bound: 30, dragging: false};
const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55, metalness: 0.05});
let geometry = null, mesh = null, geoLevel = -1;
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

// ---------- surface from the simulation ----------
const dark = [0.11, 0.115, 0.105], light = [0.85, 0.875, 0.82];
let positions = null, volumeMm3 = 0, dirty = true, running = true, stepTarget = 0;
function surface() {
  const s = readState(), {mesh: m, V} = sim, {n, dir, index} = m;
  if (geoLevel !== s.res || !geometry) {
    if (geometry) geometry.dispose();
    geometry = new THREE.BufferGeometry();
    positions = new Float32Array(n * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geoLevel = s.res;
    if (mesh) pivot.remove(mesh);
    mesh = new THREE.Mesh(geometry, material); pivot.add(mesh);
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
  const k = hi - lo > 1e-4 ? 1 / (hi - lo) : 0, R = s.diameter / 2, col = geometry.attributes.color.array, bw = Math.max(s.soft, 0.02) * 0.5;
  const sign = s.dir === 'out' ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const t = (V[i] - lo) * k, white = smoothstep((t - s.level) / bw * 0.5 + 0.5);
    const p = s.part === 'white' ? white : s.part === 'black' ? 1 - white : 0, r = R + sign * s.height * p;
    positions[i * 3] = dir[i * 3] * r; positions[i * 3 + 1] = dir[i * 3 + 1] * r; positions[i * 3 + 2] = dir[i * 3 + 2] * r;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = dark[c] + (light[c] - dark[c]) * white;
  }
  geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();
  let vol = 0;
  for (let q = 0; q < index.length; q += 3) {
    const a = index[q] * 3, b = index[q + 1] * 3, c = index[q + 2] * 3, P = positions;
    vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  volumeMm3 = vol / 6;
  const out = R + (s.dir === 'out' && s.part !== 'none' ? s.height : 0);
  if (Math.abs(out - cam.bound) > cam.bound * 0.25) fitView(out);
  $('info').textContent = `Ø${(2 * out).toFixed(0)} MM · ${(volumeMm3 / 1000).toFixed(1)} CM³ · ${(index.length / 3).toLocaleString('en')} TRIANGLES`;
  $('dims').textContent = `Base sphere Ø${s.diameter} mm · relief ${s.dir === 'out' ? 'up to' : 'down to'} ${s.height} mm`;
  material.wireframe = $('wire').checked;
}
function tick() {
  const s = readState();
  if (!sim.mesh) return;
  let changed = dirty;
  if (running || sim.steps < stepTarget) {
    const [F, K] = feedKill(s.branching), t0 = performance.now(), limit = Math.max(stepTarget, running ? MAX_STEPS : 0);
    while (sim.steps < limit && performance.now() - t0 < 12) simStep(2, F, K);
    if (sim.steps >= MAX_STEPS) running = false;
    changed = true;
  }
  if (changed) { dirty = false; surface(); const st = $('steps'); st.textContent = `Step ${sim.steps.toLocaleString('en')}${running ? '' : ' · paused'}`; $('run').textContent = running ? 'PAUSE ❚❚' : 'RUN ▶'; }
}

// ---------- STL ----------
function stlBlob() {
  const index = sim.mesh.index, count = index.length / 3, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  view.setUint32(80, count, true);
  let zmin = Infinity;
  for (let i = 0; i < positions.length; i += 3) zmin = Math.min(zmin, positions[i + 1]);
  // three.js is y-up, STL is z-up: (x, y, z) -> (x, -z, y), resting on z = 0.
  const P = i => [positions[i * 3], -positions[i * 3 + 2], positions[i * 3 + 1] - zmin];
  for (let t = 0; t < count; t++) {
    const a = P(index[t * 3]), b = P(index[t * 3 + 1]), c = P(index[t * 3 + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, q) => view.setFloat32(84 + t * 50 + q * 4, x, true));
  }
  return new Blob([buffer], {type: 'model/stl'});
}

// ---------- wiring ----------
function restart() { const s = readState(); simReset(s.res, s.seed); running = true; stepTarget = 0; dirty = true; }
const live = () => { readouts(readState()); dirty = true; };
for (const id of ['branching', 'part', 'dir', 'height', 'level', 'soft', 'diameter']) $(id).addEventListener('input', live);
for (const id of ['res', 'seed']) $(id).addEventListener('input', () => { live(); restart(); });
$('dice').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); restart(); live(); });
$('restart').addEventListener('click', restart);
$('run').addEventListener('click', () => { running = !running && sim.steps < MAX_STEPS; dirty = true; });
$('wire').addEventListener('input', () => { material.wireframe = $('wire').checked; });
$('resetView').addEventListener('click', () => { cam.yaw = 0.6; fitView(cam.bound); });
function setDefaults() { for (const [k, v] of Object.entries(DEFAULTS)) $(k).value = v; }
$('reset').addEventListener('click', () => { setDefaults(); restart(); live(); });
$('exportStl').addEventListener('click', () => {
  if (!positions) return;
  const a = document.createElement('a'), s = readState();
  a.href = URL.createObjectURL(stlBlob());
  a.download = `reaction-sphere-${s.part}-seed${s.seed}-${s.diameter}mm.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
// Share link: every control plus the step reached. Opening it replays the simulation to that step.
$('share').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + '#' + encodeURIComponent(JSON.stringify({...readState(), steps: sim.steps}));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); $('share').textContent = 'LINK COPIED ✓'; }
  catch { $('share').textContent = 'LINK IN ADDRESS BAR'; }
  setTimeout(() => { $('share').textContent = 'COPY SHARE LINK ⧉'; }, 1800);
});
function applyHash() {
  try {
    const d = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    for (const id of [...NUMS, 'res']) if (typeof d[id] === 'number') $(id).value = d[id];
    for (const id of ['part', 'dir']) if (typeof d[id] === 'string') $(id).value = d[id];
    if (typeof d.steps === 'number') stepTarget = Math.min(MAX_STEPS, Math.max(0, d.steps | 0));
  } catch { /* no hash */ }
}
window.__rdLoaded = true;
fitView(cam.bound);
setDefaults();
applyHash();
const wanted = stepTarget;
restart(); stepTarget = wanted;
if (wanted) running = false;
live();
window.__rd = {sim, simStep, feedKill, simReset, readState};
