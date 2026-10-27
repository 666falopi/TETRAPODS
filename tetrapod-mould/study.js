export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const unit=a=>{let l=Math.hypot(...a);return a.map(x=>x/l)};
import {DEFAULT} from './geometry.js';
export const axes=[[0,1,0],[Math.sqrt(8/9),-1/3,0],[-Math.sqrt(2/9),-1/3,Math.sqrt(2/3)],[-Math.sqrt(2/9),-1/3,-Math.sqrt(2/3)]].map(d=>unit(d.map((v,i)=>v*[DEFAULT.width,DEFAULT.height,DEFAULT.depth][i])));
export const pulls=axes.map(d=>d.map(x=>-x));
export function sector(p){let win=0;for(let i=1;i<4;i++)if(dot(p,pulls[i])>dot(p,pulls[win]))win=i;return win}
export function sample(data,p){const {n,lo,h,field}=data,a=p.map(v=>(v-lo)/h);if(a.some(v=>v<0||v>=n-1))return -100;const q=a.map(Math.floor),t=a.map((v,i)=>v-q[i]);let sum=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)sum+=field[q[0]+x+n*(q[1]+y+n*(q[2]+z))]*(x?t[0]:1-t[0])*(y?t[1]:1-t[1])*(z?t[2]:1-t[2]);return sum}
export function defaultCuts(){const out=[];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)out.push({i,j,n:unit(pulls[i].map((v,k)=>v-pulls[j][k])),offset:0});return out}
const originalCuts=defaultCuts();
export function region(data,p,i,gap=data.gap){let value=Infinity;for(const c of data.cuts||originalCuts){if(c.i===i)value=Math.min(value,dot(p,c.n)-c.offset-gap);if(c.j===i)value=Math.min(value,c.offset-dot(p,c.n)-gap);}return value}
export function owner(data,p){for(let i=0;i<4;i++)if(region(data,p,i,0)>=-1e-8)return i;return -1}
export function pieceField(data,p,i){const f=sample(data,p);return Math.min(-f-data.clearance,f+data.wall,region(data,p,i))}
export function checkPull(data,i,remaining,dir=pulls[i]){if(!data.probes[i]?.length)return {clear:false,block:"empty or unresolved shell",travel:0,tested:0};let tested=0;for(let step=1;step<=80;step++){const travel=step*data.h*.5;for(const p of data.probes[i]){const q=p.map((v,k)=>v+dir[k]*travel);tested++;if(sample(data,q)>.025)return {clear:false,block:'cloud',travel,point:q,tested};for(const j of remaining)if(j!==i&&pieceField(data,q,j)>.025)return{clear:false,block:'piece '+(j+1),travel,point:q,tested};}}return{clear:true,tested,travel:40*data.h}}
export function orderCheck(data,order){let remaining=[0,1,2,3],results=[];for(const i of order){const r=checkPull(data,i,remaining);results.push({piece:i,...r});if(!r.clear)break;remaining=remaining.filter(j=>j!==i);}return results}

