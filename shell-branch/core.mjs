export const defaults={size:160,height:130,thickness:2,bend:22,opening:48,pear:0,roundness:1,belly:0.5,offset:0,radial:32,bodySteps:12,joinSteps:8,branchSteps:8};
export function build(s){
s={...defaults,...s}; for(const key of ['radial','bodySteps','joinSteps','branchSteps'])s[key]=Math.max(4,Math.round(s[key]));
const P=[],I=[],R=Math.max(s.size,s.opening+2*s.thickness+10)/100,H=Math.max(130,s.height)/50,n=s.radial,ts=[],zones=[];
for(const [zone,steps]of [s.bodySteps,s.joinSteps,s.branchSteps,s.branchSteps].entries())for(let j=0;j<steps;j++){ts.push(zone+j/steps);zones.push(zone);}const rings=ts.length;
const bez=(p,t)=>{const u=1-t;return [0,1].map(k=>u*u*u*p[0][k]+3*u*u*t*p[1][k]+3*u*t*t*p[2][k]+t*t*t*p[3][k]);};
function profile(t){let q;if(t<1)q=bez([[s.opening/2/R,0],[55*s.roundness*(1+s.pear*.35),50*Math.max(.05,s.belly-.25)],[55*s.roundness*(1-s.pear*.35),50*Math.min(.95,s.belly+.25)],[30,50]],t);else if(t<2)q=bez([[30,50],[20,53.2],[12,56],[12,68]],t-1);else if(t<3)q=bez([[12,68],[12,80],[10,92],[10,100]],t-2);else q=[10*Math.cos((t-3)*Math.PI/2),100+10*Math.sin((t-3)*Math.PI/2)];return [q[0]*R,(q[1]<=50?q[1]*H:50*H+q[1]-50)];}
function center(y){const t=Math.max(0,Math.min(1,(y-50*H)/60));return s.bend*t*t*(3-2*t);}
function point(t,a){const [r,y]=profile(t);return [center(y)+r*Math.cos(a),y+s.offset,r*Math.sin(a)];}
function normal(t,a){const e=1e-5,p=point(Math.max(0,t-e),a),q=point(Math.min(4,t+e),a),v=q.map((x,k)=>x-p[k]),w=[-Math.sin(a),0,Math.cos(a)],c=[v[1]*w[2],v[2]*w[0]-v[0]*w[2],-v[1]*w[0]],l=Math.hypot(...c);return c.map(x=>x/l);}
for(let side=0;side<2;side++)for(const t of ts)for(let j=0;j<n;j++){const a=j/n*Math.PI*2,p=point(t,a),v=normal(t,a);P.push(...p.map((x,k)=>x-side*s.thickness*v[k]));}
const pole=[];for(let side=0;side<2;side++){pole.push(P.length/3);P.push(s.bend,50*H+60+s.offset-side*s.thickness,0);}
const index=(side,r,j)=>side*rings*n+r*n+(j+n)%n;
function tri(a,b,c,flip=false){I.push(a,flip?c:b,flip?b:c);}
for(let side=0;side<2;side++){for(let r=0;r<rings-1;r++)for(let j=0;j<n;j++){const a=index(side,r,j),b=index(side,r+1,j),c=index(side,r+1,j+1),d=index(side,r,j+1);tri(a,b,c,side===1);tri(a,c,d,side===1);}for(let j=0;j<n;j++)tri(index(side,rings-1,j),pole[side],index(side,rings-1,j+1),side===1);}
for(let j=0;j<n;j++){const a=index(0,0,j),b=index(0,0,j+1),c=index(1,0,j+1),d=index(1,0,j);tri(a,b,c);tri(a,c,d);}
let volume=0;for(let i=0;i<I.length;i+=3){const a=I[i]*3,b=I[i+1]*3,c=I[i+2]*3;volume+=(P[a]*(P[b+1]*P[c+2]-P[b+2]*P[c+1])+P[a+1]*(P[b+2]*P[c]-P[b]*P[c+2])+P[a+2]*(P[b]*P[c+1]-P[b+1]*P[c]))/6;}
const dimensions=[0,1,2].map(d=>{let lo=Infinity,hi=-Infinity;for(let i=d;i<P.length;i+=3){lo=Math.min(lo,P[i]);hi=Math.max(hi,P[i]);}return hi-lo;});
const colors=[0xb28cff,0xffc46b,0x69d4e5,0x69d4e5],lines=[];for(let z=0;z<4;z++)for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])lines.push({color:colors[z],points:Array.from({length:33},(_,j)=>point(z+j/32,a))});for(const t of [0,1,2,3])lines.push({color:colors[Math.min(3,t)],points:Array.from({length:65},(_,j)=>point(t,j/64*Math.PI*2))});
return {positions:new Float32Array(P),indices:new Uint32Array(I),volume,dimensions,voxel:0,debug:{origin:[0,0,0],lines},rings,thickness:s.thickness};
}
