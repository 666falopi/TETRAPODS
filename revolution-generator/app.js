import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

// A profile point is {x, y, s}: x = radius in mm (>= 0), y = height in mm, s = smooth (true) or corner (false).
const PRESETS = {
  vase: ['Vase', [[6, 0, 0], [14, 0, 1], [22, 14, 1], [12, 34, 1], [9, 46, 1], [15, 60, 0]]],
  goblet: ['Goblet', [[0, 0, 0], [16, 0, 0], [16, 3, 1], [3, 8, 1], [3, 30, 1], [10, 36, 1], [22, 50, 1], [22, 60, 0]]],
  bowl: ['Bowl', [[0, 0, 0], [12, 0, 0], [22, 8, 1], [25, 22, 1], [25, 30, 0]]],
  bead: ['Bead', [[0, 0, 0], [10, 6, 1], [20, 30, 1], [10, 54, 1], [0, 60, 0]]],
  pawn: ['Chess pawn', [[0, 0, 0], [17, 0, 0], [17, 4, 0], [11, 8, 1], [6, 22, 1], [10, 34, 0], [10, 36, 0], [6, 38, 1], [10, 48, 1], [6, 58, 1], [0, 60, 0]]],
  cone: ['Cone', [[0, 0, 0], [25, 0, 0], [0, 60, 0]]],
  cylinder: ['Cylinder', [[0, 0, 0], [20, 0, 0], [20, 60, 0], [0, 60, 0]]],
};
const DEFAULTS = {height: 60, radius: 25, around: 96, curve: 14, wall: 0, preset: 'vase'};
const TEX_DEFAULTS = {texKind: 'none', texScale: 6, texDetail: 4, texDepth: 1.5, texDir: 'out', texContrast: 1, texLevel: 0.5, texBevel: 1, texRd: 'coral', texSteps: 2500, texSeed: 1, texFlat: false};
const TEX_NUMS = ['texScale', 'texDetail', 'texDepth', 'texContrast', 'texLevel', 'texBevel', 'texSteps', 'texSeed'];
const presetPts = key => PRESETS[key][1].map(([x, y, s]) => ({x, y, s: !!s}));
for (const [k, [name]] of Object.entries(PRESETS)) $('preset').add(new Option(name, k));

let pts = presetPts(DEFAULTS.preset), sel = -1, undoStack = [];
const num = (id, lo, hi) => Math.min(hi, Math.max(lo, +$(id).value || lo));
const state = () => ({height: num('height', 1, 1000), radius: num('radius', 1, 500), around: +$('around').value, curve: +$('curve').value, wall: +$('wall').value,
  texKind: $('texKind').value, texDir: $('texDir').value, texRd: $('texRd').value, texFlat: $('texFlat').checked, ...Object.fromEntries(TEX_NUMS.map(id => [id, +$(id).value]))});

// ---------- surface texture (same patterns as the texture generator) ----------
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

function patternHeight(kind, u, v, s) {
  switch (kind) {
    case 'ripples': return ripples(u, v, s.scale, s.detail, s.seed);
    case 'ridged': return fbm(u, v, s.scale, s.detail, s.seed, true);
    case 'cells': return cells(u, v, s.scale, s.seed);
    case 'stripes': return (Math.sin((v + (fbm(u, v, s.scale, s.detail, s.seed) - 0.5) * 0.3) * s.scale * Math.PI * 2) + 1) / 2;
    case 'grain': return valueNoise(u * s.scale * 32, v * s.scale * 32, s.scale * 32, s.seed);
    default: return fbm(u, v, s.scale, s.detail, s.seed, false);
  }
}

