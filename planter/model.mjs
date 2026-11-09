import Module from '../vendor/manifold/manifold.js';
import {makePattern} from './patterns.mjs';
export const defaults={dtop:50,dbott:40,hgen:100,barthck:5,thick:8,setback:8,hbump:8,fillet:1,chamfer:3,holeRadius:2.5,pitchRadius:13.5,holeAngle:-90,clearance:.5,texStep:1,restStep:4,textureOn:true,kind:'reaction',textureSize:120,scale:6,detail:4,seed:1,contrast:1,level:.5,bevel:1,invert:false,rdPreset:'coral',feed:.0545,kill:.062,grid:128,steps:6000,vwrap:false,spiralColumns:24,spiralTurns:10,spiralAngle:30,spiralOrigin:0,spiralVariation:.08,spiralGap:.06,spiralDirection:1};
export const presets={coral:[.0545,.062],maze:[.029,.057],spots:[.035,.065],worms:[.078,.061]};
export function profile(s){
 const wallHeight=s.hgen-2*s.barthck;
 if(wallHeight<=1)throw Error('La altura debe superar dos veces el espesor de las bandas.');
 const slope=(s.dtop-s.dbott)/wallHeight,radialThick=s.thick*Math.hypot(1,slope);
 const outerBottom=s.dbott-s.setback,outerTop=s.dtop-s.setback,innerBottom=outerBottom-radialThick,innerTop=outerTop+slope*s.barthck-radialThick;
 if(Math.min(innerBottom,innerTop)<=1)throw Error('Retranqueo + thick dejan sin espacio interior. Aumenta los radios o reduce esos valores.');
 if(innerTop>=s.dtop-.2)throw Error('La inclinación y el espesor dejan la banda superior sin material.');
 const pitchMax=innerBottom-s.holeRadius-s.clearance,pitchMin=(2*s.holeRadius+s.clearance)/Math.sqrt(3);
 if(pitchMax<pitchMin)throw Error('Las tres perforaciones no caben con ese radio y separación.');
 const actualPitch=Math.max(pitchMin,Math.min(pitchMax,s.pitchRadius));
 return {wallHeight,slope,radialThick,outerBottom,outerTop,innerBottom,innerTop,pitchMax,pitchMin,actualPitch,points:[[0,0],[s.dbott,0],[s.dbott,s.barthck],[outerBottom,s.barthck],[outerTop,s.hgen-s.barthck],[s.dtop,s.hgen-s.barthck],[s.dtop,s.hgen],[innerTop,s.hgen],[innerBottom,s.barthck],[0,s.barthck]]};
}

