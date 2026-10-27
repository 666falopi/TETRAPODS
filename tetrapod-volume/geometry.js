/* Four overlapping circular frustums. Analytic ray exits generate their union. */
export const axes=[[0,1,0],[Math.sqrt(8/9),-1/3,0],[-Math.sqrt(2/9),-1/3,Math.sqrt(2/3)],[-Math.sqrt(2/9),-1/3,-Math.sqrt(2/3)]];
export let rootRadius=.38,tipRadius=.18;export const length=1;
export let bounds;export let nativeHeight;
export function setRadii(root=.38,tip=.18){rootRadius=root;tipRadius=tip;bounds=[0,1,2].map(j=>{
 let lo=Infinity,hi=-Infinity;
 for(const a of axes) for(const [t,r] of [[0,rootRadius],[length,tipRadius]]){
 const reach=r*Math.sqrt(1-a[j]*a[j]);lo=Math.min(lo,t*a[j]-reach);hi=Math.max(hi,t*a[j]+reach);
 }return [lo,hi];
});
nativeHeight=bounds[1][1]-bounds[1][0];}
setRadii();
export function radius(d){let out=0;for(const a of axes){const c=d.reduce((s,x,j)=>s+x*a[j],0);if(c<=0)continue;out=Math.max(out,Math.min(1/c,rootRadius/(Math.sqrt(Math.max(0,1-c*c))+(rootRadius-tipRadius)*c)));}return out;}
export function mesh(n=128){
 const m=n*2,verts=[0,radius([0,1,0]),0],faces=[];
 for(let i=1;i<n;i++){const t=Math.PI*i/n;for(let j=0;j<m;j++){const p=2*Math.PI*j/m,d=[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)],r=radius(d);verts.push(...d.map(x=>x*r));}}
 const bottom=verts.length/3;verts.push(0,-radius([0,-1,0]),0);
 for(let j=0;j<m;j++)faces.push(0,1+(j+1)%m,1+j);
 for(let i=0;i<n-2;i++)for(let j=0;j<m;j++){let a=1+i*m+j,b=1+i*m+(j+1)%m,c=a+m,d=b+m;faces.push(a,b,c,b,d,c);}
 for(let j=0;j<m;j++)faces.push(bottom,1+(n-2)*m+j,1+(n-2)*m+(j+1)%m);
 let volume=0;for(let i=0;i<faces.length;i+=3){let a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;volume+=(verts[a]*(verts[b+1]*verts[c+2]-verts[b+2]*verts[c+1])+verts[a+1]*(verts[b+2]*verts[c]-verts[b]*verts[c+2])+verts[a+2]*(verts[b]*verts[c+1]-verts[b+1]*verts[c]))/6;}
 return {verts,faces,volume:Math.abs(volume)};
}