// Gray-Scott on a flat grid that wraps around (u) and is open along the profile (v), as in the texture generator.
const rdCache = {key: '', nx: 0, ny: 0, V: null};
const RD_PRESETS = {coral: [0.0545, 0.062], maze: [0.029, 0.057], spots: [0.035, 0.065], worms: [0.078, 0.061]};
function rdField(nx, ny, preset, steps, seed) {
  const key = [nx, ny, preset, steps, seed].join();
  if (rdCache.key === key) return rdCache;
  const [F, K] = RD_PRESETS[preset] || RD_PRESETS.coral, n = nx * ny;
  let U = new Float32Array(n).fill(1), V = new Float32Array(n), U2 = new Float32Array(n), V2 = new Float32Array(n);
  const rand = rng(seed), blobs = Math.max(8, Math.round(n / 450));
  for (let b = 0; b < blobs; b++) {
    const cx = Math.floor(rand() * nx), cy = Math.floor(rand() * ny), r = 2 + Math.floor(rand() * 4);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const yy = cy + y; if (x * x + y * y > r * r || yy < 0 || yy >= ny) continue;
      const i = yy * nx + wrap(cx + x, nx); U[i] = 0.5; V[i] = 0.25 + rand() * 0.1;
    }
  }
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < ny; y++) {
      const row = y * nx, up = (y ? y - 1 : 0) * nx, dn = (y + 1 < ny ? y + 1 : ny - 1) * nx;
      for (let x = 0; x < nx; x++) {
        const l = x ? x - 1 : nx - 1, r = x + 1 < nx ? x + 1 : 0, i = row + x, u = U[i], v = V[i], uvv = u * v * v;
        U2[i] = u + 0.16 * (U[row + l] + U[row + r] + U[up + x] + U[dn + x] - 4 * u) - uvv + F * (1 - u);
        V2[i] = v + 0.08 * (V[row + l] + V[row + r] + V[up + x] + V[dn + x] - 4 * v) + uvv - (F + K) * v;
      }
    }
    [U, U2] = [U2, U]; [V, V2] = [V2, V];
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
  const k = hi - lo > 1e-4 ? 1 / (hi - lo) : 0;
  for (let i = 0; i < n; i++) V[i] = (V[i] - lo) * k;
  Object.assign(rdCache, {key, nx, ny, V});
  return rdCache;
}
function rdSample(f, u, v) {
  const {nx, ny, V} = f, fx = u * nx - 0.5, fy = Math.min(ny - 1, Math.max(0, v * nx - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, y1 = Math.min(ny - 1, y0 + 1);
  const c0 = wrap(x0, nx), c1 = wrap(x0 + 1, nx), top = V[y0 * nx + c0] + (V[y0 * nx + c1] - V[y0 * nx + c0]) * tx, bot = V[y1 * nx + c0] + (V[y1 * nx + c1] - V[y1 * nx + c0]) * tx;
  return top + (bot - top) * ty;
}
function rng(seed) {
  let a = (seed + 1) * 2654435761 >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- profile curve ----------
// Hermite spans between points. A smooth point takes a Catmull-Rom tangent; a corner has none, so two
// corners give a straight line and a corner next to a smooth point gives a curve that leaves it cleanly.
function sample(points, detail) {
  const n = points.length, out = [];
  if (n < 2) return points.map(p => [p.x, p.y]);
  const tan = i => {
    const p = points[i];
    if (!p.s) return [0, 0];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)], k = (i === 0 || i === n - 1) ? 1 : 0.5;
    return [(b.x - a.x) * k, (b.y - a.y) * k];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i], p1 = points[i + 1], m0 = tan(i), m1 = tan(i + 1), steps = p0.s || p1.s ? detail : 1;
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([Math.max(0, h00 * p0.x + h10 * m0[0] + h01 * p1.x + h11 * m1[0]), h00 * p0.y + h10 * m0[1] + h01 * p1.y + h11 * m1[1]]);
    }
  }
  const last = points[n - 1];
  out.push([last.x, last.y]);
  return out;
}

// Closed (r, z) outline of the solid. Solid: the curve plus drops to the axis. Hollow: the curve and a copy
// offset towards the axis, joined at both ends.
function outline(path, wall) {
  const clean = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1e-6).map(p => [p[0], p[1], 1]);   // third entry 1 = on the drawn curve
  if (clean.length < 2) return [];
  if (wall <= 0) {
    const a = clean[0], b = clean[clean.length - 1];
    return [...clean, [0, b[1]], [0, a[1]]];
  }
  const n = clean.length, nr = clean.map((p, i) => {
    const a = clean[Math.max(0, i - 1)], b = clean[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  });
  const side = nr.reduce((s, v) => s + v[0], 0) <= 0 ? 1 : -1;
  const inner = clean.map((p, i) => [Math.max(0, p[0] + side * nr[i][0] * wall), p[1] + side * nr[i][1] * wall]);
  return [...clean, ...inner.reverse()];
}

