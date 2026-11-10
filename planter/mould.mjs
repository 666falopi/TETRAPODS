import Module from '../vendor/manifold/manifold.js';
export const mouldDefaults={wall:3,conformal:true,skin:5,skinStep:1,flangeThick:4,windows:true,windowMargin:1,density:2.1,flangeEars:true,rimClearance:3,flange:15,overlap:2.5,pourRadius:20,rotation:0,pinClearance:.2,joints:true,bolt:6,boltClearance:.4,finThick:3,boltSpacing:70,boltEnd:20,keyRadius:2.5,keyHeight:1.5,keyClearance:.2,tongueWidth:10,tongueLength:8,tongueDepth:1.5};
export const boltSizes=[4,5,6];
// Loads from the fresh mortar (cement + sand + water), poured inverted so the column is the planter height.
// Vibrated mortar behaves like a liquid: hydrostatic pressure p = rho·g·h, times a 1.5 factor for tapping.
// Allowable stress 10 MPa: conservative for printed PLA/PETG loaded across layers (bulk is ~40–60 MPa).
export const ALLOW_MPA=10,VIB=1.5;
export function mouldLoads(model,o){
 const s=model.settings,rho=(o.density??2.1)*1000,g=9.81,H=s.hgen/1000,r=Math.max(s.dtop,s.dbott)/1000,t=(o.conformal?o.skin:o.wall)/1000;
 const kg=(model.volume||0)*1e-9*rho,p=VIB*rho*g*H,hoop=p*r/t/1e6;
 const seam=VIB*rho*g*r*H*H/2,bolts=Math.max(1,o._nBolts||2),perBolt=seam/bolts;
 const e=o.flange/2/1000,b=Math.max(2*e,(boltHead[o.bolt]||10)/1000),tf=o.finThick/1000,fin=6*perBolt*e/(b*tf*tf)/1e6;
 return {kg,pKPa:p/1000,hoopMPa:hoop,sfWall:ALLOW_MPA/hoop,seamN:seam,perBoltN:perBolt,finMPa:fin,sfFin:ALLOW_MPA/fin};
}
// Bolt head diameters (socket head / hex across flats): M4 7, M5 8.5, M6 10 mm.
export const boltHead={4:7,5:8.5,6:10};
// Minimum radial flange (and seam fin) width: the bolt head plus 2 mm each side, and room for a core key.
export const minJointWidth=o=>Math.max(boltHead[o.bolt]+4,2*(o.keyRadius+o.keyClearance)+6,o.bolt+o.boltClearance+6);
// Conformal skin: outer surface of the planter offset by a sphere of radius `skin` (exact offset sampled on
// a cylindrical grid). For every grid ray (angle θ, height y) R = max over surface samples P of
// rP·cosΔθ + sqrt(skin² − (rP·sinΔθ)² − Δy²). Surface samples: every triangle subdivided to ≤ step/2,
// so flat bands with long triangles offset as accurately as the texture.
export function skinRadii(model,skin,y0,y1,step){
 const P=model.positions,ix=model.indices,rMax=Math.max(model.settings.dtop,model.settings.dbott)+skin;
 const nt=Math.max(64,Math.ceil(2*Math.PI*rMax/step/4)*4),ny=Math.max(2,Math.ceil((y1-y0)/step)),dy=(y1-y0)/ny,dth=2*Math.PI/nt;
 const R=new Float32Array(nt*(ny+1)),s2=skin*skin,h=step/2;
 const splat=(x,y,z)=>{if(y<y0-skin||y>y1+skin)return;const r=Math.hypot(x,z);if(r<1e-6)return;const th=Math.atan2(z,x),half=Math.asin(Math.min(1,skin/r));
  const i0=Math.ceil((th-half)/dth),i1=Math.floor((th+half)/dth),j0=Math.max(0,Math.ceil((y-skin-y0)/dy)),j1=Math.min(ny,Math.floor((y+skin-y0)/dy));
  for(let i=i0;i<=i1;i++){const d=i*dth-th,c=Math.cos(d);if(c<=0)continue;const sh=r*Math.sin(d),q=s2-sh*sh;if(q<0)continue;const ii=((i%nt)+nt)%nt;
   for(let j=j0;j<=j1;j++){const e=y0+j*dy-y,w=q-e*e;if(w<0)continue;const v=r*c+Math.sqrt(w),k=j*nt+ii;if(v>R[k])R[k]=v;}}};
 for(let f=0;f<ix.length;f+=3){const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3;
  const L=Math.max(Math.hypot(P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2]),Math.hypot(P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]),Math.hypot(P[c]-P[b],P[c+1]-P[b+1],P[c+2]-P[b+2])),n=Math.max(1,Math.ceil(L/h));
  for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const wa=1-(u+v)/n,wb=u/n,wc=v/n;splat(wa*P[a]+wb*P[b]+wc*P[c],wa*P[a+1]+wb*P[b+1]+wc*P[c+1],wa*P[a+2]+wb*P[b+2]+wc*P[c+2]);}}
 // Rows below the planter base that no sample reaches (skin ≤ base thickness): copy the row above.
 for(let j=ny-1;j>=0;j--)for(let i=0;i<nt;i++)if(!(R[j*nt+i]>0))R[j*nt+i]=R[(j+1)*nt+i];
 return {R,nt,ny,y0,dy,dth};
}
function skinMesh({R,nt,ny,y0,dy,dth},pad){
 const pos=new Float32Array((nt*(ny+1)+2)*3),tri=[];
 for(let j=0;j<=ny;j++)for(let i=0;i<nt;i++){let r=R[j*nt+i];if(!(r>0))throw Error('Cáscara: hay zonas sin superficie del macetero cerca.');r+=pad;const k=(j*nt+i)*3;pos[k]=r*Math.cos(i*dth);pos[k+1]=y0+j*dy;pos[k+2]=r*Math.sin(i*dth);}
 const bc=nt*(ny+1),tc=bc+1;pos.set([0,y0,0],bc*3);pos.set([0,y0+ny*dy,0],tc*3);
 const id=(i,j)=>j*nt+(i%nt);
 for(let j=0;j<ny;j++)for(let i=0;i<nt;i++){const a=id(i,j),b=id(i+1,j),c=id(i+1,j+1),d=id(i,j+1);tri.push(a,c,b,a,d,c);}
 for(let i=0;i<nt;i++){tri.push(bc,id(i,0),id(i+1,0));tri.push(tc,id(i+1,ny),id(i,ny));}
 return {pos,tri:new Uint32Array(tri)};
}
export async function buildMould(model,options={},progress=()=>{}){
 const o={...mouldDefaults,...options},s=model.settings,p=model.profile,t=o.wall,ft=o.flangeThick,H=s.hgen,tR=o.conformal?Math.max(t,o.skin):t;
 if(![20,50,100].includes(o.pourRadius))throw Error('Radio de vertido inválido.');
 if(o.pourRadius>=s.dbott-2)throw Error('El radio de vertido debe ser menor que el radio inferior del macetero menos 2 mm. Aumenta el macetero o reduce la abertura.');
 const api=await Module();api.setup();const {Manifold:M,Mesh}=api,owned=[],keep=x=>(owned.push(x),x);
 const rev=points=>keep(keep(M.revolve([points],192)).rotate([-90,0,0]));
 const cylinder=(radius,lo,hi,x=0,z=0)=>keep(keep(keep(M.cylinder(hi-lo,radius,radius,64)).rotate([-90,0,0])).translate([x,lo,z]));
 const output=(solid,name,color,direction)=>{
  if(solid.status()!=='NoError'||solid.isEmpty())throw Error('Geometría inválida: '+name);
  const parts=solid.decompose();const count=parts.length;parts.forEach(x=>x.delete());if(count!==1)throw Error(name+': piezas desconectadas; revisa las medidas.');
  const m=solid.getMesh(),positions=new Float32Array(m.numVert*3);for(let i=0;i<m.numVert;i++)positions.set(m.vertProperties.slice(i*m.numProp,i*m.numProp+3),i*3);
  return {name,color,direction,positions,indices:new Uint32Array(m.triVerts),volume:solid.volume()};
 };
 try{
  progress('Copiando el negativo exacto del macetero…');
  const vase=keep(new M(new Mesh({numProp:3,vertProperties:model.positions,triVerts:model.indices})));
  const cavityBlank=rev([[0,p.hFondo-.1],[p.innerFloor+.2,p.hFondo-.1],[p.innerTop+.2,H],[0,H]]);
  const cavity=keep(cavityBlank.subtract(vase));
  const base=rev([[0,H],[s.dtop+tR+o.flange,H],[s.dtop+tR+o.flange,H+ft],[0,H+ft]]);
  let core=keep(cavity.add(base));
  if(o.flange<=0)throw Error('La pestaña exterior debe ser mayor que cero.');
  const joints=o.joints!==false,flangeW=o.flange,hole=(o.bolt+o.boltClearance)/2,rB=s.dtop+tR+flangeW/2,ov=o.overlap,h=o.keyHeight,c=o.keyClearance,kTip=Math.max(.5,o.keyRadius-h);
  if(joints){
   if(!boltSizes.includes(o.bolt))throw Error('Perno inválido: usa M4, M5 o M6.');
   if(flangeW<minJointWidth(o))throw Error('La cabeza del perno M'+o.bolt+' (Ø'+boltHead[o.bolt]+' mm) no cabe: sube la pestaña exterior radial a '+Math.ceil(minJointWidth(o))+' mm o más.');
   if(h+c+1>ft)throw Error('El pin del núcleo es más alto que la pestaña: bájalo o sube el espesor de pestaña.');
   if(o.tongueDepth+c+1>o.finThick)throw Error('La lengüeta es más profunda que la aleta: baja la profundidad o sube el espesor de aleta.');
   if(o.tongueWidth>flangeW-4)throw Error('La lengüeta no cabe en la aleta: ancho máximo '+(flangeW-4)+' mm.');
   if(o.tongueWidth-2*o.tongueDepth<1)throw Error('La lengüeta es muy angosta para su profundidad (flancos a 45°).');
  }
  if(o.overlap>0)core=keep(core.add(rev([[s.dtop+t,H-o.overlap],[s.dtop+tR+o.flange,H-o.overlap],[s.dtop+tR+o.flange,H],[s.dtop+t,H]])));
  const innerOffset=t*Math.hypot(1,p.slope),r0=p.innerFloor+p.slope*t-innerOffset,r1=p.innerTop-innerOffset;
  if(Math.min(r0,r1)<=1)throw Error('El núcleo no admite este espesor.');
  const hollow=rev([[0,p.hFondo+t],[r0,p.hFondo+t],[r1,H],[r1,H+ft+1],[0,H+ft+1]]);
  core=keep(core.subtract(hollow));
  const bores=[];for(let i=0;i<3;i++){const a=(s.holeAngle+i*120)*Math.PI/180;bores.push(cylinder(s.holeRadius+o.pinClearance,p.hFondo-1,H+ft+1,p.actualPitch*Math.cos(a),p.actualPitch*Math.sin(a)));}
  core=keep(core.subtract(keep(M.union(bores))));
  // Exterior envelope is independent of the textured cavity. Boolean subtraction
  // uses the final displayed planter mesh, preserving every chamfer and fillet.
  const envelope=rev([[o.pourRadius,-t],[s.dbott+t,-t],[s.dbott+t,0],[s.dtop+t,H-ft-o.overlap],[s.dtop+t+o.flange,H-ft-o.overlap],[s.dtop+t+o.flange,H-o.overlap],[s.dtop+t,H-o.overlap],[s.dtop+t,H],[0,H],[0,0],[o.pourRadius,0]]);
  // Seam fins: one radial plate per parting plane, split in two halves (one per sector).
  const rEnv=y=>y<=0?s.dbott+tR:y>=H-ft-ov?s.dtop+tR:s.dbott+tR+(s.dtop-s.dbott)*y/(H-ft-ov);
  const seamAngles=[0,1,2].map(i=>o.rotation+i*120),hardware={seamBolts:0,coreBolts:0,keys:0,boltLengthSeam:0,boltLengthCore:0};
  const atSeam=(solid,deg)=>keep(solid.rotate([0,-deg,0]));
  let blank=envelope,seamBoltY=[],seamKeyY=[],flangeTrim=null;
  if(o.conformal){
   // Conformal shell: skin offset of the planter from the base (y = −t) to the flange top, plus the flange
   // ring and the rim step. Everything inside the skin is solid here; the planter and the core cavity are
   // subtracted later, which leaves exactly `skin` mm around the planter. Pour opening cut through the base.
   progress('Calculando cáscara de '+o.skin+' mm que sigue la textura…');
   if(o.skin<1)throw Error('La cáscara debe tener al menos 1 mm.');
   const sk=skinMesh(skinRadii(model,o.skin,-t,H-ov,o.skinStep),.05),skinSolid=keep(new M(new Mesh({numProp:3,vertProperties:sk.pos,triVerts:sk.tri})));
   if(skinSolid.status()!=='NoError'||skinSolid.volume()<=0)throw Error('No se pudo cerrar la cáscara conforme.');
   const F=s.dtop+tR+o.flange,flangeRing=rev([[s.dtop+t,H-ft-ov],[F,H-ft-ov],[F,H-ov],[s.dtop+t,H-ov]]),step=rev([[0,H-ov-.5],[s.dtop+t,H-ov-.5],[s.dtop+t,H],[0,H]]);
   blank=keep(keep(M.union([skinSolid,flangeRing,step])).subtract(cylinder(o.pourRadius,-t-1,.5)));
  }
  if(joints){
   progress('Añadiendo aletas, pernos y llaves…');
   const rf=o.pourRadius+.5,fin=o.conformal?[[rf,-t],[s.dbott+tR+flangeW,-t],[s.dbott+tR+flangeW,0],[s.dtop+tR+flangeW,H-ft-ov],[s.dtop+tR+flangeW,H-ov],[rf,H-ov]]:[[s.dbott+t-1,-t],[s.dbott+t+flangeW,-t],[s.dbott+t+flangeW,0],[s.dtop+t+flangeW,H-ft-ov],[s.dtop+t+flangeW,H-ov],[s.dtop+t-1,H-ov],[s.dtop+t-1,H-ft-ov],[s.dbott+t-1,0]];
   const finSolid=keep(keep(M.extrude([fin],2*o.finThick)).translate([0,0,-o.finThick]));
   const fins=seamAngles.map(a=>atSeam(finSolid,a));
   const m=Math.max(o.boltEnd,hole+5),y0=-t+m,y1=H-ov-m;if(y1-y0<20)throw Error('Los pernos de las aletas quedan muy juntos: baja la distancia a los extremos.');const n=Math.max(2,Math.round((y1-y0)/o.boltSpacing)+1);
   for(let j=0;j<n;j++)seamBoltY.push(y0+j*(y1-y0)/(n-1));
   // Fin cut-back: between two bolts the fin is removed down to a small lip on the wall. Each bolt keeps an
   // ear whose edges run at 45° (prints upright without supports); the ear still covers the bolt head.
   // Tongues sit on the outer side of the end bolts (below the lowest, above the highest).
   const gapM=1.5,TL=o.tongueLength,headR=boltHead[o.bolt]/2+1,lip=o.windowMargin,W=flangeW,windows=[];
   const kLo=seamBoltY[0]-hole-gapM-TL/2,kHi=seamBoltY[n-1]+hole+gapM+TL/2;
   if(kLo-TL/2<-t+1||kHi+TL/2>H-ov-1)throw Error('No caben las lengüetas fuera de los pernos: sube la distancia de pernos a los extremos.');
   seamKeyY.push(kLo,kHi);
   const rise=W/2-lip+headR*Math.SQRT2;
   for(let j=0;j<n-1;j++){const yL=seamBoltY[j]+rise,yU=seamBoltY[j+1]-rise;if(o.windows&&yU-yL>=2)windows.push([yL,yU]);}
   const holes=[],finCuts=[];
   for(const [yL,yU] of windows){const rIn=y=>rEnv(y)+lip,d=W-lip+1,yl=yL-d,yu=yU+d;
    // Conformal: also clear the fin between the skin and the planter (a straight inner strip), keeping the 45° ears.
    const poly=o.conformal?[[rf-1,yL],[rIn(yL),yL],[rEnv(yl)+W+1,yl],[rEnv(yu)+W+1,yu],[rIn(yU),yU],[rf-1,yU]]:[[rIn(yL),yL],[rEnv(yl)+W+1,yl],[rEnv(yu)+W+1,yu],[rIn(yU),yU]];
    const cut=keep(keep(M.extrude([poly],4*o.finThick+2)).translate([0,0,-2*o.finThick-1]));
    for(const s0 of seamAngles)finCuts.push(atSeam(cut,s0));}
   // The cut-back removes fin only; the shell wall under it stays.
   const finsCut=finCuts.length?keep(keep(M.union(fins)).subtract(keep(M.union(finCuts)))):keep(M.union(fins));
   blank=keep(M.union([blank,finsCut]));
   hardware.windows=3*windows.length;
   for(const a of seamAngles)for(const y of seamBoltY)holes.push(atSeam(keep(keep(M.cylinder(4*o.finThick+2,hole,hole,24)).translate([rEnv(y)+flangeW/2,y,-2*o.finThick-1])),a));
   // Vertical bolts through core plate and shell flange, next to each joint: on the side of the sector that
   // starts there, far enough from the fin for the nut. The core pin goes on the other side of the joint.
   const dB=o.finThick+boltHead[o.bolt]/2+2,atJoint=(a,off,r=rB)=>{const q=a*Math.PI/180;return [r*Math.cos(q)-off*Math.sin(q),r*Math.sin(q)+off*Math.cos(q)];};
   for(const a of seamAngles){const [x,z]=atJoint(a,dB);holes.push(cylinder(hole,H-ft-ov-1,H+ft+1,x,z));}
   const allHoles=keep(M.union(holes));blank=keep(blank.subtract(allHoles));core=keep(core.subtract(allHoles));
   // Core keys: 45° cones pointing down from the core ring into each sector flange, at mid ±30°.
   const vCone=(rt,rb,height,y,[x,z])=>keep(keep(keep(M.cylinder(height,rt,rb,32)).rotate([-90,0,0])).translate([x,y,z]));
   const coreMale=[],coreFemale=[];
   for(const a of seamAngles){const r=atJoint(a,-dB);
    coreMale.push(vCone(kTip,o.keyRadius,h,H-ov-h,r),vCone(o.keyRadius,o.keyRadius,.6,H-ov,r));
    coreFemale.push(vCone(kTip+c,o.keyRadius+c,h+c+.01,H-ov-h-c,r));}
   core=keep(core.add(keep(M.union(coreMale))));blank=keep(blank.subtract(keep(M.union(coreFemale))));
   // Flange cut back to rimClearance around the planter rim, except an ear at each joint that carries
   // the vertical bolt, the core pin and the top of the fin.
   if(o.flangeEars){const rT=s.dtop+Math.max(o.rimClearance,t),half=dB+boltHead[o.bolt]/2+2;
    if(rT<s.dtop+tR+flangeW){
     const ring=rev([[rT,H-ft-ov-.01],[s.dtop+tR+flangeW+2,H-ft-ov-.01],[s.dtop+tR+flangeW+2,H+ft+1],[rT,H+ft+1]]);
     const ear=keep(keep(M.cube([s.dtop+tR+flangeW+4,H+2*ft+ov+4,2*half])).translate([0,H-2*ft-ov-2,-half]));
     const trim=keep(ring.subtract(keep(M.union(seamAngles.map(a=>atSeam(ear,a))))));
     flangeTrim=trim;core=keep(core.subtract(trim));}
    hardware.earHalf=half;}
   hardware.seamBolts=3*n;hardware.coreBolts=3;hardware.keys=3+3*seamKeyY.length;
   hardware.boltLengthSeam=Math.ceil((2*o.finThick+o.bolt+4)/5)*5;hardware.boltLengthCore=Math.ceil((2*ft+ov+o.bolt+4)/5)*5;
  }
  let shell=keep(blank.subtract(vase));shell=keep(shell.subtract(cavityBlank));if(flangeTrim)shell=keep(shell.subtract(flangeTrim));
  const drainVoids=[];for(let i=0;i<3;i++){const a=(s.holeAngle+i*120)*Math.PI/180;drainVoids.push(cylinder(s.holeRadius+o.pinClearance,-t-1,p.hFondo+1,p.actualPitch*Math.cos(a),p.actualPitch*Math.sin(a)));}
  shell=keep(shell.subtract(keep(M.union(drainVoids))));
  const parts=[output(core,'00-nucleo',0xd9b844,[0,1,0])],sectors=[];
  for(let i=0;i<3;i++){
   progress('Separando sector '+(i+1)+' / 3…');
   const a=(o.rotation+i*120)*Math.PI/180,b=a+2*Math.PI/3;
   const half=keep(shell.trimByPlane([-Math.sin(a),0,Math.cos(a)],0));
   sectors.push(keep(half.trimByPlane([Math.sin(b),0,-Math.cos(b)],0)));
  }
  if(joints){
   // Seam keys: one tongue (male) on the fin of the sector after each seam, matching pocket (female) in the
   // fin of the sector before. Flanks at 45°: neighbours separate 30° off the fin normal, so the tongue
   // releases whichever sector is pulled first. The tongue follows the slope of the wall.
   const slope=(s.dtop-s.dbott)/(H-ft-ov),tilt=-Math.atan(slope)*180/Math.PI,gap=seamBoltY.length>1?seamBoltY[1]-seamBoltY[0]:H;
   const L=Math.min(o.tongueLength,gap-2*(hole+3)),w=o.tongueWidth,d=o.tongueDepth;
   if(L<2*d+1)throw Error('No cabe la lengüeta entre pernos: sube la separación entre pernos o baja la profundidad.');
   const block=(w0,l0,z0,w1,l1,z1)=>keep(M.hull([[-w0/2,-l0/2,z0],[w0/2,-l0/2,z0],[-w0/2,l0/2,z0],[w0/2,l0/2,z0],[-w1/2,-l1/2,z1],[w1/2,-l1/2,z1],[-w1/2,l1/2,z1],[w1/2,l1/2,z1]]));
   const place=(solid,y,a)=>atSeam(keep(keep(solid.rotate([0,0,tilt])).translate([rEnv(y)+flangeW/2,y,0])),a);
   for(let i=0;i<3;i++){
    const a=seamAngles[i],male=[],female=[];
    for(const y of seamKeyY){
     male.push(place(block(w,L,.6,w-2*d,L-2*d,-d),y,a));
     female.push(place(block(w+2*c,L+2*c,.01,w-2*d,L-2*d,-d-c),y,a));}
    if(male.length){sectors[i]=keep(sectors[i].add(keep(M.union(male))));const j=(i+2)%3;sectors[j]=keep(sectors[j].subtract(keep(M.union(female))));}
   }
   hardware.tongueLength=Math.round(L);
  }
  sectors.forEach((sector,i)=>{const mid=(o.rotation+i*120+60)*Math.PI/180;parts.push(output(sector,'0'+(i+1)+'-exterior',[0x6688df,0xc979aa,0x75af87][i],[Math.cos(mid),0,Math.sin(mid)]));});
  hardware.loads=mouldLoads(model,{...o,_nBolts:seamBoltY.length});hardware.boltY=seamBoltY.slice();hardware.tR=tR;
  return {parts,options:o,settings:s,hardware};
 }finally{owned.reverse().forEach(x=>x.delete());}
}

