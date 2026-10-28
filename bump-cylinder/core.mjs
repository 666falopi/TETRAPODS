export const styles=['Plain weave','Twill','Herringbone','Tartan','Diamond','Flutes'];
const tau=Math.PI*2,fract=x=>x-Math.floor(x),clamp=x=>Math.max(0,Math.min(1,x));
const band=(x,w=.3)=>Math.exp(-Math.pow(Math.sin(Math.PI*x)/w,4));
export function pattern(kind,u,v){
  if(kind==='Plain weave'){
    const x=u*2,y=v*2,warp=band(x,.72),weft=band(y,.72);
    const over=(Math.floor(x+.5)+Math.floor(y+.5))%2===0;
    return clamp(Math.max(warp*(over?1:.38),weft*(over?.38:1)));
  }
  if(kind==='Twill'){
    const x=u*4,y=v*4,warp=band(x,.7),weft=band(y,.7);
    const over=((Math.floor(x+.5)-Math.floor(y+.5))%4+4)%4<2;
    return Math.max(warp*(over?1:.28),weft*(over?.28:1));
  }
  if(kind==='Herringbone'){
    const q=fract(u),chevron=Math.abs(q-.5)*2;
    return .85*band(v*2-chevron,.65)+.15*band(u*8,.45);
  }
  if(kind==='Tartan'){
    const stripes=x=>Math.max(band(x,.55)*.7,band(x-.19,.16),band(x+.19,.16),band(x-.5,.25)*.45);
    return clamp(Math.max(stripes(u),stripes(v))*.87+.13*band(u*12,.5)*band(v*12,.5));
  }
  if(kind==='Diamond')return clamp(.75*Math.max(band(u+v,.35),band(u-v,.35))+.25*band(u*2,.5)*band(v*2,.5));
  return .5+.5*Math.cos(tau*u);
}
export function imageValue(image,u,v){
  // Mirror the tile on both axes: opposite borders always meet exactly.
  const mirror=x=>1-Math.abs(fract(x)*2-1);
  const x=mirror(u)*(image.w-1),y=(1-mirror(v))*(image.h-1);
  const a=Math.floor(x),b=Math.floor(y),dx=x-a,dy=y-b;
  const at=(i,j)=>image.values[Math.min(image.h-1,j)*image.w+Math.min(image.w-1,i)];
  return (at(a,b)*(1-dx)+at(a+1,b)*dx)*(1-dy)+(at(a,b+1)*(1-dx)+at(a+1,b+1)*dx)*dy;
}
export function coordinates(s,u,t){
  const g=s.growth-1;
  const v=Math.abs(g)<1e-6?s.height*t/s.pitch:s.height*Math.log1p(g*t)/(g*s.pitch);
  return [u*Math.max(1,Math.round(Math.PI*s.diameter/s.pitch))+s.twist*t,v];
}
export function value(s,u,t,image){
  const [a,b]=coordinates(s,u,t);
  let h=s.style==='Custom'&&image?imageValue(image,a,b):pattern(s.style,a,b);
  if(s.invert)h=1-h;
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const fade=s.margin>0?smooth(t*s.height/s.margin)*smooth((1-t)*s.height/s.margin):1;
  return h*fade*(1+(s.topRelief-1)*t);
}
export function mesh(s,image){
  const repeats=Math.max(1,Math.round(Math.PI*s.diameter/s.pitch));
  const detail=s.style==='Twill'?40:s.style==='Tartan'?72:s.style==='Custom'?64:32;
  let n=Math.ceil(Math.max(64,Math.PI*(s.diameter+2*s.relief*Math.max(1,s.topRelief))/s.resolution,repeats*detail));
  let ny=Math.ceil(Math.max(24,s.height/s.resolution,s.height/(s.pitch*Math.min(1,s.growth))*detail));
  n=Math.min(960,n);ny=Math.min(960,ny);
  if(n*(ny+1)>230000){const f=Math.sqrt(230000/(n*(ny+1)));n=Math.floor(n*f);ny=Math.floor(ny*f);}
  const positions=new Float32Array((n*(ny+1)+2)*3),indices=new Uint32Array((n*ny*2+n*2)*3);
  let k=0;
  for(let j=0;j<=ny;j++)for(let i=0;i<n;i++){
    const r=s.diameter/2+s.relief*value(s,i/n,j/ny,image),a=tau*i/n;
    positions[k++]=r*Math.cos(a);positions[k++]=s.height*j/ny;positions[k++]=r*Math.sin(a);
  }
  const bottom=n*(ny+1),top=bottom+1;positions[top*3+1]=s.height;k=0;
  for(let j=0;j<ny;j++)for(let i=0;i<n;i++){
    const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;
    for(const v of [a,c,b,b,c,d])indices[k++]=v;
  }
  for(let i=0;i<n;i++)for(const v of [bottom,i,(i+1)%n,top,ny*n+(i+1)%n,ny*n+i])indices[k++]=v;
  return {positions,indices,n,ny,repeats};
}
export function stl(m){
  const count=m.indices.length/3,buffer=new ArrayBuffer(84+50*count),d=new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('Hard Matter / Bump Cylinder / millimetres / Z up'));
  d.setUint32(80,count,true);
  let offset=84;
  for(let f=0;f<m.indices.length;f+=3){
    const vertices=[0,1,2].map(j=>{const k=m.indices[f+j]*3;return [m.positions[k],-m.positions[k+2],m.positions[k+1]];});
    const [a,b,c]=vertices,ab=b.map((x,i)=>x-a[i]),ac=c.map((x,i)=>x-a[i]);
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...normal)||1;
    for(const v of [...normal.map(x=>x/length),...vertices.flat()]){d.setFloat32(offset,v,true);offset+=4;}
    d.setUint16(offset,0,true);offset+=2;
  }
  return buffer;
}
