import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const DEFAULTS = {gen: 'rd', slices: 12, interp: 'lin', rot: 8, rotNoise: 0, between: 6, pattern: 'maze', warm: 1500, interval: 60, cells: 22, drift: 0.35, invert: false, vstyle: 'web', evenness: 1, strand: 0.07, neck: 0.45, tip: 2.2, swell: 0.8, prune: 0.15, fillet: 0.5, height: 60, diameter: 50, level: 0.5, res: 112, seed: 7};
const NUMS = ['slices', 'rot', 'rotNoise', 'between', 'warm', 'interval', 'cells', 'drift', 'evenness', 'strand', 'neck', 'tip', 'swell', 'prune', 'fillet', 'height', 'diameter', 'level', 'seed'];
const PATTERNS = {spots: [0.035, 0.065], coral: [0.0545, 0.062], maze: [0.029, 0.057], worms: [0.078, 0.061]};

// ---------- helpers ----------
function rng(seed) {
  let a = (seed + 1) * 2654435761 >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Blend curve for moving from slice k to slice k+1 (t and result in 0..1).
const EASE = {
  lin: t => t,
  exp: t => (Math.exp(3 * t) - 1) / (Math.exp(3) - 1),   // stays near slice k, then moves quickly
  log: t => Math.log(1 + 9 * t) / Math.log(10),          // moves quickly, then settles on slice k+1
};
function readState() {
  const s = {vstyle: $('vstyle').value, gen: $('gen').value, interp: $('interp').value, pattern: $('pattern').value, invert: $('invert').checked, res: +$('res').value};
  for (const id of NUMS) s[id] = +$(id).value;
  s.slices = Math.max(2, Math.round(s.slices)); s.seed = Math.floor(s.seed) || 0;
  s.height = Math.min(500, Math.max(5, s.height || 5)); s.diameter = Math.min(300, Math.max(10, s.diameter || 10));
  return s;
}

// Rotation of the pattern at stack position u (0..slices-1): a steady turn of `rot` degrees per slice plus a random
// offset per slice (up to ±rotNoise degrees) that is eased smoothly between neighbouring slices.
function rotationAt(s, offsets, u) {
  const k = Math.min(offsets.length - 2, Math.max(0, Math.floor(u))), f = Math.min(1, u - k), e = f * f * (3 - 2 * f);
  return (s.rot * u + offsets[k] + (offsets[k + 1] - offsets[k]) * e) * Math.PI / 180;
}
function rotationOffsets(s) { const r = rng(s.seed + 77); return Array.from({length: s.slices}, () => (r() * 2 - 1) * s.rotNoise); }

// ---------- slice generators ----------
// Every slice is a function of position in the unit circle (x, y with x²+y² ≤ 1) giving 0..1.


// Voronoi "web": the Voronoi diagram itself drawn as a network of strands, like slime mould or a cell-wall
// drawing. Strands are thin in the middle (neck) and swell at the nodes: bulbs where a strand dead-ends,
// a smaller swelling at junctions. Pruned edges leave open lakes and dangling branches. No circle clip.
function delaunay(P, C) {
  // Bowyer-Watson. Points 0..C-1 are real, C..C+2 the super triangle.
  const pts = [...P.slice(0, C * 2), -50, -50, 50, -50, 0, 60], tris = [[C, C + 1, C + 2]];
  const circ = t => {
    const [a, b, c] = t, ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1], cx = pts[c * 2], cy = pts[c * 2 + 1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return [ux, uy, (ux - ax) ** 2 + (uy - ay) ** 2];
  };
  let cc = [circ(tris[0])];
  for (let p = 0; p < C; p++) {
    const x = pts[p * 2], y = pts[p * 2 + 1], bad = [], edges = new Map();
    for (let i = 0; i < tris.length; i++) if ((x - cc[i][0]) ** 2 + (y - cc[i][1]) ** 2 < cc[i][2]) bad.push(i);
    for (const i of bad) {
      const t = tris[i];
      for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = a < b ? a * 1000 + b : b * 1000 + a; edges.set(k, edges.has(k) ? null : [a, b]); }
    }
    const keep = [], keepC = [], bs = new Set(bad);
    tris.forEach((t, i) => { if (!bs.has(i)) { keep.push(t); keepC.push(cc[i]); } });
    for (const e of edges.values()) if (e) { const t = [e[0], e[1], p]; keep.push(t); keepC.push(circ(t)); }
    tris.length = 0; tris.push(...keep); cc = keepC;
  }
  return tris.map((t, i) => ({t, c: cc[i]})).filter(({t}) => t.every(v => v < C));
}
function hash2(a, b, seed) { let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function webSlices(s) {
  const rand = rng(s.seed + 5), C = Math.max(4, Math.min(150, Math.round(s.cells))), cell = 2 / Math.sqrt(C);
  let pts = new Float32Array(C * 2);
  for (let i = 0; i < C; i++) { const a = rand() * Math.PI * 2, r = 0.95 * Math.sqrt(rand()); pts[i * 2] = Math.cos(a) * r; pts[i * 2 + 1] = Math.sin(a) * r; }
  // Lloyd relaxation: move each site to the centroid of its cell so the cells come out round and even.
  for (let it = 0; it < Math.round(s.evenness); it++) {
    const sx = new Float32Array(C), sy = new Float32Array(C), n = new Float32Array(C), G = 70;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const x = (gx + 0.5) / G * 2 - 1, y = (gy + 0.5) / G * 2 - 1; if (x * x + y * y > 0.9) continue;
      let b = 0, bd = 1e9; for (let i = 0; i < C; i++) { const d = (pts[i * 2] - x) ** 2 + (pts[i * 2 + 1] - y) ** 2; if (d < bd) { bd = d; b = i; } }
      sx[b] += x; sy[b] += y; n[b]++;
    }
    for (let i = 0; i < C; i++) if (n[i]) { pts[i * 2] = sx[i] / n[i]; pts[i * 2 + 1] = sy[i] / n[i]; }
  }
  const slices = [], base = cell * 0.5 * Math.max(0.01, s.strand * 2);
  for (let k = 0; k < s.slices; k++) {
    // Graph of this slice: Voronoi vertices (circumcentres) and the strands joining them.
    const tri = delaunay(pts, C), byEdge = new Map();
    tri.forEach(({t}, i) => { for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], key = Math.min(a, b) * 1000 + Math.max(a, b); (byEdge.get(key) || byEdge.set(key, []).get(key)).push(i); } });
    const segs = [], deg = new Map();
    for (const [key, ts] of byEdge) {
      if (ts.length !== 2) continue;                                   // hull edge: its strand would run to infinity
      const A = tri[ts[0]].c, B = tri[ts[1]].c;
      if (A[0] * A[0] + A[1] * A[1] > 1.45 || B[0] * B[0] + B[1] * B[1] > 1.45) continue;
      if (hash2(Math.floor(key / 1000), key % 1000, s.seed) < s.prune) continue;   // same strands vanish in every slice
      segs.push([ts[0], ts[1]]);
      deg.set(ts[0], (deg.get(ts[0]) || 0) + 1); deg.set(ts[1], (deg.get(ts[1]) || 0) + 1);
    }
    const rad = i => { const d = deg.get(i) || 0; return base * (d <= 1 ? s.tip : d === 2 ? 1 : 1 + s.swell); };
    const E = new Float32Array(segs.length * 8);
    segs.forEach(([i, j], q) => {
      const A = tri[i].c, B = tri[j].c, ra = rad(i), rb = rad(j), m = Math.max(ra, rb) * 1.2 + 0.12;
      E.set([A[0], A[1], B[0], B[1], ra, rb, Math.min(A[0], B[0]) - m, Math.min(A[1], B[1]) - m], q * 8);
      // bbox upper corner stored separately below
    });
    const hi = new Float32Array(segs.length * 2);
    segs.forEach(([i, j], q) => { const A = tri[i].c, B = tri[j].c, m = Math.max(rad(i), rad(j)) * 1.2 + 0.12; hi[q * 2] = Math.max(A[0], B[0]) + m; hi[q * 2 + 1] = Math.max(A[1], B[1]) + m; });
    slices.push({E, hi, n: segs.length});
    const next = new Float32Array(pts);
    for (let i = 0; i < C; i++) {
      const a = rand() * Math.PI * 2, d = s.drift * cell * 0.5 * (0.4 + rand());
      let x = next[i * 2] + Math.cos(a) * d, y = next[i * 2 + 1] + Math.sin(a) * d; const r = Math.hypot(x, y); if (r > 0.95) { x *= 0.95 / r; y *= 0.95 / r; }
      next[i * 2] = x; next[i * 2 + 1] = y;
    }
    pts = next;
  }
  const gw = 0.05, kf = 0.002 + 0.03 * s.fillet, tmp = new Float32Array(2048);
  return {
    web: true, span: 1.25,
    sample(k, x, y) {
      const {E, hi, n} = slices[k]; let best = -1, cnt = 0;
      for (let q = 0; q < n; q++) {
        const o = q * 8;
        if (x < E[o + 6] || y < E[o + 7] || x > hi[q * 2] || y > hi[q * 2 + 1]) continue;
        const ax = E[o], ay = E[o + 1], dx = E[o + 2] - ax, dy = E[o + 3] - ay, l2 = dx * dx + dy * dy || 1e-9;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)), st = t * t * (3 - 2 * t);
        const r = (E[o + 4] + (E[o + 5] - E[o + 4]) * st) * (1 - s.neck * Math.sin(Math.PI * t));
        const v = r - Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
        if (cnt < 2048) tmp[cnt++] = v; if (v > best) best = v;
      }
      if (cnt === 0) return 0;
      let sum = 0; for (let q = 0; q < cnt; q++) sum += Math.exp((tmp[q] - best) / kf);
      const sdf = best + kf * Math.log(sum);
      return Math.min(1, Math.max(0, 0.5 + sdf / (2 * gw)));
    },
  };
}

