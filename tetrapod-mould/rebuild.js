import {meshField} from './geometry.js';
import {pieceField,owner,sample,dot,unit,pulls} from './study.js?v=3';
export function rebuild(data,cloud){
const parts=Array.from({length:4},(_,i)=>Array.from(meshField((x,y,z)=>pieceField(data,[x,y,z],i),52).positions));
const probes=[[],[],[],[]];let holes=0,total=0;
for(let z=0;z<data.n;z++)for(let y=0;y<data.n;y++)for(let x=0;x<data.n;x++){
 const p=[x,y,z].map(v=>data.lo+v*data.h),f=sample(data,p);
 if(f < -data.clearance && f > -data.wall){total++;if(owner(data,p)<0)holes++;}
 for(let i=0;i<4;i++)if(pieceField(data,p,i)>.025)probes[i].push(p);
}
const draft=Array.from({length:4},()=>({area:0,negative:0,low:0}));
for(let k=0;k<cloud.length;k+=9){const a=cloud.slice(k,k+3),b=cloud.slice(k+3,k+6),c=cloud.slice(k+6,k+9),p=a.map((v,j)=>(v+b[j]+c[j])/3),i=owner(data,p);if(i<0)continue;const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),N=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(...N)/2;if(!area)continue;const d=dot(unit(N),pulls[i]);draft[i].area+=area;if(d<0)draft[i].negative+=area;}
return {parts,probes,draft,holes,total};
}