// ---------- mesh ----------
// Every profile edge becomes a strip of rings around the axis. Edges on the drawn curve are cut into pieces about
// one texture cell long and every ring point is pushed along the surface normal by depth * texture(u, v), where u
// runs once around the axis and v is the distance along the curve, in the same units, so cells stay square at the
// widest part. The pattern fades to nothing at sharp corners and where the surface faces up or down.
function buildMesh(s) {
  const poly = outline(sample(pts, s.curve), s.wall).filter((p, i, a) => Math.hypot(p[0] - a[(i + 1) % a.length][0], p[1] - a[(i + 1) % a.length][1]) > 1e-6);
  if (poly.length < 3) return null;
  const m = poly.length;
  let area = 0;
  for (let i = 0; i < m; i++) { const a = poly[i], b = poly[(i + 1) % m]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area >= 0 ? 1 : -1;
  // Outward unit normal of every edge in (r, z).
  const en = poly.map((a, i) => { const b = poly[(i + 1) % m], dr = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dr, dz) || 1; return [sgn * dz / l, -sgn * dr / l]; });
  // Vertex normal: average neighbouring edges unless they meet at a sharp angle.
  const vn = (i, e) => { // normal at start (e = i) of edge i
    const a = en[(i + m - 1) % m], b = en[i];
    return a[0] * b[0] + a[1] * b[1] > 0.62 ? norm2([a[0] + b[0], a[1] + b[1]]) : en[e];
  };
  const maxR = Math.max(...poly.map(p => p[0])), C0 = 2 * Math.PI * Math.max(maxR, 1e-3), N_ = s.around, cell = C0 / N_;
  const texOn = s.texKind !== 'none' && s.texDepth > 0, sign = s.texDir === 'in' ? -1 : 1;
  // Edge table with arc length along the drawn curve.
  const E = []; let arc = 0;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m], len = Math.hypot(b[0] - a[0], b[1] - a[1]), onAxis = a[0] < 1e-6 && b[0] < 1e-6;
    E.push({a, b, len, arc0: arc, onAxis, tex: texOn && a[2] === 1 && b[2] === 1 && !onAxis, na: vn(i, i), nb: vn((i + 1) % m, i)});
    if (a[2] === 1 && b[2] === 1) arc += len;
  }
  for (let i = 0; i < m; i++) {   // does the texture carry on smoothly across each end of the edge?
    const p = E[(i + m - 1) % m], q = E[(i + 1) % m], n = en[i];
    E[i].joinA = p.tex && E[i].tex && p.na !== undefined && en[(i + m - 1) % m][0] * n[0] + en[(i + m - 1) % m][1] * n[1] > 0.62;
    E[i].joinB = q.tex && E[i].tex && en[(i + 1) % m][0] * n[0] + en[(i + 1) % m][1] * n[1] > 0.62;
  }
  // Pattern function: pattern -> contrast -> level / bevel, like the texture generator's height field.
  let rdf = null;
  if (texOn && s.texKind === 'reaction') { const nx = 192, ny = Math.max(64, Math.ceil(arc / C0 * nx / 64) * 64); rdf = rdField(nx, ny, s.texRd, s.texSteps, s.texSeed); }
  const bw = Math.max(s.texBevel, 0.02), ps = {scale: s.texScale, detail: s.texDetail, seed: s.texSeed};
  const hfun = (u, v) => {
    let h = rdf ? rdSample(rdf, u, v) : patternHeight(s.texKind, u, v, ps);
    h = Math.min(1, Math.max(0, (h - 0.5) * s.texContrast + 0.5));
    if (s.texBevel < 1) { const q = Math.min(1, Math.max(0, (h - s.texLevel) / bw + 0.5)); h = q * q * (3 - 2 * q); }
    return h;
  };
  const du = 1 / N_, dv = cell / C0, P = [], N = [];
  const ringPos = [], ringNrm = [];   // per edge: array of rings, each Float32Array(3 * N_)
  for (let i = 0; i < m; i++) {
    const e = E[i];
    if (e.onAxis) { ringPos.push(null); ringNrm.push(null); continue; }
    const sub = e.tex ? Math.max(1, Math.ceil(e.len / cell)) : 1, te = [(e.b[0] - e.a[0]) / (e.len || 1), (e.b[1] - e.a[1]) / (e.len || 1)];
    const rp = [], rn = [];
    for (let k = 0; k <= sub; k++) {
      const tt = k / sub, p0 = e.a[0] + (e.b[0] - e.a[0]) * tt, p1 = e.a[1] + (e.b[1] - e.a[1]) * tt;
      const n = k === 0 ? e.na : k === sub ? e.nb : norm2([e.na[0] + (e.nb[0] - e.na[0]) * tt, e.na[1] + (e.nb[1] - e.na[1]) * tt]);
      let w = 0;
      if (e.tex) {
        w = s.texFlat ? 1 : smooth01(0.2, 0.6, Math.abs(n[0]));
        if (!e.joinA) w *= Math.min(1, tt * e.len / (2 * cell));
        if (!e.joinB) w *= Math.min(1, (1 - tt) * e.len / (2 * cell));
      }
      const v = (e.arc0 + tt * e.len) / C0, pos = new Float32Array(N_ * 3), nm = new Float32Array(N_ * 3);
      for (let j = 0; j < N_; j++) {
        const th = j / N_ * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), u = j / N_;
        let dd = 0, nx = n[0] * c, ny = n[1], nz = n[0] * sn;
        if (w > 0) {
          const amp = sign * s.texDepth * w;
          dd = amp * hfun(u, v);
          const gu = amp * (hfun(u + du, v) - hfun(u - du, v)) / (2 * du * 2 * Math.PI * Math.max(p0, 0.05)), gv = amp * (hfun(u, v + dv) - hfun(u, v - dv)) / (2 * dv * C0);
          nx -= gu * -sn + gv * te[0] * c; ny -= gv * te[1]; nz -= gu * c + gv * te[0] * sn;
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        }
        const r = p0 + n[0] * dd;
        pos[j * 3] = r * c; pos[j * 3 + 1] = p1 + n[1] * dd; pos[j * 3 + 2] = r * sn;
        nm[j * 3] = nx; nm[j * 3 + 1] = ny; nm[j * 3 + 2] = nz;
      }
      rp.push(pos); rn.push(nm);
    }
    ringPos.push(rp); ringNrm.push(rn);
  }
  for (let i = 0; i < m; i++) {
    if (!ringPos[i]) continue;
    const rp = ringPos[i], rn = ringNrm[i];
    for (let k = 0; k < rp.length - 1; k++) for (let j = 0; j < N_; j++) {
      const j1 = (j + 1) % N_, v = (ring, jj, nrm) => [[ring[jj * 3], ring[jj * 3 + 1], ring[jj * 3 + 2]], [nrm[jj * 3], nrm[jj * 3 + 1], nrm[jj * 3 + 2]]];
      const A0 = v(rp[k], j, rn[k]), A1 = v(rp[k], j1, rn[k]), B0 = v(rp[k + 1], j, rn[k + 1]), B1 = v(rp[k + 1], j1, rn[k + 1]);
      const tri = (x, y, z) => { if (area2(x[0], y[0], z[0]) > 1e-12) for (const q of [x, y, z]) { P.push(...q[0]); N.push(...q[1]); } };
      tri(A0, A1, B1); tri(A0, B1, B0);
    }
  }
  // Make winding agree with the outward normals (positive signed volume).
  let vol = 0;
  for (let i = 0; i < P.length; i += 9) {
    vol += (P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) - P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) + P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6])) / 6;
  }
  if (vol < 0) for (let i = 0; i < P.length; i += 9) for (let k = 0; k < 3; k++) {
    for (const arr of [P, N]) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  return {geometry, triangles: P.length / 9, volume: Math.abs(vol), maxR: maxR + (texOn && sign > 0 ? s.texDepth : 0), poly};
}
const norm2 = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
function area2(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}

