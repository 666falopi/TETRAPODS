import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const DEFAULTS = {branching: 0.6, res: 5, seed: 7, part: 'white', dir: 'out', height: 12, level: 0.5, round: 1, thick: 3, smooth: 2, vary: 0.35, diameter: 60, lattice: true, cell: 10, wall: 3, depth: 9, crest: 1.6, stopAt: 3000, soften: 2};
const NUMS = ['branching', 'seed', 'height', 'level', 'round', 'thick', 'smooth', 'vary', 'diameter', 'cell', 'wall', 'depth', 'crest', 'stopAt', 'soften'];
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
  const s = {lattice: $('lattice').checked, res: +$('res').value, part: $('part').value, dir: $('dir').value};
  for (const id of NUMS) s[id] = +$(id).value;
  s.seed = Math.floor(s.seed) || 0; s.diameter = Math.min(500, Math.max(10, s.diameter || 10));
  return s;
}
function readouts(s) {
  for (const id of ['branching', 'height', 'level', 'round', 'thick', 'vary', 'cell', 'wall', 'depth', 'crest', 'stopAt', 'soften']) { const o = $(id).parentNode.querySelector(`label[for=${id}] output`); if (o) o.textContent = id === 'stopAt' || id === 'soften' ? $(id).value : (+$(id).value).toFixed(id === 'cell' || id === 'depth' ? 1 : 2); }
  const [F, K] = feedKill(s.branching);
  $('fk').textContent = `feed ${F.toFixed(4)} · kill ${K.toFixed(4)}`;
}

