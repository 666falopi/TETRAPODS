export const defaults={length:6,scale:2.5,ratio:2.2,tilt:38,curl:.9,peel:.55,thickness:.18,bend:.35,ripple:.025,section:.45,foam:.65,foamSize:.5,breakup:.45,trails:.35,apron:1.2,fit:.12,rise:.25};
export const ranges={length:[3,9],scale:[1.5,3.5],ratio:[1.4,3.4],tilt:[15,60],curl:[0,1],peel:[0,.85],thickness:[.08,.28],bend:[-.8,.8],ripple:[0,.06],section:[0,1],foam:[0,1],foamSize:[.2,1],breakup:[0,1],trails:[0,1],apron:[.6,2],fit:[.03,.4],rise:[.08,.5]};
export const presets={barrel:{...defaults},pitching:{...defaults,curl:.65,peel:.3,ratio:2.6,tilt:45},round:{...defaults,ratio:1.65,curl:.96,peel:.24,tilt:32},peeling:{...defaults,curl:.97,peel:.8,length:7.5,bend:.65}};
export function valid(p){return p&&Object.entries(ranges).every(([k,[a,b]])=>Number.isFinite(p[k])&&p[k]>=a&&p[k]<=b)}
// O'Dea et al. Eq. 1, parameterised by x'/L=q². Full loop: -1<=q<=1.
export function cubic(q,L,W){return[L*q*q,3*Math.sqrt(3)/4*W*q*(1-q*q)]}
const smooth=t=>t*t*(3-2*t);
const hash=i=>{const v=Math.sin(i*127.1+31.7)*43758.5453;return v-Math.floor(v)};
// Attached multi-scale lobes: an artistic whitewater surface, not a fluid solver.
function froth(p,s,t){let f=0;const count=Math.round(45/(.4+p.foamSize));for(let k=0;k<count;k++){const u=hash(k+1),v=.71+.29*hash(k+121),r=(.025+.03*hash(k+241))*(.5+p.foamSize);const ds=(s-u)*p.length/p.scale,dt=t-v;f+=Math.exp(-(ds*ds/(r*r)+dt*dt/(r*r*2)))*(.55+.45*hash(k+361));}return Math.min(1.8,f);}
function coreProfile(p,s,n=100){
 const local=Math.max(0,Math.min(1,p.curl-p.peel*(s-.2))),end=-.18+1.08*local,L=p.scale*(.88+.12*Math.sin(Math.PI*s)),W=L/p.ratio,a=p.tilt*Math.PI/180,inner=[],outer=[],weights=[],innerWeights=[];
 const raw=(t,out=false)=>{const q=-1+(end+1)*t,[x,y]=cubic(q,L,W),dx=2*L*q,dy=3*Math.sqrt(3)/4*W*(1-3*q*q),norm=Math.hypot(dx,dy),nz=(dy*Math.cos(a)-dx*Math.sin(a))/norm,ny=(-dy*Math.sin(a)-dx*Math.cos(a))/norm;
 const lip=p.breakup*.065*p.scale*Math.sin(s*65+Math.sin(s*19))*Math.pow(t,14);
 const th=out?p.thickness*(1-.35*t)+p.foam*.13*p.scale*froth(p,s,t):0;
 const d=-th+p.ripple*Math.sin(s*39+t*23)*Math.sin(Math.PI*t)**2;
 return [(x-L*.5)*Math.cos(a)+y*Math.sin(a)+nz*d+lip, -(x-L)*Math.sin(a)+y*Math.cos(a)+ny*d+lip*.35];};
 const foot=raw(0),front=foot[0]+p.apron;
 // Water apron eases into the face with a horizontal tangent.
 const join=raw(.12);for(let j=0;j<24;j++){const u=j/24,ss=u*u*(1.3-.3*u);inner.push([front+(join[0]-front)*u,join[1]*ss+p.trails*.065*Math.sin(Math.PI*u)**2*(.5+.5*Math.sin(s*67+u*9))**4]);innerWeights.push(p.trails*Math.sin(Math.PI*u)**2*(.5+.5*Math.sin(s*67+u*9))**4);}
 for(let j=0;j<=n;j++){const t=.12+.88*j/n;inner.push(raw(t));innerWeights.push(p.foam*.6*froth(p,s,t)*Math.pow(t,6));}
 // Return from lip over the crest, then slope into the rear water plane.
 let turn=.4,minZ=Infinity;for(let k=0;k<=100;k++){const t=k/100,z=raw(t,true)[0];if(z<minZ){minZ=z;turn=t;}}const stop=Math.min(.9,turn+.06);const back=[];const bw=[];for(let j=0;j<=n;j++){const t=1-(1-stop)*j/n;back.push(raw(t,true));bw.push(Math.min(1,p.foam*(.35+froth(p,s,t))*smooth(Math.max(0,(t-.60)/.40))));}
 const start=back.at(-1),prev=back.at(-2),rear=-p.scale*1.25-p.apron*.45;
 const tangent=[start[0]-prev[0],start[1]-prev[1]],len=Math.hypot(...tangent),c1=[start[0]+Math.min(-.1,tangent[0]/len)*p.scale*.45,Math.max(0,start[1]+tangent[1]/len*p.scale*.45)],c2=[rear+p.scale*.35,0];
 for(let j=1;j<=40;j++){const u=j/40,v=1-u;back.push([v*v*v*start[0]+3*v*v*u*c1[0]+3*v*u*u*c2[0]+u*u*u*rear,Math.max(0,v*v*v*start[1]+3*v*v*u*c1[1])]);bw.push(0);}
 // Flat underside, shared by the complete wave and water footprint.
 back.push([rear,-p.thickness],[front,-p.thickness]);bw.push(0,0);
 outer.push(...back.slice().reverse());weights.push(...innerWeights,...bw);
 return{inner,outer,outline:[...inner,...back],weights,local,L,W};
}
// Design X runs along the crest; the second horizontal axis renders as Z.
export function footprint(p){return {front:p.scale*.5*Math.cos(p.tilt*Math.PI/180)+p.apron+Math.abs(p.bend)*.5,rear:-p.scale*1.25-p.apron*.45-Math.abs(p.bend)*.5};}
export function profile(p,s,n=100){
 const envelope=smooth(Math.min(1,Math.max(0,Math.min(s,1-s)/p.rise)));
 const pr=coreProfile({...p,curl:p.curl*envelope,peel:p.peel*envelope,foam:p.foam*envelope,breakup:p.breakup*envelope},s,n),{front,rear}=footprint(p),depth=front-rear,centre=(front+rear)/2,shrink=1-2*p.fit;
 const shift=p.bend*((2*s-1)**2-.5),top=pr.outline.slice(0,-2),N=top.length;
 const shaped=top.map(([z,h],j)=>{const flat=front-depth*j/(N-1),blend=smooth(Math.min(1,envelope/.25)),blendZ=flat*(1-blend)+(z+shift)*blend;return [centre+(blendZ-centre)*shrink,h*envelope];});
 const inner=[[front,0],...shaped.slice(0,pr.inner.length)],back=[...shaped.slice(pr.inner.length),[rear,0],[rear,-p.thickness],[front,-p.thickness]];
 const weights=[0,...pr.weights.slice(0,-2).map(w=>w*envelope),0,0,0];
 return {...pr,inner,outer:back.slice().reverse(),outline:[...inner,...back],weights,envelope};
}
export function mesh(p,nx=150,ny=100){
 const vertices=[],faces=[],foam=[],rings=[];
 const half=p.length/2,inside=half*(1-2*p.fit);
 rings.push({x:-half,s:0});for(let i=0;i<=nx;i++)rings.push({x:(i/nx*2-1)*inside,s:i/nx});rings.push({x:half,s:1});
 let stride;for(const {x,s}of rings){const pr=profile(p,s,ny);stride=pr.outline.length;for(let j=0;j<stride;j++){const[z,y]=pr.outline[j];vertices.push([x,y,z]);foam.push(pr.weights[j]);}}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<stride;j++){const k=(j+1)%stride,a=i*stride+j,b=i*stride+k,c=(i+1)*stride+j,d=(i+1)*stride+k;faces.push([a,c,b],[b,c,d]);}
 // Flat end caps retain every boundary vertex, including the water top.
 for(const i of [0,rings.length-1]){const off=i*stride,frontBottom=off+stride-1,rearBottom=off+stride-2;for(let j=0;j<stride-3;j++)faces.push(i===0?[frontBottom,off+j,off+j+1]:[frontBottom,off+j+1,off+j]);faces.push(i===0?[frontBottom,off+stride-3,rearBottom]:[frontBottom,rearBottom,off+stride-3]);}
 let volume=0;for(const [i,j,k]of faces){const a=vertices[i],b=vertices[j],c=vertices[k];volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}if(volume<0)for(const f of faces)[f[1],f[2]]=[f[2],f[1]];return{vertices,faces,foam,volume:Math.abs(volume)};
}
export function stl(m,mm){const out=new ArrayBuffer(84+50*m.faces.length),v=new DataView(out),scale=mm/(Math.max(...m.vertices.map(v=>v[0]))-Math.min(...m.vertices.map(v=>v[0])));v.setUint32(80,m.faces.length,true);m.faces.forEach((f,i)=>{const [a,b,c]=f.map(k=>m.vertices[k]),u=b.map((x,k)=>x-a[k]),w=c.map((x,k)=>x-a[k]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n)||1,o=84+50*i;n.forEach((x,k)=>v.setFloat32(o+4*k,x/l,true));[...a,...b,...c].forEach((x,k)=>v.setFloat32(o+12+4*k,x*scale,true))});return out}