// Binary STL in millimetres, z up along the axis of revolution.
function stlBlob(geometry) {
  const pos = geometry.attributes.position.array, count = pos.length / 9, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  view.setUint32(80, count, true);
  const p = i => [pos[i], -pos[i + 2], pos[i + 1]];
  for (let t = 0; t < count; t++) {
    const a = p(t * 9), b = p(t * 9 + 3), c = p(t * 9 + 6);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, q) => view.setFloat32(84 + t * 50 + q * 4, x, true));
  }
  return new Blob([buffer], {type: 'model/stl'});
}

// ---------- profile editor ----------
const svg = $('editor');
const niceGrid = r => [1, 2, 5, 10, 20, 25, 50, 100].find(x => r / x <= 12) ?? 100;
let view = {x0: 0, y0: 0, w: 1, h: 1, grid: 5};
function pushUndo() { undoStack.push(JSON.stringify(pts)); if (undoStack.length > 100) undoStack.shift(); }
const el = (name, attrs, parent = svg) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };

function drawEditor() {
  const s = state(), pad = Math.max(s.height, s.radius * 2) * 0.07;
  // The viewBox shows the mirrored cross-section: x from -radius to +radius, y flipped so up is up.
  view = {x0: -s.radius - pad, y0: -s.height - pad, w: s.radius * 2 + pad * 2, h: s.height + pad * 2, grid: niceGrid(Math.max(s.height, s.radius * 2))};
  svg.setAttribute('viewBox', `${view.x0} ${view.y0} ${view.w} ${view.h}`);
  svg.replaceChildren();
  $('gridValue').textContent = view.grid + ' mm';
  const g = view.grid, font = pad * 0.45;
  for (let x = -Math.floor(s.radius / g) * g; x <= s.radius + 1e-6; x += g) el('line', {class: 'grid', x1: x, x2: x, y1: -s.height, y2: 0});
  for (let y = 0; y <= s.height + 1e-6; y += g) el('line', {class: 'grid', x1: -s.radius, x2: s.radius, y1: -y, y2: -y});
  for (let y = 0; y <= s.height + 1e-6; y += g * 2) { const t = el('text', {x: s.radius + pad * 0.2, y: -y + font * 0.3, 'font-size': font}); t.textContent = y; }
  for (let x = 0; x <= s.radius + 1e-6; x += g * 2) { const t = el('text', {x, y: pad * 0.75, 'font-size': font, 'text-anchor': 'middle'}); t.textContent = x; }
  el('line', {class: 'axis', x1: 0, x2: 0, y1: -s.height - pad * 0.6, y2: pad * 0.2});
  const path = sample(pts, 16), d = (sign) => path.map((p, i) => `${i ? 'L' : 'M'}${sign * p[0]},${-p[1]}`).join('');
  if (path.length > 1) {
    el('path', {class: 'fill', d: d(1) + `L0,${-path[path.length - 1][1]}L0,${-path[0][1]}Z`});
    el('path', {class: 'ghost', d: d(-1)});
    el('path', {class: 'curve', d: d(1)});
  }
  const ctm = svg.getScreenCTM(), r = ctm && ctm.a ? 5 / ctm.a : pad * 0.2;
  pts.forEach((p, i) => {
    if (p.s) el('circle', {class: 'pt' + (i === sel ? ' sel' : ''), cx: p.x, cy: -p.y, r});
    else el('rect', {class: 'pt' + (i === sel ? ' sel' : ''), x: p.x - r, y: -p.y - r, width: r * 2, height: r * 2});
  });
  $('del').disabled = sel < 0;
  $('smooth').disabled = sel < 0;
}

