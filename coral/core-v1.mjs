export const defaults={size:140,thickness:3.2,count:22,reach:22,width:15,fork:.65,flow:.22,pores:.65,seed:12,resolution:256};
const TAU=Math.PI*2;
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function xyz(a,t){return [Math.sin(t)*Math.cos(a),Math.cos(t),Math.sin(t)*Math.sin(a)];}
export function build(s){
 const rand=rng(s.seed),segments=[],R=s.size/2,n=Math.round(s.resolution),m=Math.round(n*.42),end=2.36;
 // Branch guides lie on a rounded envelope. Their spherical distance defines real relief.
 const add=(a,t,b,u,w,h)=>segments.push({a:xyz(a,t),b:xyz(b,u),w,h});
 for(let k=0;k<s.count;k++){
  const a=k*2.3999632297+(rand()-.5)*.45,t=.43+1.42*(k+.5)/s.count;
  const length=.28+rand()*.23,top=Math.max(.13,t-length),twist=s.flow*(.8+rand()*.4),w=s.width/R*(.8+rand()*.35),h=s.reach*(.75+rand()*.4);
  add(a,t,a+twist,top,w,h);
  if(rand()<s.fork){add(a+twist*.45,t-length*.45,a+twist-.24,Math.max(.12,top-.08),w*.76,h*.9);add(a+twist*.45,t-length*.45,a+twist+.23,top+.06,w*.7,h*.87);}
 }
 const pointR=(a,t)=>{
  const p=xyz(a,t);let value=0;
  for(const g of segments){const d=g.b.map((v,i)=>v-g.a[i]),v=p.map((x,i)=>x-g.a[i]);const u=Math.max(0,Math.min(1,v.reduce((z,x,i)=>z+x*d[i],0)/d.reduce((z,x)=>z+x*x,0)));const dist=Math.hypot(...p.map((x,i)=>x-g.a[i]-u*d[i]));
   // Rounded long fingers with smoothly blended roots; soft maximum merges forks.
   const q=dist/g.w,h=q<1?g.h*Math.pow(1-q*q,1.4):0,k=2;
   const blend=Math.max(k-Math.abs(value-h),0)/k;value=Math.max(value,h)+blend*blend*k*.25;
  }
  // Periodic staggered cups: geometry, not a shading map. Fade them at both poles/rim.
  const row=t*R/3.8,ri=Math.floor(row),cols=Math.max(8,Math.round(TAU*R*Math.sin((ri+.5)*3.8/R)/3.8));
  let pore=0;for(let j=-1;j<=1;j++){const rr=ri+j,tt=(rr+.5)*3.8/R,cc=Math.max(8,Math.round(TAU*R*Math.sin(tt)/3.8)),v=a/TAU*cc+(rr%2)*.5,du=(v-Math.floor(v+.5))*TAU/cc*Math.sin(t)*R,dv=(t-tt)*R,d=Math.hypot(du,dv);pore=Math.max(pore,Math.exp(-d*d/1.0));}
  const rim=Math.min(1,Math.max(0,(end-t)/.18)),pole=Math.min(1,t/.15);return R+rim*value-s.pores*pore*rim*pole;
 };
 const shell=1+n*m,positions=new Float32Array(shell*6),indices=[];
 for(let side=0;side<2;side++){
  let rad=pointR(0,0)-side*s.thickness;positions.set([0,rad,0],side*shell*3);
  for(let j=1;j<=m;j++)for(let i=0;i<n;i++){const a=i/n*TAU,t=end*j/m,r=pointR(a,t)-side*s.thickness,p=xyz(a,t);positions.set(p.map(x=>x*r),(side*shell+1+(j-1)*n+i)*3);}
 }
 const tri=(a,b,c)=>indices.push(a,b,c),idx=(j,i)=>1+(j-1)*n+(i+n)%n;
 for(let i=0;i<n;i++)tri(0,idx(1,i+1),idx(1,i));
 for(let j=1;j<m;j++)for(let i=0;i<n;i++){const a=idx(j,i),b=idx(j,i+1),c=idx(j+1,i+1),d=idx(j+1,i);tri(a,b,c);tri(a,c,d);}
 const outside=indices.length;for(let k=0;k<outside;k+=3)tri(indices[k]+shell,indices[k+2]+shell,indices[k+1]+shell);
 for(let i=0;i<n;i++){const a=idx(m,i),b=idx(m,i+1);tri(a,b,b+shell);tri(a,b+shell,a+shell);}
 // Fit final outer bounding box to requested largest dimension. Preserve thickness in mm by rebuilding inner radii.
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<shell;i++)for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],positions[i*3+d]);hi[d]=Math.max(hi[d],positions[i*3+d]);}
 const scale=s.size/Math.max(...hi.map((x,i)=>x-lo[i]));
 for(let i=0;i<shell;i++){const p=Array.from(positions.subarray(i*3,i*3+3)),r=Math.hypot(...p);for(let d=0;d<3;d++){positions[i*3+d]=p[d]*scale;positions[(i+shell)*3+d]=p[d]*(scale-s.thickness/r);}}
 const floor=lo[1]*scale;for(let i=0;i<positions.length/3;i++)positions[i*3+1]-=floor;
 for(let i=0;i<n;i++)positions[(shell+idx(m,i))*3+1]=0;
 let volume=0,minWall=Infinity;
 for(let k=0;k<indices.length;k+=3){const [a,b,c]=indices.slice(k,k+3).map(i=>Array.from(positions.subarray(i*3,i*3+3)));volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  if(k<outside){const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),norm=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],p=[a[0],a[1]+floor,a[2]];minWall=Math.min(minWall,s.thickness*Math.abs(norm.reduce((z,x,i)=>z+x*p[i],0))/(Math.hypot(...norm)*Math.hypot(...p)));}
 }
 if(volume<0){for(let k=0;k<indices.length;k+=3)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];volume=-volume;}
 return {positions,indices:new Uint32Array(indices),volume,minWall,dimensions:hi.map((x,i)=>(x-lo[i])*scale),opening:2*R*Math.sin(end)*scale,branches:segments.length};
}