// Voronoi: each slice has its own set of cell centres, a random walk of the previous slice's centres.
function voronoiSlices(s) {
  if (s.vstyle === 'web') return webSlices(s);
  const rand = rng(s.seed + 5), C = Math.max(2, Math.round(s.cells)), cell = 2 / Math.sqrt(C), slices = [];
  let pts = new Float32Array(C * 2);
  for (let i = 0; i < C; i++) { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()); pts[i * 2] = Math.cos(a) * r; pts[i * 2 + 1] = Math.sin(a) * r; }
  for (let k = 0; k < s.slices; k++) {
    slices.push(pts);
    const next = new Float32Array(pts);
    for (let i = 0; i < C; i++) {
      const a = rand() * Math.PI * 2, d = s.drift * cell * 0.9 * (0.4 + rand());
      let x = next[i * 2] + Math.cos(a) * d, y = next[i * 2 + 1] + Math.sin(a) * d;
      const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; }
      next[i * 2] = x; next[i * 2 + 1] = y;
    }
    pts = next;
  }
  const gap = 0.45 * cell;
  return {
    sample(k, x, y) {
      const p = slices[k]; let d1 = 1e9, d2 = 1e9;
      for (let i = 0; i < C; i++) { const dx = p[i * 2] - x, dy = p[i * 2 + 1] - y, d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const f = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / gap);
      return s.invert ? 1 - f : f;
    },
    draw: null,
  };
}