const toWorld = e => {
  const ctm = svg.getScreenCTM(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return {x: p.x, y: -p.y, px: 1 / ctm.a};
};
const snapV = v => $('snap').checked ? Math.round(v / (view.grid / 2)) * (view.grid / 2) : Math.round(v * 10) / 10;
const clampPt = (x, y) => { const s = state(); return [Math.min(s.radius, Math.max(0, snapV(Math.abs(x)))), Math.min(s.height, Math.max(0, snapV(y)))]; };
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
let drag = -1, dragMoved = false;
svg.addEventListener('pointerdown', e => {
  const w = toWorld(e), hit = pts.findIndex(p => Math.hypot(Math.abs(w.x) - p.x, w.y - p.y) < 11 * w.px && (w.x >= 0 || true));
  svg.setPointerCapture(e.pointerId);
  if (hit >= 0) { sel = hit; drag = hit; dragMoved = false; pushUndo(); }
  else {
    pushUndo();
    const [x, y] = clampPt(w.x, w.y), np = {x, y, s: true};
    // Insert into the nearest segment when the click is close to the sampled curve; otherwise append.
    const path = sample(pts, 16);
    let best = Infinity, at = pts.length;
    for (let i = 0; i < path.length - 1; i++) {
      const dd = segDist({x, y}, {x: path[i][0], y: path[i][1]}, {x: path[i + 1][0], y: path[i + 1][1]});
      if (dd < best) { best = dd; at = i; }
    }
    if (best < 14 * w.px && pts.length >= 2) {
      let acc = 0, span = pts.length - 1;
      for (let i = 0; i < pts.length - 1; i++) { acc += pts[i].s || pts[i + 1].s ? 16 : 1; if (at < acc) { span = i; break; } }
      pts.splice(span + 1, 0, np); sel = span + 1;
    } else { pts.push(np); sel = pts.length - 1; }
    drag = sel; dragMoved = true;
  }
  update();
});
svg.addEventListener('pointermove', e => {
  if (drag < 0) return;
  const w = toWorld(e), [x, y] = clampPt(w.x, w.y);
  if (pts[drag].x !== x || pts[drag].y !== y) { pts[drag].x = x; pts[drag].y = y; dragMoved = true; update(); }
});
const endDrag = () => { if (drag >= 0 && !dragMoved) undoStack.pop(); drag = -1; };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('dblclick', e => {
  const w = toWorld(e), hit = pts.findIndex(p => Math.hypot(Math.abs(w.x) - p.x, w.y - p.y) < 11 * w.px);
  if (hit >= 0) { pushUndo(); pts[hit].s = !pts[hit].s; sel = hit; update(); }
});
$('smooth').addEventListener('click', () => { if (sel >= 0) { pushUndo(); pts[sel].s = !pts[sel].s; update(); } });
const removePoint = () => { if (sel >= 0) { pushUndo(); pts.splice(sel, 1); sel = Math.min(sel, pts.length - 1); update(); } };
$('del').addEventListener('click', removePoint);
$('undo').addEventListener('click', undo);
$('clear').addEventListener('click', () => { pushUndo(); pts = []; sel = -1; update(); });
function undo() { const last = undoStack.pop(); if (last) { pts = JSON.parse(last); sel = Math.min(sel, pts.length - 1); update(); } }
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { removePoint(); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { undo(); e.preventDefault(); }
});

