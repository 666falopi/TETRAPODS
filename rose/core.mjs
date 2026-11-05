export const defaults={size:120,height:56,thickness:2,layers:4,petals:5,twist:.55,curl:5,roundness:.55,convergence:.35,overlap:1.14,opening:1,seed:12,resolution:160};
export function build(s){
 const radius=s.size/2,pad=Math.max(5,s.curl+s.thickness+5-radius*.18),lo=[-radius-pad,-2,-radius-pad],step=(s.size+pad*2)/s.resolution,nx=s.resolution+1,nz=nx,ny=Math.ceil((s.height+12)/step)+1,N=nx*ny*nz,scale=1,id=(x,y,z)=>(z*ny+y)*nx+x;
 const outer=new Float32Array(N).fill(1000),petals=[],baseRadius=radius*.63*s.opening;
 for(let layer=0;layer<s.layers;layer++){
  const v=layer/Math.max(1,s.layers-1),count=layer===0?3:s.petals+layer-1;
  for(let k=0;k<count;k++)petals.push({layer,k,phase:2*Math.PI*k/count+layer*2.39996+.08*Math.sin(k*13+s.seed),radius:radius*(.15+.67*v)*s.opening,rise:s.height*(.97-.25*v),width:Math.PI/count*(s.overlap??1.14),curl:Math.max(1.2,s.curl*(.15+.85*v))});
 }
 const allPetals=petals.slice(),selected=Math.max(0,Math.min(allPetals.length-1,s.debugPetal??allPetals.length-1));
 if(s.debugIsolate)petals.splice(0,petals.length,allPetals[selected]);
 const debugLines=[];
 function guidePoint(p,u,q=0){const v=Math.min(1,u/.48),lip=Math.max(0,(u-.78)/.22),bt=Math.min(1,u/.8),ct=Math.max(0,Math.min(1,(u-.35)/.43));const r=p.radius*(.65+.25*Math.sin(v*Math.PI/2)+.22*(s.roundness??0)*Math.sin(Math.PI*bt)**2-.28*(s.convergence??0)*ct*ct*(3-2*ct))+p.curl*lip*lip+1.2*q*u+1.5*(1-q*q)*u,a=p.phase+s.twist*u+q*p.width;return [r*Math.cos(a),3+p.rise*u,r*Math.sin(a)];}
 for(const [i,p] of allPetals.entries())if(!s.debugIsolate||i===selected){debugLines.push({points:Array.from({length:33},(_,j)=>guidePoint(p,j/32)),color:i===selected?0xffba55:0x6bd5ef});for(const u of [0,.48,.78,.9])debugLines.push({points:Array.from({length:33},(_,j)=>guidePoint(p,u,-1+j/16)),color:i===selected?0xffba55:0x718c91});}
 if(!s.debugIsolate)for(let l=0;l<s.layers;l++){const r=allPetals.find(p=>p.layer===l).radius*.65;debugLines.push({points:Array.from({length:65},(_,j)=>[r*Math.cos(j/64*Math.PI*2),3,r*Math.sin(j/64*Math.PI*2)]),color:0xc28fff});}
 const selectedPetal=allPetals[selected],origin=guidePoint(selectedPetal,0),debug={kind:'rose',lines:debugLines,origin,phase:selectedPetal.phase,selected,parts:allPetals.map((p,i)=>({id:i,label:'Petalo '+(i+1)+' / corona '+(p.layer+1)}))};
 // Petals are upright curved walls r(height, angle), not horizontal height-map plates.
 for(let y=0;y<ny;y++){
  const py=lo[1]+y*step,bands=[];
  for(const p of petals){const t=(py-3)/p.rise;if(t<-.12||t>1.1)continue;const u=Math.max(0,Math.min(1,t)),v=Math.min(1,u/.48),lip=Math.max(0,(u-.78)/.22),bellyT=Math.min(1,u/.8),closeT=Math.max(0,Math.min(1,(u-.35)/.43)),roundness=s.roundness??0,convergence=s.convergence??0;
   const belly=.22*roundness*Math.sin(Math.PI*bellyT)**2,closure=.28*convergence*closeT*closeT*(3-2*closeT);
   const rr=p.radius*(.65+.25*Math.sin(v*Math.PI/2)+belly-closure)+p.curl*lip*lip;
   const slope=((u<.48?p.radius*.25*Math.PI/(2*.48)*Math.cos(v*Math.PI/2):0)+(u<.8?p.radius*.22*roundness*Math.PI/.8*Math.sin(2*Math.PI*bellyT):0)-(u>.35&&u<.78?p.radius*.28*convergence*6*closeT*(1-closeT)/.43:0)+(u>.78?2*p.curl*lip/.22:0))/p.rise;
   bands.push({...p,t:u,rr,norm:Math.sqrt(1+slope*slope)});}

  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
   const px=lo[0]+x*step,pz=lo[2]+z*step,r=Math.hypot(px,pz),angle=Math.atan2(pz,px);let d=s.debugIsolate?1000:Math.max(r-baseRadius,Math.abs(py-2)-2);
   for(const p of bands){if(Math.abs(r-p.rr)>s.thickness*2+5)continue;const a=Math.atan2(Math.sin(angle-p.phase-s.twist*p.t),Math.cos(angle-p.phase-s.twist*p.t)),q=a/p.width;if(Math.abs(q)>1.15)continue;
    const rr=p.rr+1.2*q*p.t+1.5*(1-q*q)*p.t,top=3+p.rise*(.9+.1*Math.cos(Math.min(1,Math.abs(q))*Math.PI/2))+2*q;
    d=Math.min(d,Math.max(Math.abs(r-rr)/p.norm-s.thickness/2,(Math.abs(a)-p.width)*Math.max(r,1),py-top,1-py));
   }outer[id(x,y,z)]=Math.max(d,-py);
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
 return {debug,positions:new Float32Array(positions),indices:new Uint32Array(indices),volume,dimensions:dims,voxel:step,removed:sizes.size-1,removedVertices:[...sizes.values()].reduce((a,b)=>a+b,0)-sizes.get(biggest)};
}