// Reaction-diffusion (Gray-Scott) on a square grid with a circular, no-flux wall. Slice k is the pattern
// after warm-up + k*interval steps, so the stack is the pattern's own history.
const rdCache = {key: '', val: null};
function rdSlices(s) {
  const gs = s.res >= 160 ? 160 : s.res >= 112 ? 112 : 80, key = [gs, s.pattern, s.seed, s.warm, s.interval, s.slices].join();
  if (rdCache.key !== key) {
    const [F, K] = PATTERNS[s.pattern] || PATTERNS.maze, n = gs * gs, mask = new Uint8Array(n), rad = gs / 2 - 0.5;
    for (let y = 0; y < gs; y++) for (let x = 0; x < gs; x++) mask[y * gs + x] = Math.hypot(x - (gs - 1) / 2, y - (gs - 1) / 2) <= rad ? 1 : 0;
    let U = new Float32Array(n).fill(1), V = new Float32Array(n), U2 = new Float32Array(n), V2 = new Float32Array(n);
    const rand = rng(s.seed), inside = mask.reduce((a, b) => a + b, 0), blobs = Math.max(3, Math.round(inside / 450));
    for (let b = 0; b < blobs; b++) {
      let cx, cy; do { cx = Math.floor(rand() * gs); cy = Math.floor(rand() * gs); } while (!mask[cy * gs + cx]);
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const i = (cy + y) * gs + cx + x; if (x * x + y * y <= 5 && cy + y >= 0 && cy + y < gs && cx + x >= 0 && cx + x < gs && mask[i]) { U[i] = 0.5; V[i] = 0.25 + rand() * 0.1; } }
    }
    const step = () => {
      for (let y = 0; y < gs; y++) for (let x = 0; x < gs; x++) {
        const i = y * gs + x; if (!mask[i]) continue;
        const u = U[i], v = V[i];
        const l = x > 0 && mask[i - 1] ? i - 1 : i, r = x < gs - 1 && mask[i + 1] ? i + 1 : i, up = y > 0 && mask[i - gs] ? i - gs : i, dn = y < gs - 1 && mask[i + gs] ? i + gs : i;
        const uvv = u * v * v;
        U2[i] = u + 0.16 * (U[l] + U[r] + U[up] + U[dn] - 4 * u) - uvv + F * (1 - u);
        V2[i] = v + 0.08 * (V[l] + V[r] + V[up] + V[dn] - 4 * v) + uvv - (F + K) * v;
      }
      [U, U2] = [U2, U]; [V, V2] = [V2, V];
    };
    for (let i = 0; i < s.warm; i++) step();
    const snaps = [];
    for (let k = 0; k < s.slices; k++) {
      if (k) for (let i = 0; i < s.interval; i++) step();
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) if (mask[i]) { if (V[i] < lo) lo = V[i]; if (V[i] > hi) hi = V[i]; }
      const sc = hi - lo > 1e-4 ? 1 / (hi - lo) : 0, f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = mask[i] ? (V[i] - lo) * sc : 0;
      snaps.push(f);
    }
    rdCache.key = key; rdCache.val = {gs, snaps};
  }
  const {gs: G, snaps} = rdCache.val;
  return {
    sample(k, x, y) {
      const f = snaps[k], gx = (x + 1) / 2 * (G - 1), gy = (y + 1) / 2 * (G - 1), x0 = Math.min(G - 2, Math.max(0, Math.floor(gx))), y0 = Math.min(G - 2, Math.max(0, Math.floor(gy))), tx = Math.min(1, Math.max(0, gx - x0)), ty = Math.min(1, Math.max(0, gy - y0));
      const a = f[y0 * G + x0], b = f[y0 * G + x0 + 1], c = f[(y0 + 1) * G + x0], d = f[(y0 + 1) * G + x0 + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    },
  };
}

