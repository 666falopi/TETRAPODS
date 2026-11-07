export const defaults={size:140,thickness:2,count:32,side:.85,reach:28,coreWidth:84,coreHeight:32,width:12,fork:.85,flow:.12,seed:12,noise:1.2,noiseScale:8,noiseDetail:2,resolution:128};
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
// Smooth seeded 3D value noise, sampled in physical millimetres.
function noise3(x,y,z,seed){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),smooth=t=>t*t*(3-2*t),u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz),hash=(a,b,c)=>{let h=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^Math.imul(seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};let value=0;for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++)value+=hash(ix+i,iy+j,iz+k)*(i?u:1-u)*(j?v:1-v)*(k?w:1-w);return value;}
export function build(s){
 const rand=rng(s.seed),segs=[],scale=s.size/140,wall=s.thickness/scale,add=(a,b,r,r1=r)=>segs.push({a,b,r,r1});
 const core=[(s.coreWidth??84)/2,(s.coreHeight??32)/2,(s.coreWidth??84)*.36],cy=core[1]*.65;
 for(let k=0;k<s.count;k++){
  const angle=k*2.3999632297,layer=(k+.5)/s.count,c=.97-(.42+(s.side??.85))*layer,u=Math.sqrt(1-c*c),root=[core[0]*u*.96*Math.cos(angle),cy+core[1]*c*.96,core[2]*u*.96*Math.sin(angle)],bend=angle+s.flow;
  const normal=[u*Math.cos(bend)/core[0],Math.max(.06,c)/core[1],u*Math.sin(bend)/core[2]],len=Math.hypot(...normal);for(let i=0;i<3;i++)normal[i]/=len;
  const length=s.reach*(.86+rand()*.24),tip=[root[0]+normal[0]*length,root[1]+normal[1]*length+6,root[2]+normal[2]*length],height=tip[1],mid=[root[0]+normal[0]*length*.55,root[1]+normal[1]*length*.36+1,root[2]+normal[2]*length*.55],r=s.width/2*(.85+rand()*.25);
  let prev=root;for(let j=1;j<=6;j++){let t=j/6,p=root.map((v,i)=>(1-t)*(1-t)*v+2*(1-t)*t*mid[i]+t*t*tip[i]);add(prev,p,r*(1-.23*(j-1)/6),r*(1-.23*t));prev=p;}
  if(rand()<s.fork)for(const sign of [-1,1]){const t=.48+rand()*.15,start=root.map((v,i)=>(1-t)*(1-t)*v+2*(1-t)*t*mid[i]+t*t*tip[i]),a=bend+sign*(.22+rand()*.2),end=[tip[0]+7*Math.cos(a),height-3+rand()*4,tip[2]+7*Math.sin(a)],control=start.map((v,i)=>(v+end[i])*.5+(i===1?2:0));let last=start;for(let j=1;j<=4;j++){const u=j/4,p=start.map((v,i)=>(1-u)**2*v+2*(1-u)*u*control[i]+u*u*end[i]);add(last,p,r*.67);last=p;}}
 }

 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const g of segs)for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],g.a[d]-g.r-3,g.b[d]-g.r-3);hi[d]=Math.max(hi[d],g.a[d]+g.r+3,g.b[d]+g.r+3);}for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],(d===1?cy:0)-core[d]-3);hi[d]=Math.max(hi[d],(d===1?cy:0)+core[d]+3);}lo[1]=-2;
 const step=Math.max(...hi.map((x,i)=>x-lo[i]))/s.resolution,nx=Math.ceil((hi[0]-lo[0])/step)+1,ny=Math.ceil((hi[1]-lo[1])/step)+1,nz=Math.ceil((hi[2]-lo[2])/step)+1,N=nx*ny*nz;
 if(N>26000000)throw Error('Reduce la resolución.');
 const outer=new Float32Array(N).fill(1000),inner=new Float32Array(N).fill(1000),id=(x,y,z)=>(z*ny+y)*nx+x;
 function smooth(a,b,k){const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;}
 const ellipsoid=(x,y,z,a,b,c)=>{const k0=Math.hypot(x/a,y/b,z/c),k1=Math.hypot(x/(a*a),y/(b*b),z/(c*c));return k1>1e-10?k0*(k0-1)/k1:-Math.min(a,b,c);};
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const px=lo[0]+x*step,py=lo[1]+y*step-cy,pz=lo[2]+z*step,i=id(x,y,z);outer[i]=ellipsoid(px,py,pz,...core);inner[i]=ellipsoid(px,py,pz,...core.map(r=>Math.max(1,r-wall)));}
 for(const g of segs){const d=g.b.map((v,i)=>v-g.a[i]),len=d.reduce((v,x)=>v+x*x,0),r=g.r+3,imin=g.a.map((v,i)=>Math.max(0,Math.floor((Math.min(v,g.b[i])-r-lo[i])/step))),imax=g.a.map((v,i)=>Math.min([nx,ny,nz][i]-1,Math.ceil((Math.max(v,g.b[i])+r-lo[i])/step)));
  for(let z=imin[2];z<=imax[2];z++)for(let y=imin[1];y<=imax[1];y++)for(let x=imin[0];x<=imax[0];x++){const vx=lo[0]+x*step-g.a[0],vy=lo[1]+y*step-g.a[1],vz=lo[2]+z*step-g.a[2],t=Math.max(0,Math.min(1,(vx*d[0]+vy*d[1]+vz*d[2])/len)),dist=Math.hypot(vx-t*d[0],vy-t*d[1],vz-t*d[2]),i=id(x,y,z);outer[i]=smooth(outer[i],dist-(g.r+(g.r1-g.r)*t),.4);if(g.r>wall+.5)inner[i]=smooth(inner[i],dist-(g.r+(g.r1-g.r)*t-wall),.4);}
 }
 const amplitude=(s.noise??0)/scale,grain=s.noiseScale??8;
 const octaves=Math.max(1,Math.min(s.noiseDetail??2,1+Math.floor(Math.log2(Math.max(1,grain/(3*step*scale))))));
 if(amplitude>0)for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=id(x,y,z);if(Math.abs(outer[i])>amplitude+step*2)continue;const px=(lo[0]+x*step)*scale,py=(lo[1]+y*step)*scale,pz=(lo[2]+z*step)*scale;let val=0,total=0;for(let o=0;o<octaves;o++){const f=2**o/grain,a=.5**o;val+=noise3(px*f,py*f,pz*f,s.seed+37*o)*a;total+=a;}const fade=Math.max(0,Math.min(1,py/4));outer[i]-=amplitude*(val/total)*fade;}
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=id(x,y,z);outer[i]=Math.max(outer[i],-inner[i],-(lo[1]+y*step));}
 const positions=[],indices=[],cache=new Map(),offs=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],coord=i=>[i%nx,Math.floor(i/nx)%ny,Math.floor(i/(nx*ny))];
 function vertex(a,b){const key=a<b?a*N+b:b*N+a;let v=cache.get(key);if(v!==undefined)return v;const f=outer[a]/(outer[a]-outer[b]),p=coord(a),q=coord(b);v=positions.length/3;positions.push(...p.map((x,i)=>(lo[i]+(x+(q[i]-x)*f)*step)*scale));cache.set(key,v);return v;}
 function triangle(a,b,c,inside,outside){const p=positions.slice(a*3,a*3+3),q=positions.slice(b*3,b*3+3),r=positions.slice(c*3,c*3+3),u=q.map((x,i)=>x-p[i]),v=r.map((x,i)=>x-p[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],A=coord(inside),B=coord(outside);if(normal.reduce((sum,x,i)=>sum+x*(B[i]-A[i]),0)<0)[b,c]=[c,b];indices.push(a,b,c);}
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){const ids=offs.map(o=>id(x+o[0],y+o[1],z+o[2]));let neg=0;for(const i of ids)if(outer[i]<0)neg++;if(!neg||neg===8)continue;for(const tet of tets){const ins=[],out=[];for(const k of tet)(outer[ids[k]]<0?ins:out).push(ids[k]);if(!ins.length||!out.length)continue;if(ins.length===1||out.length===1){const a=ins.length===1?ins:out,b=ins.length===1?out:ins;triangle(...b.map(i=>vertex(a[0],i)),ins[0],out[0]);}else{const a=vertex(ins[0],out[0]),b=vertex(ins[0],out[1]),c=vertex(ins[1],out[0]),d=vertex(ins[1],out[1]);triangle(a,b,c,ins[0],out[0]);triangle(b,d,c,ins[0],out[0]);}}}
 // Remove tiny isolated voxel fragments; retain the connected printable body.
 const parent=Int32Array.from({length:positions.length/3},(_,i)=>i);
 const root=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
 for(let k=0;k<indices.length;k+=3){parent[root(indices[k])]=root(indices[k+1]);parent[root(indices[k+1])]=root(indices[k+2]);}
 const sizes=new Map();for(let i=0;i<parent.length;i++){let r=root(i);sizes.set(r,(sizes.get(r)||0)+1);}let biggest=-1;for(const [r,n]of sizes)if(biggest<0||n>sizes.get(biggest))biggest=r;
 const kept=[],verts=[],mapping=new Map();for(let k=0;k<indices.length;k+=3)if(root(indices[k])===biggest)for(let j=0;j<3;j++){const old=indices[k+j];if(!mapping.has(old)){mapping.set(old,verts.length/3);verts.push(...positions.slice(old*3,old*3+3));}kept.push(mapping.get(old));}
 positions.length=0;for(const v of verts)positions.push(v);indices.length=0;for(const v of kept)indices.push(v);
 let volume=0;for(let k=0;k<indices.length;k+=3){const [a,b,c]=indices.slice(k,k+3).map(i=>positions.slice(i*3,i*3+3));volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}
 const dims=[0,1,2].map(d=>{let low=Infinity,high=-Infinity;for(let i=d;i<positions.length;i+=3){low=Math.min(low,positions[i]);high=Math.max(high,positions[i]);}return high-low;});
 return {debug:{kind:'coral',lines:[...Array.from({length:3},(_,plane)=>({color:0xc28fff,points:Array.from({length:65},(_,j)=>{const a=j/64*Math.PI*2,p=[0,cy,0],i=plane,k=(plane+1)%3;p[i]+=core[i]*Math.cos(a);p[k]+=core[k]*Math.sin(a);return p.map(v=>v*scale);})})),...segs.map(g=>({points:[g.a.map(v=>v*scale),g.b.map(v=>v*scale)],color:0x6bd5ef}))],origin:[0,cy*scale,0]},positions:new Float32Array(positions),indices:new Uint32Array(indices),volume,minWall:s.thickness,dimensions:dims,opening:2*(core[0]-wall)*Math.sqrt(Math.max(0,1-(cy/(core[1]-wall))**2))*scale,noiseOctaves:octaves,voxel:step*scale,branches:segs.length};
}