// ---------- viewer ----------
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch { stage.innerHTML = '<p class="nogl">WebGL is not available in this browser, so the 3D view cannot be shown. Turn on hardware acceleration.</p>'; }
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 8000), tilt = new THREE.Group(), pivot = new THREE.Group();
const cam = {yaw: 0.6, pitch: 0.25, dist: 200, bound: 30, dragging: false};
const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55, metalness: 0.05});
let geometry = null, mesh = null, geoLevel = -1, latticeMesh = null, latticeShown = false, latticeData = null;
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
const dark = [0.2, 0.15, 0.11], light = [0.95, 0.78, 0.52];
const dist = {margin: null, d: null, p: null, q: null};
let positions = null, volumeMm3 = 0, dirty = true, running = true, stepTarget = 0;
// Height profile (0..1) of the extruded part at every sphere vertex: threshold, distance to the outline,
// round cross-section, slow variation and smoothing.
function profile(s) {
  const {mesh: m, V} = sim, {n, dir} = m;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
  const k = hi - lo > 1e-4 ? 1 / (hi - lo) : 0, R = s.diameter / 2, {start, nb} = m;
  const sign = s.dir === 'out' ? 1 : -1, white = s.part === 'white';
  // Signed margin to the threshold: >= 0 inside the extruded part.
  const mg = dist.margin, d = dist.d;
  for (let i = 0; i < n; i++) { const t = (V[i] - lo) * k; mg[i] = white ? t - s.level : s.level - t; d[i] = Infinity; }
  // Distance (in mesh edges) from each inside vertex to the part's outline. Boundary vertices get the
  // sub-edge distance to where the threshold crosses; the rest is relaxed outwards-in.
  for (let i = 0; i < n; i++) {
    if (mg[i] < 0) continue;
    for (let q = start[i]; q < start[i + 1]; q++) { const j = nb[q]; if (mg[j] < 0) d[i] = Math.min(d[i], mg[i] / (mg[i] - mg[j])); }
  }
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (mg[i] < 0) continue;
      let best = d[i];
      for (let q = start[i]; q < start[i + 1]; q++) { const j = nb[q]; if (mg[j] >= 0 && d[j] + 1 < best) best = d[j] + 1; }
      if (best < d[i]) { d[i] = best; moved = true; }
    }
    if (!moved) break;
  }
  // Cross-section of the extruded part. Round: a circle of radius `thick` edges, so a thin ridge becomes a
  // low rounded strand and the tips taper off; a wide part gets a rounded edge and a plateau. Round = 0 is
  // the old vertical wall with a flat top.
  const P = dist.p, Q = dist.q, rc = Math.max(0.5, s.thick);
  for (let i = 0; i < n; i++) {
    if (mg[i] < 0 || s.part === 'none') { P[i] = 0; continue; }
    const x = Math.min(1, (d[i] === Infinity ? rc : d[i]) / rc), circ = Math.sqrt(Math.max(0, 1 - (1 - x) * (1 - x)));
    const w = Math.min(1, d[i] / 0.7), wall = w * w * (3 - 2 * w);
    P[i] = wall + (circ - wall) * s.round;
  }
  // Organic variation: a slow wobble on the sphere so strands rise to different heights.
  if (s.vary > 0) for (let i = 0; i < n; i++) {
    const x = dir[i * 3], y = dir[i * 3 + 1], z = dir[i * 3 + 2];
    P[i] *= 1 - s.vary * (0.5 - 0.5 * (Math.sin(x * 2.3 + 1) + Math.sin(y * 2.9 + 2) + Math.sin(z * 2.6 + 3)) / 3 * 1.6);
  }
  for (let it = 0; it < s.smooth; it++) {
    for (let i = 0; i < n; i++) { let a = 0; const c = start[i + 1] - start[i]; for (let q = start[i]; q < start[i + 1]; q++) a += P[nb[q]]; Q[i] = P[i] * 0.5 + a / c * 0.5; }
    P.set(Q);
  }
  return dist.p;
}
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
    for (const key of ['margin', 'd', 'p', 'q']) dist[key] = new Float32Array(n);
    if (mesh) pivot.remove(mesh);
    mesh = new THREE.Mesh(geometry, material); pivot.add(mesh);
  }
  const P = profile(s), R = s.diameter / 2, col = geometry.attributes.color.array, sign = s.dir === 'out' ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, P[i]), r = R + sign * s.height * p;
    positions[i * 3] = dir[i * 3] * r; positions[i * 3 + 1] = dir[i * 3 + 1] * r; positions[i * 3 + 2] = dir[i * 3 + 2] * r;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = dark[c] + (light[c] - dark[c]) * Math.min(1, 0.12 + 0.88 * p);
  }
  geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();
  mesh.visible = true; if (latticeMesh) latticeMesh.visible = false; latticeShown = false;
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