// ---------- the scalar volume ----------
// Layer j of the stack sits at u = j/(L-1)*(slices-1). Between slice k and k+1 the two patterns are blended with
// the chosen curve, and both are sampled through the same rotation, which turns by `rot` degrees per slice.
function buildVolume(s, gen) {
  const offsets = rotationOffsets(s);
  const N = s.res, S = s.slices, L = (S - 1) * s.between + 1, nx = N, ny = N, nz = L + 2, ease = EASE[s.interp] || EASE.lin;
  const vol = new Float32Array(nx * ny * nz).fill(-1000), span = gen.span || 1.08, web = !!gen.web;   // grid covers the circle plus a margin
  for (let j = 0; j < L; j++) {
    const u = j / (L - 1) * (S - 1), k = Math.min(S - 2, Math.floor(u)), e = ease(u - k), th = rotationAt(s, offsets, u), c = Math.cos(th), sn = Math.sin(th);
    const z = j + 1;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const px = (x / (nx - 1) * 2 - 1) * span, py = (y / (ny - 1) * 2 - 1) * span, r = Math.hypot(px, py);
      if (!web && r > 1.02) continue;                         // outside the circle stays empty (the web is not clipped)
      const qx = c * px + sn * py, qy = -sn * px + c * py;
      const a = gen.sample(k, qx, qy), b = gen.sample(k + 1, qx, qy);
      vol[(z * ny + y) * nx + x] = Math.min((a + (b - a) * e) - s.level, web ? (1 - Math.max(Math.abs(px), Math.abs(py)) / span) * 6 : (1 - r) * 3);
    }
  }
  return {vol, nx, ny, nz, L, span};
}

