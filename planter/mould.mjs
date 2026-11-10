import Module from '../vendor/manifold/manifold.js';
export const mouldDefaults={wall:6,flange:12,overlap:2.5,pourRadius:20,rotation:0,pinClearance:.2};
export async function buildMould(model,options={},progress=()=>{}){
 const o={...mouldDefaults,...options},s=model.settings,p=model.profile,t=o.wall,H=s.hgen;
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
  const base=rev([[0,H],[s.dtop+o.flange,H],[s.dtop+o.flange,H+t],[0,H+t]]);
  let core=keep(cavity.add(base));
  if(o.flange<=t)throw Error('La pestaña exterior debe superar el espesor del molde.');
  if(o.overlap>0)core=keep(core.add(rev([[s.dtop+t,H-o.overlap],[s.dtop+o.flange,H-o.overlap],[s.dtop+o.flange,H],[s.dtop+t,H]])));
  const innerOffset=t*Math.hypot(1,p.slope),r0=p.innerFloor+p.slope*t-innerOffset,r1=p.innerTop-innerOffset;
  if(Math.min(r0,r1)<=1)throw Error('El núcleo no admite este espesor.');
  const hollow=rev([[0,p.hFondo+t],[r0,p.hFondo+t],[r1,H],[r1,H+t+1],[0,H+t+1]]);
  core=keep(core.subtract(hollow));
  const bores=[];for(let i=0;i<3;i++){const a=(s.holeAngle+i*120)*Math.PI/180;bores.push(cylinder(s.holeRadius+o.pinClearance,p.hFondo-1,H+t+1,p.actualPitch*Math.cos(a),p.actualPitch*Math.sin(a)));}
  core=keep(core.subtract(keep(M.union(bores))));
  // Exterior envelope is independent of the textured cavity. Boolean subtraction
  // uses the final displayed planter mesh, preserving every chamfer and fillet.
  const envelope=rev([[o.pourRadius,-t],[s.dbott+t,-t],[s.dbott+t,0],[s.dtop+t,H-t-o.overlap],[s.dtop+o.flange,H-t-o.overlap],[s.dtop+o.flange,H-o.overlap],[s.dtop+t,H-o.overlap],[s.dtop+t,H],[0,H],[0,0],[o.pourRadius,0]]);
  let shell=keep(envelope.subtract(vase));shell=keep(shell.subtract(cavityBlank));
  const drainVoids=[];for(let i=0;i<3;i++){const a=(s.holeAngle+i*120)*Math.PI/180;drainVoids.push(cylinder(s.holeRadius+o.pinClearance,-t-1,p.hFondo+1,p.actualPitch*Math.cos(a),p.actualPitch*Math.sin(a)));}
  shell=keep(shell.subtract(keep(M.union(drainVoids))));
  const parts=[output(core,'00-nucleo',0xd9b844,[0,1,0])];
  for(let i=0;i<3;i++){
   progress('Separando sector '+(i+1)+' / 3…');
   const a=(o.rotation+i*120)*Math.PI/180,b=a+2*Math.PI/3,mid=(a+b)/2;
   const half=keep(shell.trimByPlane([-Math.sin(a),0,Math.cos(a)],0));
   const sector=keep(half.trimByPlane([Math.sin(b),0,-Math.cos(b)],0));
   parts.push(output(sector,'0'+(i+1)+'-exterior',[0x6688df,0xc979aa,0x75af87][i],[Math.cos(mid),0,Math.sin(mid)]));
  }
  return {parts,options:o,settings:s};
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
