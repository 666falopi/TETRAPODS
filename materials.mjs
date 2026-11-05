import * as T from './three.module.js';
export function materials(renderer,scene){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');const bg=ctx.createLinearGradient(0,0,0,512);bg.addColorStop(0,'#d8e5f2');bg.addColorStop(.48,'#404b5c');bg.addColorStop(.52,'#17191f');bg.addColorStop(1,'#94939a');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,512);
 for(const [x,y,w,h,c]of [[55,100,110,260,'#ffffff'],[430,55,220,130,'#fff7e8'],[790,130,55,290,'#d3e9ff'],[940,30,30,350,'#ffffff']]){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
 const source=new T.CanvasTexture(canvas);source.mapping=T.EquirectangularReflectionMapping;source.colorSpace=T.SRGBColorSpace;const pmrem=new T.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(source);source.dispose();pmrem.dispose();
 return (mesh,mode,natural=0xdad7cc,ghost=false)=>{const mat=mesh.material,metal=mode==='Metal';mat.wireframe=mode==='Malla';mat.color.set(metal?0xe3e6ed:mode==='Arcilla'?0xb95c3b:mode==='Blanco y negro'?0xffffff:natural);mat.metalness=metal?1:0;mat.roughness=metal?.12:.8;mat.envMap=metal?env.texture:null;mat.envMapIntensity=metal?1.5:1;mat.transparent=ghost&&!metal;mat.opacity=ghost&&!metal?.48:1;mat.depthWrite=!(ghost&&!metal);mat.needsUpdate=true;scene.background.set(mode==='Blanco y negro'?'#080808':'#1c201b');};
}