// ---------- surface nets ----------
// One vertex per grid cell that the surface crosses (at the mean of its edge crossings), one quad per crossed
// grid edge. Smooth, no lookup tables. Inside = value >= 0; the outermost layers are empty so the surface closes.
function surfaceNets({vol, nx, ny, nz, L, span}, R, H) {
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, cellIdx = new Int32Array(cx * cy * cz).fill(-1), pos = [], idx = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const at = (x, y, z) => vol[(z * ny + y) * nx + x];
  const world = (x, y, z) => [(x / (nx - 1) * 2 - 1) * span * R, (y / (ny - 1) * 2 - 1) * span * R, (z - 1) / (L - 1) * H];
  const v = new Float32Array(8);
  for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
    let mask = 0;
    for (let q = 0; q < 8; q++) { v[q] = at(x + corner[q][0], y + corner[q][1], z + corner[q][2]); if (v[q] >= 0) mask |= 1 << q; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] >= 0) === (v[b] >= 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t; sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t; sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t; cnt++;
    }
    const w = world(x + sx / cnt, y + sy / cnt, z + sz / cnt);
    cellIdx[(z * cy + y) * cx + x] = pos.length / 3; pos.push(w[0], w[1], w[2]);
  }
  const cell = (x, y, z) => cellIdx[(z * cy + y) * cx + x];
  // For an edge along axis a, the four cells around it, cyclic around the axis.
  const AX = [[1, 0, 0, 1, 2], [0, 1, 0, 2, 0], [0, 0, 1, 0, 1]];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    for (let a = 0; a < 3; a++) {
      const ex = x + AX[a][0], ey = y + AX[a][1], ez = z + AX[a][2];
      if (ex >= nx || ey >= ny || ez >= nz) continue;
      const s0 = at(x, y, z) >= 0, s1 = at(ex, ey, ez) >= 0;
      if (s0 === s1) continue;
      const g = [x, y, z], dims = [cx, cy, cz], bAxis = AX[a][3], cAxis = AX[a][4];
      if (g[a] >= dims[a] || g[bAxis] < 1 || g[bAxis] > dims[bAxis] - 1 || g[cAxis] < 1 || g[cAxis] > dims[cAxis] - 1) continue;
      const ids = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => { const p = [x, y, z]; p[bAxis] -= 1 - i; p[cAxis] -= 1 - j; return cell(p[0], p[1], p[2]); });
      if (ids.some(i => i < 0)) continue;
      if (s0) idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]); else idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
    }
  }
  const P = new Float32Array(pos), I = new Uint32Array(idx);
  let vsum = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vsum += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  if (vsum < 0) for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; vsum = -vsum; }
  return {pos: P, idx: I, volume: vsum / 6};
}

