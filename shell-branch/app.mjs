import {modelOverlays} from '../model-overlays.mjs?v=1';
import {materials} from '../materials.mjs';
import {structureDebug} from '../structure-debug.mjs?v=8';
import * as T from '../three.module.js';

import {defaults} from './core.mjs?v=3';import {toSTL} from './stl.mjs';

const $=id=>document.getElementById(id),s={...defaults};let mesh,current,worker,timer,angle=.5,tilt=.18,zoom=1;

const defs=[['size','Ancho nominal / mm',80,320,1],['height','Altura de la papa / mm',130,240,1],['pear','Forma de pera / abajo + / arriba -',-1,1,.05],['roundness','Volumen lateral de la papa',.6,1.5,.05],['belly','Altura del volumen lateral',.25,.75,.05],['offset','Desplazar respecto al origen / mm',-150,100,1],['thickness','Espesor normal / mm',.8,4,.1],['opening','Abertura exterior inferior / mm',20,240,1],['bend','Inclinacion / mm',0,35,1],['radial','Segmentos alrededor',4,192,1],['bodySteps','Cuerpo / subdivisiones',4,96,1],['joinSteps','Union / subdivisiones',4,128,1],['branchSteps','Rama y punta / subdivisiones',4,128,1]];
for(const [id,title,min,max,step]of defs){const d=document.createElement('div');d.className='parameter';const l=document.createElement('label');l.htmlFor=id;l.textContent=title;const row=document.createElement('div');row.className='row';const a=document.createElement('input'),b=document.createElement('input');Object.assign(a,{id,type:'range',min,max,step,value:s[id]});Object.assign(b,{id:id+'Number',type:'number',min,max,step,value:s[id]});b.setAttribute('aria-label',title+' valor');a.oninput=()=>{s[id]=+a.value;b.value=a.value;syncBase();queue()};b.onchange=()=>{const v=+b.value;if(!Number.isFinite(v)||v<min||v>max){b.value=s[id];return;}s[id]=v;a.value=v;syncBase();queue()};row.append(a,b);d.append(l,row);$('controls').append(d);}

function syncBase(){const needed=s.opening+2*s.thickness+10;if(s.size<needed){s.size=needed;$('size').value=needed;$('sizeNumber').value=needed;}}
const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,2000),renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.localClippingEnabled=true;scene.background=new T.Color('#1c201b');scene.add(new T.HemisphereLight(0xffffff,0x53594c,.65));for(const [x,y,z,power]of [[140,220,180,2],[-160,80,-100,.5]]){const light=new T.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);}const plane=new T.Plane(new T.Vector3(-1,0,0),0);

const applyMaterial=materials(renderer,scene);
const debugView=structureDebug({scene,draw,getMesh:()=>mesh,kind:'shell',onPart:(part,isolate)=>{s.debugPetal=part;s.debugIsolate=isolate;queue();}});
const reference=new T.Group();scene.add(reference);let modelCenter=new T.Vector3();
const refToggle=document.createElement('label');refToggle.innerHTML='<input type="checkbox" id="bulbRef" checked> Ampolleta + origen';document.querySelector('.toolbar').append(refToggle);document.getElementById('bulbRef').onchange=e=>{reference.visible=e.target.checked;draw();};
const ground=new T.Mesh(new T.PlaneGeometry(180,180),new T.MeshBasicMaterial({color:0x67cbd1,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false}));ground.rotation.x=-Math.PI/2;reference.add(ground);reference.add(new T.AxesHelper(40));
fetch('./bulb-reference.json').then(r=>r.json()).then(data=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));g.computeVertexNormals();const bulb=new T.Mesh(g,new T.MeshStandardMaterial({color:0xffc83d,roughness:.5}));reference.add(bulb);draw();}).catch(()=>{$('status').textContent='No se pudo cargar la referencia de ampolleta.';});
const overlays=modelOverlays({scene,draw,getMesh:()=>mesh,bulb:false});
function draw(){const w=$('view').clientWidth,h=$('view').clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const r=(current?Math.max(...current.dimensions):s.size)*Math.max(2.2,1.8/camera.aspect)*zoom;camera.position.set(r*Math.sin(angle)*Math.cos(tilt),r*Math.sin(tilt),r*Math.cos(angle)*Math.cos(tilt));camera.lookAt(0,0,0);renderer.render(scene,camera);}

