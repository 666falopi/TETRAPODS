export const defaults={size:140,height:110,count:14,spread:.8,cap:30,cup:14,thickness:2.6,gillDepth:2.2,gills:28,seed:12,resolution:224};
export function build(s){
 const extent=s.size*.45*s.spread+s.cap*1.45,lo=[-extent,-3,-extent],step=extent*2/s.resolution,nx=s.resolution+1,nz=nx,ny=Math.ceil((s.height+s.cup+18)/step)+1,N=nx*ny*nz,scale=1,id=(x,y,z)=>(z*ny+y)*nx+x;
 const outer=new Float32Array(N).fill(1000),shrooms=[];
 const rnd=i=>{const a=Math.sin(i*127.1+s.seed*31.7)*43758.5453;return a-Math.floor(a);};
 for(let i=0;i<s.count;i++){
  const layer=Math.floor(i/5),f=i/Math.max(1,s.count-1),angle=i*2.39996+.25*rnd(i),reach=s.size*(.17+.14*(1-f))*s.spread;
  const h=18+(s.height-36)*(s.count===1?.6:f),rad=s.cap*(.72+.40*rnd(i+37)),cx=Math.cos(angle)*reach,cz=Math.sin(angle)*reach;
  const stemx=cx-Math.cos(angle)*rad*.48,stemz=cz-Math.sin(angle)*rad*.48;
  const points=[];for(let k=0;k<=5;k++){const t=k/5;points.push([stemx*t*t,3+(h-3)*t,stemz*t*t]);}
  shrooms.push({cx,cz,h,rad,angle,c:Math.cos(angle),sn:Math.sin(angle),points,stemRadius:3.2+rad*.025,phase:rnd(i+99)*6.28});
 }
 function capsule(x,y,z,a,b,r){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/(dx*dx+dy*dy+dz*dz)));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t,z-a[2]-dz*t)-r;}
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const px=lo[0]+x*step,pz=lo[2]+z*step,bands=[];
  for(const m of shrooms){const dx=px-m.cx,dz=pz-m.cz,u=dx*m.c+dz*m.sn,v=-dx*m.sn+dz*m.c,r=Math.hypot(u,v/1.13),a=Math.atan2(v,u+m.rad*.48),theta=Math.atan2(v,u),R=m.rad*(1+.035*Math.sin(theta*5+m.phase)+.025*Math.sin(theta*9-m.phase));
   if(r<R+4){const q=r/R,edge=Math.max(0,q),wave=.65*Math.sin(theta*5+m.phase)*q*q;
    const middle=m.h+s.cup*(Math.hypot(u+R*.48,v/1.13)/R)**.8-2.8*edge**8+wave;
    const ribs=Math.pow(.5+.5*Math.cos(a*s.gills),2),fade=Math.min(1,Math.hypot(u+m.rad*.48,v)/8)*Math.max(0,Math.min(1,(1-q)*7));
    bands.push({m,radial:(r-R)*.8,middle,depth:s.gillDepth*ribs*fade});}
  }
  for(let y=0;y<ny;y++){
   const py=lo[1]+y*step;let d=Math.max(Math.hypot(px,pz)-13,Math.abs(py-2)-2);
   for(const b of bands){if(Math.abs(py-b.middle)>s.thickness+b.depth+3)continue;d=Math.min(d,Math.max(b.radial,py-b.middle-s.thickness*.5,b.middle-s.thickness*.5-b.depth-py));}
   for(const m of shrooms){if(py>m.h+4)continue;for(let k=0;k<5;k++)d=Math.min(d,capsule(px,py,pz,m.points[k],m.points[k+1],m.stemRadius));}
   outer[id(x,y,z)]=Math.max(d,-py);
  }
 }
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
 // Taubin smoothing acts on the exported geometry too. Lock the flat underside.
 const count=positions.length/3,degree=new Uint32Array(count),sums=new Float64Array(positions.length),fixed=new Uint8Array(count);
 for(let i=0;i<count;i++)fixed[i]=positions[i*3+1]<1e-6?1:0;
 for(let k=0;k<indices.length;k+=3)for(let j=0;j<3;j++){degree[indices[k+j]]+=2;}
 for(let pass=0;pass<16;pass++){
  sums.fill(0);
  for(let k=0;k<indices.length;k+=3)for(let j=0;j<3;j++){
   const a=indices[k+j],b=indices[k+(j+1)%3];
   for(let d=0;d<3;d++){sums[3*a+d]+=positions[3*b+d];sums[3*b+d]+=positions[3*a+d];}
  }
  const factor=pass%2===0?.5:-.53;
  for(let i=0;i<count;i++)if(!fixed[i]&&degree[i])for(let d=0;d<3;d++)positions[3*i+d]+=factor*(sums[3*i+d]/degree[i]-positions[3*i+d]);
 }
 let volume=0;for(let k=0;k<indices.length;k+=3){const [a,b,c]=indices.slice(k,k+3).map(i=>positions.slice(i*3,i*3+3));volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}
 const dims=[0,1,2].map(d=>{let low=Infinity,high=-Infinity;for(let i=d;i<positions.length;i+=3){low=Math.min(low,positions[i]);high=Math.max(high,positions[i]);}return high-low;});
 return {debug:{kind:'fungi',origin:[0,0,0],lines:shrooms.flatMap(m=>[{points:m.points,color:0x6bd5ef},{points:Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return [m.cx+m.rad*Math.cos(a),m.h,m.cz+m.rad*1.13*Math.sin(a)];}),color:0xf3c969},{points:[[m.cx,m.h,m.cz],[m.cx,m.h+s.cup,m.cz]],color:0xf3c969}])},positions:new Float32Array(positions),indices:new Uint32Array(indices),volume,dimensions:dims,voxel:step,removed:sizes.size-1,removedVertices:[...sizes.values()].reduce((a,b)=>a+b,0)-sizes.get(biggest)};
}