// The bump is generated on the complete sharp exterior wall. Fixed chamfer
// supports are unioned by radial maximum, without scaling or smoothing the map.
export function supportData(s){
 const p=profile(s),length=Math.hypot(p.wallHeight,s.dtop-s.dbott),dy=p.wallHeight/length,dr=(s.dtop-s.dbott)/length,c=s.chamfer;
 if(c>Math.min(s.setback+1e-7,length*.45))throw Error('Los chaflanes no caben: reduce su medida o aumenta el retranqueo.');
 return {p,c,dy,dr};
}
export function supportRadius(s,y,data=supportData(s)){
 const {p,c,dy,dr}=data;if(!c)return -Infinity;
 const bottom=y-s.barthck,top=s.hgen-s.barthck-y;
 if(bottom>=-1e-7&&bottom<=c*dy)return p.outerBottom+c+(dr-1)*bottom/dy;
 if(top>=-1e-7&&top<=c*dy)return p.outerTop+c-(dr+1)*top/dy;
 return -Infinity;
}
export function roundedProfile(s,showSupports=true){
 const {p,c,dy,dr}=supportData(s),out=[],points=p.points;
 const add=(q,w=0)=>out.push({r:q[0],y:q[1],weight:w});
 for(let i=0;i<points.length;i++){
  const b=points[i];
  if(i===3){
   if(showSupports&&c){add([b[0]+c,b[1]]);add([b[0]+dr*c,b[1]+dy*c],1);}
   else {add(b,1);if(c)add([b[0]+dr*c,b[1]+dy*c],1);}
   continue;
  }
  if(i===4){
   if(c)add([b[0]-dr*c,b[1]-dy*c],1);
   if(showSupports&&c)add([b[0]+c,b[1]]);else add(b,1);
   continue;
  }
  if(i!==6||!s.fillet){add(b);continue;}
  const a=points[i-1],next=points[i+1],la=Math.hypot(a[0]-b[0],a[1]-b[1]),lc=Math.hypot(next[0]-b[0],next[1]-b[1]);
  const u=[(a[0]-b[0])/la,(a[1]-b[1])/la],v=[(next[0]-b[0])/lc,(next[1]-b[1])/lc],half=Math.acos(u[0]*v[0]+u[1]*v[1])/2,trim=s.fillet/Math.tan(half);
  if(trim>Math.min(la,lc)*.95)throw Error('El filete superior no cabe en la banda. Reduce su radio.');
  const start=[b[0]+u[0]*trim,b[1]+u[1]*trim],end=[b[0]+v[0]*trim,b[1]+v[1]*trim],bis=[u[0]+v[0],u[1]+v[1]],bn=Math.hypot(...bis),dist=s.fillet/Math.sin(half),center=[b[0]+bis[0]/bn*dist,b[1]+bis[1]/bn*dist];
  const aa=Math.atan2(start[1]-center[1],start[0]-center[0]),ab=Math.atan2(end[1]-center[1],end[0]-center[0]);let delta=ab-aa;
  while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
  const n=Math.max(8,Math.ceil(Math.abs(delta)*s.fillet/Math.min(s.restStep,.5)));
  for(let j=0;j<=n;j++){const angle=aa+delta*j/n;add([center[0]+s.fillet*Math.cos(angle),center[1]+s.fillet*Math.sin(angle)]);}
 }
 return out;
}

// Indexed rings share their boundary vertices; zipper strips connect different
// sampling counts without introducing T-junctions between the two zones.
export function revolve(s,sample=()=>0){
 const p=profile(s),support=supportData(s),pos=[],faces=[],rings=[],lookup=new Map();let texturedFaces=0;
 function vertex(x,y,z){const key=[x,y,z].map(v=>Math.round(v*1e7)).join(',');if(lookup.has(key))return lookup.get(key);const i=pos.length/3;lookup.set(key,i);pos.push(x,y,z);return i;}
 function count(r,step){return r<1e-8?1:Math.max(16,4*Math.ceil(2*Math.PI*r/step/4));}
 function ring(r,y,n,textured=false,weight=1,override=null){const ids=[];for(let i=0;i<n;i++){const u=i/n,a=2*Math.PI*u,bump=textured&&s.textureOn?weight*s.hbump*sample(u,(s.hgen-s.barthck-y)/p.wallHeight):0,rad=override?override(u):(textured?Math.max(r+bump,supportRadius(s,y,support)):r);ids.push(vertex(rad*Math.cos(a),y,rad*Math.sin(a)));}const q={ids,n,r,y,textured};rings.push(q);return q;}
 function tri(a,b,c,isTex){if(a===b||b===c||a===c)return;faces.push(a,b,c);if(isTex)texturedFaces++;}
 function join(a,b,isTex){
  if(a.n===1){for(let i=0;i<b.n;i++)tri(a.ids[0],b.ids[i],b.ids[(i+1)%b.n],isTex);return;}
  if(b.n===1){for(let i=0;i<a.n;i++)tri(a.ids[i],b.ids[0],a.ids[(i+1)%a.n],isTex);return;}
  let i=0,j=0;while(i<a.n||j<b.n){const ai=a.ids[i%a.n],bj=b.ids[j%b.n];if((i+1)/a.n<(j+1)/b.n-1e-10){tri(ai,bj,a.ids[(i+1)%a.n],isTex);i++;}else if((j+1)/b.n<(i+1)/a.n-1e-10){tri(ai,bj,b.ids[(j+1)%b.n],isTex);j++;}else{tri(ai,bj,a.ids[(i+1)%a.n],isTex);tri(a.ids[(i+1)%a.n],bj,b.ids[(j+1)%b.n],isTex);i++;j++;}}
 }
 const nt=count(Math.max(s.dtop,s.dbott),s.texStep),path=roundedProfile(s,false);
 let prev=ring(0,0,1);
 for(let edge=0;edge<path.length-1;edge++){
  const a=path[edge],b=path[edge+1],textured=a.weight===1&&b.weight===1,steps=Math.max(1,Math.ceil(Math.hypot(b.r-a.r,b.y-a.y)/(textured?s.texStep:s.restStep)));
  for(let k=1;k<=steps;k++){
   const t=k/steps,r=a.r+(b.r-a.r)*t,y=a.y+(b.y-a.y)*t,w=k===steps?b.weight:(textured?1:0);
   const boundary=w===1;
   // Keep each horizontal band monotone even when the union moves the wall root outward.
   let override=null;
   if(Math.abs(a.y-b.y)<1e-8&&(a.weight===1||b.weight===1)){
    const root=a.weight===1?a:b,rootRadius=u=>Math.max(root.r+(s.textureOn?s.hbump*sample(u,(s.hgen-s.barthck-root.y)/p.wallHeight):0),supportRadius(s,root.y,support));
    override=u=>a.weight===1?rootRadius(u)*(1-t)+b.r*t:a.r*(1-t)+rootRadius(u)*t;
   }
   const q=ring(r,y,boundary?nt:count(r,s.restStep),boundary,1,override);join(prev,q,textured);prev=q;
  }
 }
 join(prev,rings[0],false);
 return {positions:new Float32Array(pos),indices:new Uint32Array(faces),profile:p,texturedFaces,plainFaces:faces.length/3-texturedFaces,nt,rows:Math.ceil(Math.hypot(p.wallHeight,s.dtop-s.dbott)/s.texStep)};
}