// Local face draft relative to the radial pull of each 120-degree sector.
// This does not certify a collision-free extraction trajectory.
export function draftGroups(model,rotation=0){
 const {positions:p,indices:ix}=model,colors=new Float32Array(ix.length*3),groupColors=new Float32Array(colors.length),counts=[0,0,0],areas=[0,0,0],bad=[0,0,0],palette=[[.35,.55,1],[.85,.35,.65],[.3,.8,.5]];
 for(let f=0;f<ix.length/3;f++){
  const a=ix[f*3]*3,b=ix[f*3+1]*3,c=ix[f*3+2]*3,x=(p[a]+p[b]+p[c])/3,z=(p[a+2]+p[b+2]+p[c+2])/3;
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,L=Math.hypot(nx,ny,nz)||1;
  const theta=((Math.atan2(z,x)-rotation*Math.PI/180)%(2*Math.PI)+2*Math.PI)%(2*Math.PI),g=Math.min(2,Math.floor(theta/(2*Math.PI/3))),mid=(rotation+g*120+60)*Math.PI/180;
  const exterior=nx*x+nz*z>1e-7;
  const dot=(nx*Math.cos(mid)+nz*Math.sin(mid))/L,angle=Math.asin(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
  if(exterior){counts[g]++;areas[g]+=L/2;if(angle<0)bad[g]+=L/2;}
  const color=!exterior?[.4,.4,.4]:angle<0?[1,.05,.03]:angle<3?[1,.65,.05]:[.25,.8,.4];
  for(let k=0;k<3;k++){colors.set(color,(f*3+k)*3);groupColors.set(exterior?palette[g]:[.4,.4,.4],(f*3+k)*3);}
 }
 return {colors,groupColors,counts,areas,bad};
}

// Release check along each sector's pull direction (radial at the sector middle). For a grid of rays parallel
// to the pull, every exterior face of the sector that the ray crosses is a hit; outward along the ray, a face
// facing the pull (+) leaves concrete into mould and a face facing away (−) leaves mould into concrete. A (+)
// followed by (−) is mould trapped behind concrete: its length is how far that piece would have to flex or
// shear to come off. Rule of thumb for printed PLA/PETG against concrete with release agent: ≤ 0.2 mm usually
// releases, 0.2–0.5 mm scrapes or chips edges, > 0.5 mm locks.
export const TRAP_OK=.2,TRAP_BAD=.5;
export function releaseCheck(model,rotation=0,maxCells=250000){
 const P=model.positions,ix=model.indices,nf=ix.length/3,faceDepth=new Float32Array(nf),sectors=[];
 for(let g=0;g<3;g++){
  const a0=(rotation+g*120)*Math.PI/180,mid=a0+Math.PI/3,dx=Math.cos(mid),dz=Math.sin(mid),tx=-dz,tz=dx;
  const faces=[];let tMin=Infinity,tMax=-Infinity,yMin=Infinity,yMax=-Infinity;
  for(let f=0;f<nf;f++){const a=ix[f*3]*3,b=ix[f*3+1]*3,c=ix[f*3+2]*3,cx=(P[a]+P[b]+P[c])/3,cz=(P[a+2]+P[b+2]+P[c+2])/3;
   const th=((Math.atan2(cz,cx)-a0)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);if(th>=2*Math.PI/3)continue;
   const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,L=Math.hypot(nx,ny,nz)||1;
   if(nx*cx+nz*cz<=1e-7)continue;const nd=(nx*dx+nz*dz)/L;if(Math.abs(nd)<1e-4)continue;
   faces.push(f,nd>0?1:-1);for(const q of [a,b,c]){const t=P[q]*tx+P[q+2]*tz,y=P[q+1];if(t<tMin)tMin=t;if(t>tMax)tMax=t;if(y<yMin)yMin=y;if(y>yMax)yMax=y;}}
  const cell=Math.max(.3,Math.sqrt((tMax-tMin)*(yMax-yMin)/maxCells)),nt=Math.ceil((tMax-tMin)/cell)+1,nyc=Math.ceil((yMax-yMin)/cell)+1;
  const count=new Int32Array(nt*nyc+1);
  const raster=(fill)=>{for(let k=0;k<faces.length;k+=2){const f=faces[k],sg=faces[k+1],q=[ix[f*3]*3,ix[f*3+1]*3,ix[f*3+2]*3];
   const T=q.map(v=>(P[v]*tx+P[v+2]*tz-tMin)/cell),Y=q.map(v=>(P[v+1]-yMin)/cell),Hh=q.map(v=>P[v]*dx+P[v+2]*dz);
   const det=(Y[1]-Y[2])*(T[0]-T[2])+(T[2]-T[1])*(Y[0]-Y[2]);if(Math.abs(det)<1e-12)continue;
   const i0=Math.max(0,Math.ceil(Math.min(...T)-.5)),i1=Math.min(nt-1,Math.floor(Math.max(...T)-.5)),j0=Math.max(0,Math.ceil(Math.min(...Y)-.5)),j1=Math.min(nyc-1,Math.floor(Math.max(...Y)-.5));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const pt=i+.5,py=j+.5,l0=((Y[1]-Y[2])*(pt-T[2])+(T[2]-T[1])*(py-Y[2]))/det,l1=((Y[2]-Y[0])*(pt-T[2])+(T[0]-T[2])*(py-Y[2]))/det,l2=1-l0-l1;
    if(l0<-1e-9||l1<-1e-9||l2<-1e-9)continue;fill(j*nt+i,l0*Hh[0]+l1*Hh[1]+l2*Hh[2],sg,f);}}};
  raster(c=>count[c+1]++);for(let c=0;c<nt*nyc;c++)count[c+1]+=count[c];
  const tot=count[nt*nyc],hv=new Float32Array(tot),sv=new Int8Array(tot),fv=new Int32Array(tot),cur=count.slice(0,nt*nyc);
  raster((c,hh,sg,f)=>{const k=cur[c]++;hv[k]=hh;sv[k]=sg;fv[k]=f;});
  let cells=0,trappedCells=0,badCells=0,maxD=0;const order=[];
  for(let c=0;c<nt*nyc;c++){const s0=count[c],s1=count[c+1];if(s1===s0)continue;cells++;order.length=0;for(let k=s0;k<s1;k++)order.push(k);order.sort((p,q)=>hv[p]-hv[q]);
   let worst=0;for(let k=0;k+1<order.length;k++){const A=order[k],B=order[k+1];if(sv[A]>0&&sv[B]<0){const len=hv[B]-hv[A];if(len>1e-3){if(len>worst)worst=len;if(len>faceDepth[fv[A]])faceDepth[fv[A]]=len;if(len>faceDepth[fv[B]])faceDepth[fv[B]]=len;}}}
   if(worst>.05)trappedCells++;if(worst>TRAP_BAD)badCells++;if(worst>maxD)maxD=worst;}
  const verdict=maxD<=TRAP_OK?'ok':maxD<=TRAP_BAD?'regular':'malo';
  sectors.push({cellMM:cell,projectedMM2:cells*cell*cell,trappedMM2:trappedCells*cell*cell,badMM2:badCells*cell*cell,maxDepth:maxD,verdict});
 }
 return {sectors,faceDepth};
}