// ---------- Voronoi interior ----------
// The extruded part becomes a true volume: below its rounded crest the material is a 3D Voronoi web, so the
// "walls" are struts with open cells between them. A point is solid where it lies within `wall` of a cell
// boundary (second-nearest site distance minus nearest), between the lattice depth and the crest. Solid = the
// smallest of the signed distances (mm) of the shapes that are intersected; marching tetrahedra on the
// triangular prisms of the icosphere then extracts the surface (closed, as the outermost shells are empty).
function buildLattice(s) {
  const P = profile(s), {n, dir, index} = sim.mesh, R = s.diameter / 2, sign = s.dir === 'out' ? 1 : -1;
  const T = s.depth, hmax = s.part === 'none' ? 0 : s.height, rlo = R - T - (s.dir === 'in' ? hmax : 0), rhi = R + (s.dir === 'out' ? hmax : 0);
  const edge = 1.0515 * R / 2 ** s.res;
  let dr = edge * 0.85; if ((rhi - rlo + 2 * dr) / dr > 90) dr = (rhi - rlo + 2 * dr) / 90;
  // Start off the planes at R and R-depth so no shell lies exactly on a boundary (that makes zero-area triangles).
  const radii = []; for (let r = rlo - dr * 1.37; r <= rhi + dr * 1.001; r += dr) radii.push(r);
  const nl = radii.length, M = n * nl, c = Math.max(1, s.cell);
  // One jittered site per cell of a cubic grid: even-sized Voronoi cells.
  const E = rhi + 2 * c, G = Math.ceil(2 * E / c), sites = new Float32Array(G * G * G * 3), rand = rng(s.seed + 91);
  for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const o = ((z * G + y) * G + x) * 3;
    sites[o] = (x + 0.5 + (rand() - 0.5) * 0.9) * c - E; sites[o + 1] = (y + 0.5 + (rand() - 0.5) * 0.9) * c - E; sites[o + 2] = (z + 0.5 + (rand() - 0.5) * 0.9) * c - E;
  }
  const foam = (x, y, z) => {
    const cx = Math.floor((x + E) / c), cy = Math.floor((y + E) / c), cz = Math.floor((z + E) / c);
    let d1 = 1e9, d2 = 1e9;
    for (let k = Math.max(0, cz - 1); k <= Math.min(G - 1, cz + 1); k++) for (let j = Math.max(0, cy - 1); j <= Math.min(G - 1, cy + 1); j++) for (let i = Math.max(0, cx - 1); i <= Math.min(G - 1, cx + 1); i++) {
      const o = ((k * G + j) * G + i) * 3, dx = sites[o] - x, dy = sites[o + 1] - y, dz = sites[o + 2] - z, d = dx * dx + dy * dy + dz * dz;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return Math.sqrt(d2) - Math.sqrt(d1);
  };
  const layers = [];
  for (let k = 0; k < nl; k++) {
    const r = radii[k], f = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = Math.max(0, P[i]), top = R + sign * hmax * p, cr = s.crest * Math.min(1, p / 0.5);
      const fExtr = top - r, fDepth = r - (R - T), x = dir[i * 3] * r, y = dir[i * 3 + 1] * r, z = dir[i * 3 + 2] * r;
      let v = Math.min(fExtr, fDepth);
      if (v > -s.wall) { const fFoam = (s.wall - foam(x, y, z)) / 2, fCrest = r - (top - cr); v = Math.min(v, Math.max(fFoam, fCrest)); }
      f[i] = v;
    }
    layers.push(f);
  }
  // Soften the field (tangentially over mesh neighbours, radially between shells) so slivers and pits vanish
  // and the struts come out rounded. Strut thickness is kept by the iso level staying at 0.
  const {start, nb} = sim.mesh;
  for (let pass = 0; pass < s.soften; pass++) {
    const next = layers.map(f => new Float32Array(f));
    for (let k = 1; k < nl - 1; k++) {
      const f = layers[k], lo2 = layers[k - 1], hi2 = layers[k + 1], g = next[k];
      for (let i = 0; i < n; i++) {
        let sum = 0; const c = start[i + 1] - start[i];
        for (let q = start[i]; q < start[i + 1]; q++) sum += f[nb[q]];
        g[i] = f[i] * 0.4 + (sum / c) * 0.3 + (lo2[i] + hi2[i]) * 0.15;
      }
    }
    for (let k = 0; k < nl; k++) layers[k] = next[k];
  }
  const pos = [], idx = [], cache = new Map();
  const PP = (g, q) => { const k = (g / n) | 0, i = g - k * n; return dir[i * 3 + q] * radii[k]; };
  const cross = (g1, v1, g2, v2) => {
    const key = g1 < g2 ? g1 * M + g2 : g2 * M + g1;
    let id = cache.get(key);
    if (id === undefined) {
      const t = Math.min(0.999, Math.max(0.001, (0 - v1) / (v2 - v1)));
      for (let q = 0; q < 3; q++) pos.push(PP(g1, q) + (PP(g2, q) - PP(g1, q)) * t);
      id = pos.length / 3 - 1; cache.set(key, id);
    }
    return id;
  };
  // Orient each triangle by the field gradient of its tetrahedron: the normal points to falling value (out of the solid).
  const tri = (a, b, c2, gr) => {
    const A = a * 3, B = b * 3, C = c2 * 3;
    const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], vx = pos[C] - pos[A], vy = pos[C + 1] - pos[A + 1], vz = pos[C + 2] - pos[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * gr[0] + ny * gr[1] + nz * gr[2] > 0) idx.push(a, c2, b); else idx.push(a, b, c2);
  };
  const tet = (g0, g1, g2, g3, v0, v1, v2, v3) => {
    const g = [g0, g1, g2, g3], v = [v0, v1, v2, v3], ins = [], out = [];
    for (let q = 0; q < 4; q++) (v[q] >= 0 ? ins : out).push(q);
    if (!ins.length || !out.length) return;
    // Gradient of the linear field over the tetrahedron (Cramer's rule on the three edge vectors from vertex 0).
    const x0 = PP(g0, 0), y0 = PP(g0, 1), z0 = PP(g0, 2), E = [1, 2, 3].map(q => [PP(g[q], 0) - x0, PP(g[q], 1) - y0, PP(g[q], 2) - z0]), dv = [v1 - v0, v2 - v0, v3 - v0];
    const det3 = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const D = det3(E[0], E[1], E[2]);
    let gr;
    if (Math.abs(D) > 1e-12) {
      const col = (k, q) => E.map((e, r) => (r === k ? dv[r] : e[q]));
      gr = [0, 1, 2].map(q => {
        const m = [[E[0][0], E[0][1], E[0][2]], [E[1][0], E[1][1], E[1][2]], [E[2][0], E[2][1], E[2][2]]];
        for (let r = 0; r < 3; r++) m[r][q] = dv[r];
        return det3(m[0], m[1], m[2]) / D;
      });
    } else gr = [0, 0, 0];
    if (ins.length === 1 || out.length === 1) {
      const lone = ins.length === 1 ? ins[0] : out[0], rest = [0, 1, 2, 3].filter(q => q !== lone);
      const e = rest.map(q => cross(g[lone], v[lone], g[q], v[q]));
      tri(e[0], e[1], e[2], gr);
    } else {
      const [a, b] = ins, [c3, d] = out;
      const ac = cross(g[a], v[a], g[c3], v[c3]), ad = cross(g[a], v[a], g[d], v[d]), bd = cross(g[b], v[b], g[d], v[d]), bc = cross(g[b], v[b], g[c3], v[c3]);
      tri(ac, ad, bd, gr); tri(ac, bd, bc, gr);
    }
  };
  for (let f = 0; f < index.length; f += 3) {
    const t3 = [index[f], index[f + 1], index[f + 2]].sort((x, y) => x - y), p = t3[0], q = t3[1], r = t3[2];
    for (let k = 0; k < nl - 1; k++) {
      const a = layers[k], b = layers[k + 1];
      const p0 = a[p], q0 = a[q], r0 = a[r], p1 = b[p], q1 = b[q], r1 = b[r];
      if (Math.max(p0, q0, r0, p1, q1, r1) < 0 || Math.min(p0, q0, r0, p1, q1, r1) >= 0) continue;
      const o = k * n, o1 = (k + 1) * n;
      tet(o + p, o + q, o + r, o1 + r, p0, q0, r0, r1);
      tet(o + p, o + q, o1 + q, o1 + r, p0, q0, q1, r1);
      tet(o + p, o1 + p, o1 + q, o1 + r, p0, p1, q1, r1);
    }
  }
  return {pos: new Float32Array(pos), idx: new Uint32Array(idx), rlo, rhi};
}
function showLattice(s) {
  const t0 = performance.now(), L = buildLattice(s), {pos, idx} = L, nv = pos.length / 3, col = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), h = Math.min(1, Math.max(0, (r - L.rlo) / (L.rhi - L.rlo)));
    for (let c = 0; c < 3; c++) col[i * 3 + c] = dark[c] + (light[c] - dark[c]) * (0.1 + 0.9 * h);
  }
  let vol = 0;
  for (let q = 0; q < idx.length; q += 3) {
    const a = idx[q] * 3, b = idx[q + 1] * 3, c = idx[q + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  latticeData = {pos, idx};
  if (renderer) {
    if (latticeMesh) { pivot.remove(latticeMesh); latticeMesh.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    latticeMesh = new THREE.Mesh(g, material); pivot.add(latticeMesh);
    mesh.visible = false;
  }
  latticeShown = true;
  $('info').textContent = `Ø${(2 * L.rhi).toFixed(0)} MM · ${(vol / 6000).toFixed(1)} CM³ · ${(idx.length / 3).toLocaleString('en')} TRIANGLES · VORONOI LATTICE (${((performance.now() - t0) / 1000).toFixed(1)} S)`;
}

let latticeDue = 0;
function tick() {
  const s = readState();
  if (!sim.mesh) return;
  let changed = dirty;
  if (running || sim.steps < stepTarget) {
    const [F, K] = feedKill(s.branching), t0 = performance.now(), limit = Math.max(stepTarget, running ? Math.min(MAX_STEPS, s.stopAt) : 0);
    while (sim.steps < limit && performance.now() - t0 < 12) simStep(2, F, K);
    if (sim.steps >= Math.min(MAX_STEPS, s.stopAt) && sim.steps >= stepTarget) running = false;
    changed = true;
  }
  const wantLattice = s.lattice && !running && sim.steps >= stepTarget && s.part !== 'none';
  if (changed) {
    dirty = false;
    if (!(wantLattice && latticeShown && !running && sim.steps === lastLatticeStep)) surface();
    latticeDue = wantLattice ? performance.now() + 250 : 0;
    const st = $('steps'); st.textContent = `Step ${sim.steps.toLocaleString('en')}${running ? '' : wantLattice ? ' · building the Voronoi lattice…' : ' · paused'}`; $('run').textContent = running ? 'PAUSE ❚❚' : 'RUN ▶';
  }
  if (latticeDue && performance.now() >= latticeDue) {
    latticeDue = 0; lastLatticeStep = sim.steps;
    if (wantLattice) { showLattice(s); $('steps').textContent = `Step ${sim.steps.toLocaleString('en')} · Voronoi lattice`; }
  }
}
let lastLatticeStep = -1;

function surfacePositions() { return geometry.attributes.position.array; }
// ---------- STL ----------
function stlBlob() {
  const index = latticeShown ? latticeData.idx : sim.mesh.index, positions = latticeShown ? latticeData.pos : surfacePositions(), count = index.length / 3, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
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
// Keep every parameter in the address bar so the page can be shared as it is (debounced).
let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(JSON.stringify(urlData()))); } catch { /* ignore */ } }, 300);
}
const urlData = () => (running ? readState() : {...readState(), steps: sim.steps});
const live = () => { readouts(readState()); dirty = true; syncUrl(); };
for (const id of ['branching', 'part', 'dir', 'height', 'level', 'round', 'thick', 'smooth', 'vary', 'diameter', 'lattice', 'cell', 'wall', 'depth', 'crest', 'stopAt', 'soften']) $(id).addEventListener('input', live);
for (const id of ['res', 'seed']) $(id).addEventListener('input', () => { live(); restart(); });
$('dice').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); restart(); live(); });
$('restart').addEventListener('click', restart);
$('run').addEventListener('click', () => { running = !running && sim.steps < MAX_STEPS; dirty = true; setTimeout(syncUrl, 400); });
$('wire').addEventListener('input', () => { material.wireframe = $('wire').checked; });
$('resetView').addEventListener('click', () => { cam.yaw = 0.6; fitView(cam.bound); });
function setDefaults() { for (const [k, v] of Object.entries(DEFAULTS)) { if (typeof v === 'boolean') $(k).checked = v; else $(k).value = v; } }
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
    if (typeof d.lattice === 'boolean') $('lattice').checked = d.lattice;
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
