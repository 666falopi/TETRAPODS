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
const presetPts = key => PRESETS[key][1].map(([x, y, s]) => ({x, y, s: !!s}));
for (const [k, [name]] of Object.entries(PRESETS)) $('preset').add(new Option(name, k));

let pts = presetPts(DEFAULTS.preset), sel = -1, undoStack = [];
const num = (id, lo, hi) => Math.min(hi, Math.max(lo, +$(id).value || lo));
const state = () => ({height: num('height', 1, 1000), radius: num('radius', 1, 500), around: +$('around').value, curve: +$('curve').value, wall: +$('wall').value});

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
  const clean = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1e-6);
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
  const P = [], N = [], N_ = s.around;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m];
    if (a[0] < 1e-6 && b[0] < 1e-6) continue; // lies on the axis
    const na = vn(i, i), nb = vn((i + 1) % m, i);
    for (let j = 0; j < N_; j++) {
      const t0 = j / N_ * Math.PI * 2, t1 = (j + 1) / N_ * Math.PI * 2, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const v = (p, n, c, sn) => [[p[0] * c, p[1], p[0] * sn], [n[0] * c, n[1], n[0] * sn]];
      const A0 = v(a, na, c0, s0), A1 = v(a, na, c1, s1), B0 = v(b, nb, c0, s0), B1 = v(b, nb, c1, s1);
      const tri = (x, y, z) => { if (area2(x[0], y[0], z[0]) > 1e-12) for (const q of [x, y, z]) { P.push(...q[0]); N.push(...q[1]); } };
      tri(A0, A1, B1); tri(A0, B1, B0);
    }
  }
  // Make winding agree with the outward normals (positive signed volume).
  let vol = 0;
  for (let i = 0; i < P.length; i += 9) {
    const a = P.slice(i, i + 3), b = P.slice(i + 3, i + 6), c = P.slice(i + 6, i + 9);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  if (vol < 0) for (let i = 0; i < P.length; i += 9) for (let k = 0; k < 3; k++) {
    for (const arr of [P, N]) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  const maxR = Math.max(...poly.map(p => p[0]));
  return {geometry, triangles: P.length / 9, volume: Math.abs(vol), maxR, poly};
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
  $('aroundValue').textContent = s.around; $('curveValue').textContent = s.curve; $('wallValue').textContent = s.wall.toFixed(1);
  $('dims').textContent = `Profile area ${s.radius} × ${s.height} mm · solid up to Ø${(s.radius * 2).toFixed(1)} mm`;
}
let frame = 0;
function update() {
  const s = state();
  for (const p of pts) { p.x = Math.min(p.x, s.radius); p.y = Math.min(p.y, s.height); }
  readouts(); drawEditor();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(rebuild);
}
for (const id of ['height', 'radius', 'around', 'curve', 'wall']) $(id).addEventListener('input', update);
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

// Share link: every control and the whole profile live in the URL hash.
const round = v => Math.round(v * 100) / 100;
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
    for (const id of ['height', 'radius', 'around', 'curve', 'wall']) if (typeof d[id] === 'number') $(id).value = d[id];
    if (Array.isArray(d.pts) && d.pts.length >= 2) pts = d.pts.map(([x, y, s]) => ({x: +x || 0, y: +y || 0, s: !!s}));
  } catch { /* no or invalid hash: keep defaults */ }
}
$('preset').value = DEFAULTS.preset;
applyHash();
update();