// ---------- viewer ----------
const stage = $('stage');
let renderer, softMode = false;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch (err) {
  // No WebGL: fall back to a simple painter's-algorithm preview drawn on a 2D canvas.
  softMode = true;
  const canvas2d = document.createElement('canvas'), ctx = canvas2d.getContext('2d');
  renderer = {setPixelRatio() {}, setClearColor() {}, domElement: canvas2d,
    setSize(w, h) { canvas2d.width = w; canvas2d.height = h; },
    setAnimationLoop(fn) { const f = t => { fn(t); requestAnimationFrame(f); }; requestAnimationFrame(f); },
    render() { drawSoft(ctx, canvas2d.width, canvas2d.height); }};
  stage.insertAdjacentHTML('beforeend', '<p class="nogl">WebGL is off in this browser, so this is a simple software preview (no wireframe or cut-away). Turn on hardware acceleration for the full 3D view.</p>');
}
function drawSoft(ctx, w, h) {
  ctx.fillStyle = '#151615'; ctx.fillRect(0, 0, w, h);
  if (!current) return;
  const pos = current.geometry.attributes.position.array, H = state().height, k = Math.min(w, h) / (2 * cam.bound * 1.15);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const tf = i => { // spin about y, tip about x
    const x = pos[i], y = pos[i + 1] - H / 2, z = pos[i + 2];
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1 * k + w / 2, -(y * cp - z1 * sp) * k + h / 2, y * sp + z1 * cp];
  };
  const tris = [];
  for (let t = 0; t < pos.length; t += 9) {
    const a = tf(t), b = tf(t + 3), c = tf(t + 6);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
    const cross = ux * vy - uy * vx; // screen-space winding: skip faces turned away
    if (cross > 0) continue;
    const u3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u3[1] * v3[2] - u3[2] * v3[1], u3[2] * v3[0] - u3[0] * v3[2], u3[0] * v3[1] - u3[1] * v3[0]];
    const l = Math.hypot(...n) || 1; n = n.map(q => q / l);
    tris.push([(a[2] + b[2] + c[2]) / 3, a, b, c, Math.max(0, -(n[0] * -0.4 + n[1] * 0.5 + n[2] * 0.75))]);
  }
  tris.sort((p, q) => p[0] - q[0]);
  for (const [, a, b, c, d] of tris) {
    const v = Math.round(50 + 190 * Math.min(1, d)), col = `rgb(${v},${v + 4},${v - 4})`;
    ctx.fillStyle = ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x151615);