// ---------- viewer ----------
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch { stage.innerHTML = '<p class="nogl">WebGL is not available in this browser, so the 3D view cannot be shown. Turn on hardware acceleration.</p>'; }
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 8000), tilt = new THREE.Group(), pivot = new THREE.Group(), model = new THREE.Group();
const cam = {yaw: 0.6, pitch: 0.3, dist: 200, bound: 40, dragging: false};
const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55, metalness: 0.05});
const place = () => { camera.position.set(0, 0, cam.dist); camera.lookAt(0, 0, 0); };
const fitView = bound => { cam.bound = bound; cam.dist = bound * 3.4; cam.pitch = 0.3; place(); };
let mesh = null, solid = null;
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x151615);
  stage.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  scene.add(tilt); tilt.add(pivot); pivot.add(model); model.rotation.x = -Math.PI / 2;   // model z (height) -> world up
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
    renderer.render(scene, camera);
  });
}
const dark = [0.2, 0.15, 0.11], light = [0.95, 0.8, 0.55];

// ---------- build ----------
function drawStrip(s, gen) {
  const offsets = rotationOffsets(s), cv = $('strip'), ctx = cv.getContext('2d'), n = Math.min(s.slices, 16), cell = cv.width / n;
  cv.height = Math.round(cell); ctx.fillStyle = '#0f100f'; ctx.fillRect(0, 0, cv.width, cv.height);
  const px = Math.max(24, Math.round(cell)), img = ctx.createImageData(px, px);
  for (let q = 0; q < n; q++) {
    const k = n === 1 ? 0 : Math.round(q / (n - 1) * (s.slices - 1)), th = rotationAt(s, offsets, k), c = Math.cos(th), sn = Math.sin(th);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const sp = gen.span || 1, X = ((x + 0.5) / px * 2 - 1) * sp, Y = ((y + 0.5) / px * 2 - 1) * sp, o = (y * px + x) * 4;
      if (!gen.web && Math.hypot(X, Y) > 1) { img.data[o + 3] = 0; continue; }
      const f = gen.sample(k, c * X + sn * Y, -sn * X + c * Y), on = f >= s.level;
      img.data[o] = on ? 235 : 40; img.data[o + 1] = on ? 205 : 38; img.data[o + 2] = on ? 150 : 34; img.data[o + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = off.height = px; off.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(off, q * cell + 2, 2, cell - 4, cell - 4);
  }
}
function build() {
  const s = readState(), t0 = performance.now(), gen = s.gen === 'voronoi' ? voronoiSlices(s) : rdSlices(s);
  const R = s.diameter / 2, v = buildVolume(s, gen);
  solid = surfaceNets(v, R, s.height);
  drawStrip(s, gen);
  const {pos, idx} = solid, nv = pos.length / 3, col = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { const h = Math.min(1, Math.max(0, pos[i * 3 + 2] / s.height)); for (let c = 0; c < 3; c++) col[i * 3 + c] = dark[c] + (light[c] - dark[c]) * (0.1 + 0.9 * h); }
  if (renderer) {
    if (mesh) { model.remove(mesh); mesh.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    mesh = new THREE.Mesh(g, material); mesh.position.z = -s.height / 2; model.add(mesh);
    material.wireframe = $('wire').checked;
    const bound = Math.hypot(R * (gen.span || 1), s.height / 2); if (Math.abs(bound - cam.bound) > cam.bound * 0.2) fitView(bound);
  }
  const L = (s.slices - 1) * s.between + 1;
  let mx = 0; for (let i = 0; i < nv; i++) mx = Math.max(mx, Math.abs(pos[i * 3]), Math.abs(pos[i * 3 + 1]));
  $('info').textContent = `${(2 * mx).toFixed(0)} × ${s.height} MM · ${(solid.volume / 1000).toFixed(1)} CM³ · ${(idx.length / 3).toLocaleString('en')} TRIANGLES · ${((performance.now() - t0) / 1000).toFixed(1)} S`;
  $('dims').textContent = `${s.slices} slices, ${L} layers · total twist ${(s.rot * (s.slices - 1)).toFixed(0)}°${s.rotNoise ? ` ± ${s.rotNoise}° noise` : ''}`;
  $('exportStl').disabled = !idx.length;
}

// ---------- STL ----------
function stlBlob() {
  const {pos, idx} = solid, count = idx.length / 3, buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  view.setUint32(80, count, true);
  for (let t = 0; t < count; t++) {
    const P = i => [pos[idx[t * 3 + i] * 3], pos[idx[t * 3 + i] * 3 + 1], pos[idx[t * 3 + i] * 3 + 2]], a = P(0), b = P(1), c = P(2);   // model is already z-up, z = 0 at the base
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, q) => view.setFloat32(84 + t * 50 + q * 4, x, true));
  }
  return new Blob([buffer], {type: 'model/stl'});
}

