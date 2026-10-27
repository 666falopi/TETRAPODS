import {random} from './geometry.js';
export const CLOUD_TYPES={
 congestus:{name:'Cumulus congestus',description:'Uneven cauliflower crowns and clustered towers. Growth follows your axis instead of atmospheric vertical.',url:'https://cloudatlas.wmo.int/en/species-cumulus-congestus-cu-con.html'},
 humilis:{name:'Cumulus humilis',description:'Low, broad puffs with a flattened underside. The low profile is oriented around your branch.',url:'https://cloudatlas.wmo.int/en/clouds-species-humilis.html'},
 stratocumulus:{name:'Stratocumulus',description:'A broad bank of overlapping rolls and rounded masses, spread across the branch.',url:'https://cloudatlas.wmo.int/definition-stratocumulus-sc.html'},
 fibratus:{name:'Cirrus fibratus',description:'Swept filaments. Here they are deliberately thickened and joined into a solid sculptural fan.',url:'https://cloudatlas.wmo.int/en/clouds-species-fibratus.html'}
};
export function branchPreset(count=4){const dirs=count===1?[[0,1,0]]:count===2?[[0,1,0],[0,-1,0]]:count===3?[[0,1,0],[-.866,-.5,0],[.866,-.5,0]]:[[0,1,0],[Math.sqrt(8/9),-1/3,0],[-Math.sqrt(2/9),-1/3,Math.sqrt(2/3)],[-Math.sqrt(2/9),-1/3,-Math.sqrt(2/3)]];return Array.from({length:count},(_,i)=>{const d=dirs[i];return{length:[1.65,1.65,1.55,1.9][i],azimuth:Math.atan2(d[0],d[2])*180/Math.PI,elevation:Math.asin(d[1])*180/Math.PI,radius:[.69,.62,.62,.55][i],shape:Object.keys(CLOUD_TYPES)[i]}})}
export function endpoint(b){const a=b.azimuth*Math.PI/180,e=b.elevation*Math.PI/180;return[b.length*Math.cos(e)*Math.sin(a),b.length*Math.sin(e),b.length*Math.cos(e)*Math.cos(a)]}
const legacy={billow:'congestus',smooth:'humilis',taper:'fibratus'};
export function migrateBranches(bs){return bs.map(b=>({...b,shape:legacy[b.shape]||b.shape}))}
export function validBranches(bs){return Array.isArray(bs)&&bs.length<=4&&bs.every(b=>b&&Number.isFinite(b.length)&&b.length>=.5&&b.length<=2.5&&Number.isFinite(b.azimuth)&&Math.abs(b.azimuth)<=180&&Number.isFinite(b.elevation)&&Math.abs(b.elevation)<=90&&Number.isFinite(b.radius)&&b.radius>=.25&&b.radius<=.85&&(Object.hasOwn(CLOUD_TYPES,b.shape)||Object.hasOwn(legacy,b.shape)))}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l)};
const merge=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.max(a,b)+h*h*k*.25};
// Local axes: u = lateral, v = lateral, w = branch. Overlapping irregular
// masses replace the old periodically modulated capsule (which produced rings).
export function branchField(branches,p){
 const arms=migrateBranches(branches).map((b,i)=>{
  const w=unit(endpoint(b)),u=unit(cross(Math.abs(w[1])<.9?[0,1,0]:[0,0,1],w)),v=cross(w,u),r=b.radius,L=b.length,rand=random(p.seed+101*i),lobes=[];
  const add=(x,y,z,rx,ry,rz)=>lobes.push([x,y,z,rx,ry,rz,Math.min(rx,ry,rz)]);
  if(b.shape==='congestus'){
   // Large off-axis crowns, with smaller shoulder lobes, all overlapping.
   for(let j=0;j<8;j++){const t=j/7,angle=j*2.399+rand()*.5,spread=r*(.15+.7*t),x=Math.cos(angle)*spread,y=Math.sin(angle)*spread,rr=r*(.7+rand()*.4);add(x,y,t*L,rr,rr*(.85+rand()*.2),rr*.95);for(let q=0;q<3;q++){const a=rand()*Math.PI*2,s=rr*.69;add(x+Math.cos(a)*s,y+Math.sin(a)*s,t*L+(rand()-.5)*rr,rr*.49,rr*.5,rr*.53)}}
  }else if(b.shape==='humilis'){
   const count=Math.max(5,Math.ceil(L/(r*.7))+1);for(let j=0;j<count;j++){const t=j/(count-1),x=(rand()-.5)*r*1.4;add(x,0,t*L,r*(.7+rand()*.4),r*.46,r*.63);add(x+r*(rand()-.5),r*.25,t*L,r*.52,r*.48,r*.55)}
  }else if(b.shape==='stratocumulus'){
   const count=Math.max(5,Math.ceil(L/(r*.7))+1);for(let j=0;j<count;j++){const t=j/(count-1);for(let side=-1;side<=1;side++){const x=side*r*(.85+rand()*.3)+(rand()-.5)*r*.3;add(x,(rand()-.5)*r*.32,t*L+(rand()-.5)*r*.35,r*(.48+rand()*.2),r*(.4+rand()*.28),r*(.5+rand()*.16))}}
  }else{
   // A connected fan of swept strands; finite thickness is an explicit adaptation.
   for(let side=-2;side<=2;side++)for(let j=0;j<10;j++){const t=j/9,spread=side*r*.45*Math.sin(t*1.4),s=r*(.35-.12*t);add(spread,r*.3*Math.sin(t*2+side*.2)*t*Math.abs(side)/2,t*L,s,s*.82,L*.16)}
  }
  return{u,v,w,lobes,flat:b.shape==='humilis',r};
 });
 return(x,y,z)=>{x/=p.width;y/=p.height;z/=p.depth;let f=.62-Math.hypot(x,y,z);for(const a of arms){const pos=[x,y,z],u=dot(pos,a.u),v=dot(pos,a.v),w=dot(pos,a.w);let g=-100;for(const [cx,cy,cz,rx,ry,rz,s]of a.lobes){const dx=(u-cx)/rx,dy=(v-cy)/ry,dz=(w-cz)/rz;g=merge(g,(1-Math.sqrt(dx*dx+dy*dy+dz*dz))*s,p.blend*.35)}if(a.flat)g=Math.min(g,v+a.r*.42);f=merge(f,g,p.blend*.65)}const n=Math.sin(x*9+p.seed*.1)*Math.sin(y*10)*Math.sin(z*9+1);return f+p.detail*.16*n};
}