renderer.localClippingEnabled = true;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const material = new THREE.MeshStandardMaterial({color: 0xd9dfd0, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: []});
const tilt = new THREE.Group(), pivot = new THREE.Group();
scene.add(tilt); tilt.add(pivot);
const cam = {yaw: 0, pitch: 0.25, dist: 200, bound: 60, dragging: false};
const place = () => { camera.position.set(0, 0, cam.dist); camera.lookAt(0, 0, 0); };
const fit = bound => { cam.bound = bound; cam.dist = bound * 3.4; cam.pitch = 0.25; place(); };
const dom = renderer.domElement;
dom.addEventListener('pointerdown', e => { cam.dragging = true; dom.setPointerCapture(e.pointerId); });
dom.addEventListener('pointerup', () => { cam.dragging = false; });
dom.addEventListener('pointercancel', () => { cam.dragging = false; });
dom.addEventListener('pointermove', e => {
  if (!cam.dragging) return;
  cam.yaw += e.movementX * 0.01;
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + e.movementY * 0.01));
});
dom.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(cam.bound * 1.3, Math.min(cam.bound * 12, cam.dist * Math.exp(e.deltaY * 0.001))); place(); }, {passive: false});
new ResizeObserver(() => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }).observe(stage);
let last = performance.now();
renderer.setAnimationLoop(now => {
  if ($('auto').checked && !cam.dragging) cam.yaw += (now - last) / 1000 * 0.6;
  last = now;
  tilt.rotation.x = cam.pitch;
  pivot.rotation.y = cam.yaw;
  renderer.render(scene, camera);
});

let current = null, refitted = false;
function rebuild() {
  const s = state();
  for (const c of [...pivot.children]) { pivot.remove(c); c.geometry.dispose(); }
  current = buildMesh(s);
  $('exportStl').disabled = !current;
  if (!current) { $('info').textContent = 'CLICK THE DRAWING TO ADD POINTS (NEED 2+, NOT ALL ON THE AXIS)'; return; }
  const mesh = new THREE.Mesh(current.geometry, material);
  mesh.position.y = -s.height / 2; // centre the solid on the origin
  const wire = new THREE.Mesh(current.geometry, new THREE.MeshBasicMaterial({color: 0x151615, wireframe: true, transparent: true, opacity: 0.55}));
  wire.position.copy(mesh.position);
  wire.visible = $('wire').checked;
  wire.name = 'wire';
  pivot.add(mesh, wire);
  const bound = Math.hypot(Math.max(current.maxR, 1), s.height / 2);
  if (!refitted || Math.abs(bound - cam.bound) > cam.bound * 0.4) { fit(bound); refitted = true; }
  const dxy = 2 * current.maxR;
  $('info').textContent = `Ø${dxy.toFixed(1)} × ${s.height} MM · ${(current.volume / 1000).toFixed(2)} CM³ · ${current.triangles.toLocaleString('en')} TRIANGLES`;
}
function applySection() {
  material.clippingPlanes = $('section').checked ? [clip] : [];
  material.needsUpdate = true;
}
// The clip plane is fixed in world space (facing the camera), so the cut-away shows the inside as the solid turns.

