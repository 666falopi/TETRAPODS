import * as T from './three.module.js';
export function modelOverlays({scene,draw,getMesh,bulb=true}){
 const bar=document.querySelector('.toolbar');let wire;const reference=new T.Group();scene.add(reference);reference.visible=false;
 function toggle(title,id,callback){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=id;label.append(input,document.createTextNode(' '+title));bar.append(label);input.onchange=()=>{callback(input.checked);draw();};return input;}
 const grid=toggle('Superponer malla','overlayWire',()=>updateWire());
 const structure=toggle('Estructura / crecimiento','overlayStructure',value=>{const original=document.getElementById('debugShow');original.checked=value;original.dispatchEvent(new Event('change'));});
 document.getElementById('debugShow')?.addEventListener('change',e=>structure.checked=e.target.checked);
 function updateWire(){if(wire){wire.parent?.remove(wire);wire.geometry.dispose();wire.material.dispose();wire=null;}const mesh=getMesh();if(grid.checked&&mesh){wire=new T.LineSegments(new T.WireframeGeometry(mesh.geometry),new T.LineBasicMaterial({color:0x171717,transparent:true,opacity:.6,depthTest:true}));wire.renderOrder=2;mesh.add(wire);}}
 if(bulb){toggle('Ampolleta + soquete','overlayBulb',value=>reference.visible=value);fetch('../shell-branch/bulb-reference.json').then(r=>r.json()).then(data=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));g.computeVertexNormals();reference.add(new T.Mesh(g,new T.MeshStandardMaterial({color:0xffcc36,roughness:.45})));const axes=new T.AxesHelper(35);reference.add(axes);draw();});}
 return {update(center){reference.position.copy(center).multiplyScalar(-1);updateWire();}};
}