// ---------- wiring ----------
let timer = 0;
function showGroups() { const g = $('gen').value, w = $('vstyle').value === 'web'; $('rdBox').hidden = g !== 'rd'; $('vorBox').hidden = g !== 'voronoi'; $('webBox').hidden = !w; $('classicBox').hidden = w; }
function readouts() { for (const id of ['slices', 'rot', 'rotNoise', 'between', 'warm', 'interval', 'cells', 'drift', 'evenness', 'strand', 'neck', 'tip', 'swell', 'prune', 'fillet', 'level']) { const o = $(id).parentNode.querySelector(`label[for=${id}] output`); if (o) o.textContent = ['drift', 'level', 'strand', 'neck', 'tip', 'swell', 'prune', 'fillet'].includes(id) ? (+$(id).value).toFixed(2) : id === 'rot' || id === 'rotNoise' ? (+$(id).value).toFixed(1) : $(id).value; } }
// Keep every parameter in the address bar so the page can be shared as it is (debounced).
let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(JSON.stringify(urlData()))); } catch { /* ignore */ } }, 300);
}
const urlData = () => readState();
function schedule() {
  readouts(); showGroups(); syncUrl();
  clearTimeout(timer);
  timer = setTimeout(() => { try { build(); $('warn').textContent = ''; } catch (err) { console.error(err); $('warn').textContent = 'Could not build the solid: ' + err.message; } }, 120);
}
for (const id of [...NUMS, 'gen', 'interp', 'pattern', 'vstyle', 'invert', 'res']) $(id).addEventListener('input', schedule);
$('dice').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); schedule(); });
$('wire').addEventListener('input', () => { material.wireframe = $('wire').checked; });
$('resetView').addEventListener('click', () => { cam.yaw = 0.6; fitView(cam.bound); });
function setDefaults() { for (const [k, v] of Object.entries(DEFAULTS)) { if (typeof v === 'boolean') $(k).checked = v; else $(k).value = v; } }
$('reset').addEventListener('click', () => { setDefaults(); schedule(); });
$('exportStl').addEventListener('click', () => {
  if (!solid || !solid.idx.length) return;
  const a = document.createElement('a'), s = readState();
  a.href = URL.createObjectURL(stlBlob());
  a.download = `slices-${s.gen}-${s.slices}x-${s.interp}-rot${s.rot}-seed${s.seed}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
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
    for (const id of ['gen', 'interp', 'pattern', 'vstyle']) if (typeof d[id] === 'string') $(id).value = d[id];
    if (typeof d.invert === 'boolean') $('invert').checked = d.invert;
  } catch { /* no hash */ }
}
window.__seLoaded = true;
fitView(cam.bound);
setDefaults();
applyHash();
schedule();
window.__se = {webSlices, surfaceNets, buildVolume, voronoiSlices, rdSlices, readState};