// ---------- wiring ----------
function readouts() {
  const s = state();
  const tex = s.texKind !== 'none';
  $('texBox').hidden = !tex; $('texRdBox').hidden = s.texKind !== 'reaction' || !tex;
  for (const id of ['texScale', 'texDetail', 'texDepth', 'texContrast', 'texLevel', 'texBevel', 'texSteps']) { const o = $(id).parentNode.querySelector(`label[for=${id}] output`); if (o) o.textContent = id === 'texDepth' ? (+$(id).value).toFixed(1) : ['texContrast', 'texLevel', 'texBevel'].includes(id) ? (+$(id).value).toFixed(2) : $(id).value; }
  $('aroundValue').textContent = s.around; $('curveValue').textContent = s.curve; $('wallValue').textContent = s.wall.toFixed(1);
  $('dims').textContent = `Profile area ${s.radius} × ${s.height} mm · solid up to Ø${(s.radius * 2).toFixed(1)} mm`;
}
let frame = 0;
function update() {
  const s = state();
  for (const p of pts) { p.x = Math.min(p.x, s.radius); p.y = Math.min(p.y, s.height); }
  readouts(); drawEditor(); syncUrl();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(rebuild);
}
for (const id of ['height', 'radius', 'around', 'curve', 'wall', 'texKind', 'texDir', 'texRd', 'texFlat', ...TEX_NUMS]) $(id).addEventListener('input', update);
$('wire').addEventListener('input', () => { const w = pivot.getObjectByName('wire'); if (w) w.visible = $('wire').checked; });
$('section').addEventListener('input', applySection);
$('resetView').addEventListener('click', () => { cam.yaw = 0; if (current) fit(cam.bound); });
$('preset').addEventListener('input', () => {
  pushUndo();
  const p = PRESETS[$('preset').value][1];
  pts = presetPts($('preset').value); sel = -1;
  const maxX = Math.max(...p.map(q => q[0])), maxY = Math.max(...p.map(q => q[1]));
  $('radius').value = Math.max(+$('radius').value, Math.ceil(maxX * 1.1)); $('height').value = Math.max(+$('height').value, maxY);
  update(); refitted = false;
});
$('reset').addEventListener('click', () => {
  for (const id of ['height', 'radius', 'around', 'curve', 'wall']) $(id).value = DEFAULTS[id];
  setTexDefaults();
  $('preset').value = DEFAULTS.preset; pts = presetPts(DEFAULTS.preset); sel = -1; undoStack = []; refitted = false; update();
});
$('exportStl').addEventListener('click', () => {
  if (!current) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(stlBlob(current.geometry));
  a.download = `revolution-${$('preset').value}-${state().height}mm.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

function setTexDefaults() { for (const [k, v] of Object.entries(TEX_DEFAULTS)) { if (typeof v === 'boolean') $(k).checked = v; else $(k).value = v; } }
// Share link: every control and the whole profile live in the URL hash.
const round = v => Math.round(v * 100) / 100;
const urlData = () => ({...state(), pts: pts.map(p => [round(p.x), round(p.y), p.s ? 1 : 0])});
// Keep every parameter in the address bar so the page can be shared as it is (debounced).
let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(JSON.stringify(urlData()))); } catch { /* ignore */ } }, 300);
}

$('share').addEventListener('click', async () => {
  const s = state(), data = {...s, pts: pts.map(p => [round(p.x), round(p.y), p.s ? 1 : 0])};
  const url = location.href.split('#')[0] + '#' + encodeURIComponent(JSON.stringify(data));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); $('share').textContent = 'LINK COPIED ✓'; }
  catch { $('share').textContent = 'LINK IN ADDRESS BAR'; }
  setTimeout(() => { $('share').textContent = 'COPY SHARE LINK ⧉'; }, 1800);
});
function applyHash() {
  try {
    const d = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    for (const id of ['height', 'radius', 'around', 'curve', 'wall', ...TEX_NUMS]) if (typeof d[id] === 'number') $(id).value = d[id];
    for (const id of ['texKind', 'texDir', 'texRd']) if (typeof d[id] === 'string') $(id).value = d[id];
    if (typeof d.texFlat === 'boolean') $('texFlat').checked = d.texFlat;
    if (Array.isArray(d.pts) && d.pts.length >= 2) pts = d.pts.map(([x, y, s]) => ({x: +x || 0, y: +y || 0, s: !!s}));
  } catch { /* no or invalid hash: keep defaults */ }
}
$('preset').value = DEFAULTS.preset;
setTexDefaults();
applyHash();
update();
