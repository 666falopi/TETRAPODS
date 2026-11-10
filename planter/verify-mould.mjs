import Module from '../vendor/manifold/manifold.js';
import {build,defaults} from './model.mjs';
import {buildMould} from './mould.mjs';
import {toSTL} from './stl.mjs';
const api=await Module();api.setup();
const solid=m=>new api.Manifold(new api.Mesh({numProp:3,vertProperties:m.positions,triVerts:m.indices}));
for(const config of [{kind:'reaction'},{kind:'cells',dbott:70,dtop:80,pourRadius:50},{kind:'cells',dbott:110,dtop:120,pourRadius:100}]){
 const m=await build({...defaults,texStep:2,...config});const mold=await buildMould(m,{pourRadius:config.pourRadius||20});const vase=solid(m),ss=[];
 for(const p of mold.parts){
  const e=new Map();for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=a<b?a+','+b:b+','+a;e.set(key,(e.get(key)||0)+1);}if([...e.values()].some(x=>x!==2))throw Error('open mesh');
  const x=solid(p),overlap=x.intersect(vase);if(Math.abs(overlap.volume())>.01)throw Error('intersects vase '+p.name+' '+overlap.volume());overlap.delete();ss.push(x);
  if(toSTL(p).byteLength!==84+50*p.indices.length/3)throw Error('STL');
 }
 for(let i=0;i<4;i++)for(let j=0;j<i;j++){const x=ss[i].intersect(ss[j]);if(Math.abs(x.volume())>.01)throw Error('parts intersect '+x.volume());x.delete();}
 ss.forEach(x=>x.delete());vase.delete();console.log('PASS',config,'4 closed parts, no overlaps, STL sizes valid');
}