let ready;
export async function build(input,progress=()=>{}){
 const s={...defaults,...input},p=profile(s),circumference=Math.PI*(p.outerBottom+p.outerTop),height=Math.hypot(p.wallHeight,s.dtop-s.dbott);
 progress('Generando textura…');
 const pattern=makePattern({...s,diameter:circumference/Math.PI,height},progress);
 progress('Revolucionando perfil y aplicando hbump…');const raw=revolve(s,pattern.sample);
 const api=await(ready??=Module());api.setup();const {Manifold,Mesh}=api,owned=[],keep=m=>(owned.push(m),m);
 try{
  let solid=keep(new Manifold(new Mesh({numProp:3,vertProperties:raw.positions,triVerts:raw.indices,faceID:Uint32Array.from({length:raw.indices.length/3},(_,i)=>i)})));
  if(solid.status()!=='NoError')throw Error('No se pudo cerrar la revolución: '+solid.status());
  progress('Abriendo las tres perforaciones de drenaje…');const holes=[];
  for(let i=0;i<3;i++){const a=(s.holeAngle+i*120)*Math.PI/180,n=Math.max(32,4*Math.ceil(2*Math.PI*s.holeRadius/Math.min(s.restStep,.5)/4));const cyl=keep(Manifold.cylinder(s.barthck+2,s.holeRadius,s.holeRadius,n));const rotated=keep(cyl.rotate([-90,0,0]));holes.push(keep(rotated.translate([p.actualPitch*Math.cos(a),-1,p.actualPitch*Math.sin(a)])));}
  const cutters=keep(Manifold.union(holes));solid=keep(solid.subtract(cutters));
  if(solid.status()!=='NoError'||solid.isEmpty())throw Error('No se pudo finalizar la base perforada.');
  const m=solid.getMesh(),positions=new Float32Array(m.numVert*3);for(let i=0;i<m.numVert;i++)for(let k=0;k<3;k++)positions[3*i+k]=m.vertProperties[i*m.numProp+k];
  const bb=solid.boundingBox(),parts=solid.decompose(),components=parts.length;parts.forEach(m=>m.delete());
  return {positions,indices:new Uint32Array(m.triVerts),volume:solid.volume(),dimensions:bb.max.map((v,i)=>v-bb.min[i]),components,profile:p,pattern:{data:pattern.data,width:pattern.width,height:pattern.height},meshInfo:{texturedFaces:raw.texturedFaces,plainFaces:raw.plainFaces,around:raw.nt,rows:raw.rows},settings:s};
 }finally{owned.reverse().forEach(m=>m.delete());}
}
