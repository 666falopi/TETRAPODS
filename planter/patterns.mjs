import {spiralGrid} from './spiral.mjs';
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

// Regular patterns. u wraps once around (or once per module when locked), v uses the same unit.
// Counts along u are integers, so every pattern closes without a seam.
const frac = x => x - Math.floor(x), clamp01 = x => Math.max(0, Math.min(1, x));
const sharpen = (t, k) => k > 1 ? clamp01((t - .5) * k + .5) : t;
const wave = phase => (1 + Math.cos(2 * Math.PI * phase)) / 2;
function regular(kind, u, v, s) {
  const n = Math.max(1, Math.round(s.scale)), tan = Math.tan((s.patAngle ?? 30) * Math.PI / 180);
  switch (kind) {
    case 'diamonds': { const a = s.patAspect ?? 1.4, p = u * n + v * n / a, q = u * n - v * n / a;
      return sharpen(1 - 2 * Math.max(Math.abs(frac(p) - .5), Math.abs(frac(q) - .5)), s.patSharp ?? 1); }
    case 'vstripes': return sharpen(1 - Math.abs(2 * frac(u * n) - 1), s.patSharp ?? 3);
    case 'soft': return wave(u * n);
    case 'softTilt': return wave(n * (u + tan * v));
    case 'softCurve': return wave(n * (u + tan * v + (s.patBend ?? .3) * Math.sin(2 * Math.PI * (s.patWaves ?? 1) * v / (s.vspan || 1))));
  }
}
export const regularKinds = ['diamonds', 'vstripes', 'soft', 'softTilt', 'softCurve'];

function height(kind, u, v, s) {
  if (regularKinds.includes(kind)) return regular(kind, u, v, s);
  switch (kind) {
    case 'spiral': return spiralGrid(u, v / (s.height / (Math.PI*s.diameter)), s);
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


// The pattern formulas and Gray–Scott solver above come from Texture Generator.
let previousKey='';
// Locked mode: the texture is a module repeated exactly 3·k times around, so the three mould
// sectors carry identical copies. Scale then changes the content of the module, not the count.
export function lockInfo(s){
 const circumference=Math.PI*s.diameter,R=3*Math.max(1,Math.round(s.perPiece||1)),moduleMM=circumference/R;
 return {R,moduleMM,grid:Math.max(32,Math.min(512,Math.round(moduleMM/(s.rdCell||.6))))};
}
export function makePattern(settings, progress=()=>{}){
 const s={...settings},locked=!!s.lock3&&s.kind!=='spiral',L=lockInfo(s);
 const repeats=locked?L.R:Math.max(1,Math.round(s.wrapRepeats??Math.PI*s.diameter/(s.textureSize||120)));
 const tiled=s.kind==='reaction'||locked,base=Math.max(512,Math.min(2048,Math.ceil(Math.PI*s.diameter/Math.max(.1,s.texStep||1)))),w=tiled?Math.ceil(base/repeats)*repeats:base, h=Math.max(8,Math.round(w*s.height/(Math.PI*s.diameter)));
 let data;
 if(s.kind==='reaction'){
  const grid=locked?L.grid:s.grid,ny=grid;
  const key=JSON.stringify([grid,ny,s.seed,s.feed,s.kill,true]);
  if(key!==previousKey||sim.steps>s.steps){simReset(grid,ny,true,s.seed);previousKey=key;}
  while(sim.steps<s.steps){simStep(Math.min(100,s.steps-sim.steps),s.feed,s.kill);if(sim.steps%500===0)progress('Textura: '+sim.steps+' / '+s.steps+' pasos');}
  const tile=reactionField(w,w), tileMM=Math.PI*s.diameter/repeats;
  data=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const tx=wrap(x*repeats,w),ty=wrap(y/h*s.height/tileMM*w,w),ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;
   const at=(a,b)=>tile[wrap(b,w)*w+wrap(a,w)];
   data[y*w+x]=(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
  }
 }else{
  data=new Float32Array(w*h);const R=locked?repeats:1;s.vspan=R*s.height/(Math.PI*s.diameter);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[y*w+x]=height(s.kind,frac(x/w*R),y/w*R,s);
 }
 // Contrast / bevel are applied AFTER interpolating the raw field (per sample), not before: shaping first turns
 // the map into near-binary texels and bilinear sampling then draws staircases along diagonal edges.
 const shape=r=>{let v=Math.max(0,Math.min(1,(r-.5)*s.contrast+.5));
  if(s.bevel<1){const t=Math.max(0,Math.min(1,(v-s.level)/Math.max(.02,s.bevel)+.5));v=t*t*(3-2*t);}
  return s.invert?1-v:v;};
 const raw=data,shown=new Float32Array(raw.length);for(let i=0;i<raw.length;i++)shown[i]=shape(raw[i]);
 function sample(u,v){
  const x=wrap(u,1)*w,y=Math.max(0,Math.min(h-1,v*(h-1))),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const at=(x,y)=>raw[Math.min(h-1,y)*w+wrap(x,w)];
  return shape((at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy);
 }
 return {sample,data:shown,width:w,height:h};
}