function appearance(){if(!mesh)return;applyMaterial(mesh,$('mode').value,0xc6bda9,$('ghost').checked);mesh.material.clippingPlanes=$('cut').checked?[plane]:[];for(const child of mesh.children)if(child.isLineSegments)child.material.clippingPlanes=mesh.material.clippingPlanes;draw();}
function queue(){clearTimeout(timer);worker?.terminate();$('export').disabled=true;$('status').textContent='Actualizando geometría…';timer=setTimeout(build,180);}

function build(){worker?.terminate();worker=new Worker(new URL('./worker.mjs?v=3',import.meta.url),{type:'module'});worker.onmessage=({data:m})=>{if(m.error){$('status').textContent=m.error;return;}current=m;const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(m.positions.slice(),3));g.setIndex(new T.BufferAttribute(m.indices,1));g.computeVertexNormals();g.computeBoundingBox();const center=new T.Vector3();g.boundingBox.getCenter(center);g.translate(-center.x,-center.y,-center.z);if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}mesh=new T.Mesh(g,new T.MeshStandardMaterial({color:0xc6bda9,roughness:.7,side:T.DoubleSide}));scene.add(mesh);debugView.update(m,center);overlays.update(center);modelCenter.copy(center);reference.position.copy(center).multiplyScalar(-1);$('stats').textContent=m.dimensions.map(v=>v.toFixed(1)).join(' × ')+' mm · '+(m.indices.length/3).toLocaleString()+' triángulos\n'+(m.volume/1000).toFixed(1)+' cm³ de material';$('status').textContent='Shell continuo: exterior + interior desplazado por normales + borde inferior. '+m.rings+' anillos por superficie. Espesor solicitado: '+s.thickness+' mm. Base desplazada: '+s.offset+' mm. Abertura exterior: '+s.opening+' mm. Vista y STL usan los mismos vertices. Revisar curvas cerradas y espesores en el laminador.';$('export').disabled=false;appearance();worker.terminate();};worker.onerror=()=>{$('status').textContent='No se pudo generar. Reduce la resolución y vuelve a intentar.';};worker.postMessage({...s});}

function preset(values){Object.assign(s,values);for(const [id]of defs){$(id).value=s[id];$(id+'Number').value=s[id];}queue();}

$('compact').onclick=()=>preset({...defaults});$('branches').onclick=()=>preset({bodySteps:48,joinSteps:64,branchSteps:64,radial:144});$('newSeed').onclick=()=>preset({bodySteps:4,joinSteps:4,branchSteps:4,radial:4});
$('mode').onchange=$('cut').onchange=$('ghost').onchange=appearance;$('fit').onclick=()=>{angle=.5;tilt=.18;zoom=1;draw();};$('bottom').onclick=()=>{tilt=-1.35;zoom=1;draw();};

let drag;$('view').onpointerdown=e=>{drag=[e.clientX,e.clientY];$('view').setPointerCapture(e.pointerId);};$('view').onpointermove=e=>{if(!drag)return;angle-=(e.clientX-drag[0])*.008;tilt=Math.max(-1.5,Math.min(1.5,tilt+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw();};$('view').onpointerup=$('view').onpointercancel=()=>drag=null;$('view').onwheel=e=>{e.preventDefault();zoom=Math.max(.4,Math.min(3,zoom*Math.exp(e.deltaY*.001)));draw();};new ResizeObserver(draw).observe($('view'));

function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

$('export').onclick=()=>{if(current)download(new Blob([toSTL(current)],{type:'application/octet-stream'}),'shell-branch-'+s.size+'mm.stl');};$('save').onclick=()=>download(new Blob([JSON.stringify({tool:'Hard Matter Shell branch v1',settings:s},null,2)],{type:'application/json'}),'shell-branch-parametros.json');queue();
