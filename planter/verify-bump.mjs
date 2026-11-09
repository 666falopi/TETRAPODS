import assert from 'node:assert/strict';
import {defaults,revolve,build,profile,supportRadius} from './model.mjs';
const sample=(u,v)=>.5+.35*Math.sin(2*Math.PI*u)*Math.cos(5*v);
for(const chamferAngle of [31,35,50]){
 const s={...defaults,chamferAngle,supportFree:false,hbump:8,fillet:1},p=profile(s),m=revolve(s,sample);let checked=0;
 for(let i=0;i<m.positions.length;i+=3){
  const [x,y,z]=m.positions.slice(i,i+3),r=Math.hypot(x,z),base=p.outerBottom+p.slope*(y-s.barthck);
  if(y<=s.barthck+1e-4||y>=s.hgen-s.barthck-1e-4||r<base-1e-4)continue;
  const u=((Math.atan2(z,x)/(2*Math.PI))%1+1)%1,v=(s.hgen-s.barthck-y)/p.wallHeight;
  const bump=base+s.hbump*sample(u,v),expected=Math.max(bump,supportRadius(s,y));
  assert.ok(Math.abs(r-expected)<2e-5,`Bump changed: ${r} != ${expected}`);checked++;
 }
 assert.ok(checked>1000);console.log(`chamfer angle ${chamferAngle}: ${checked} full-displacement vertices verified`);
}
for(const [chamferAngle,fillet,kind] of [[31,0,'cells'],[35,1,'reaction'],[50,2,'spiral']]){
 const m=await build({...defaults,chamferAngle,fillet,kind});assert.equal(m.components,1);assert.equal(m.overhang.count,0);
 const verts=new Map(),weld=[],edges=new Map();let seq=0;
 for(let i=0;i<m.positions.length;i+=3){const key=Array.from(m.positions.slice(i,i+3),v=>v.toFixed(5)).join(',');if(!verts.has(key))verts.set(key,seq++);weld.push(verts.get(key));}
 for(let i=0;i<m.indices.length;i+=3)for(let j=0;j<3;j++){const a=weld[m.indices[i+j]],b=weld[m.indices[i+(j+1)%3]],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===2));console.log(`${kind}: closed single solid, ${m.indices.length/3} triangles`);
}

const without=await build({...defaults,supportFree:false}),withEnvelope=await build({...defaults,supportFree:true});
assert.ok(without.overhang.count>0);assert.equal(withEnvelope.overhang.count,0);assert.ok(withEnvelope.volume>=without.volume);
const p=profile(defaults);assert.equal(supportRadius(defaults,defaults.hgen-defaults.barthck),defaults.dtop);assert.equal(supportRadius(defaults,defaults.barthck),defaults.dbott);
console.log('Edge origins verified; add-only envelope removes flagged 30-degree faces in default case.');
