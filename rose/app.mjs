import {modelOverlays} from '../model-overlays.mjs?v=1';
import {materials} from '../materials.mjs';
import {structureDebug} from '../structure-debug.mjs?v=9';
import * as T from '../three.module.js';

import {defaults} from './core.mjs?v=5';import {toSTL} from './stl.mjs';

const $=id=>document.getElementById(id),s={...defaults,surfaceEngine:'sections',radial:16,bodySteps:12,joinSteps:4,branchSteps:12,coreSize:160,coreRise:130,baseOpening:70,bodyPear:0,bodyOffset:0};let mesh,current,worker,timer,angle=.5,tilt=.6,zoom=1;

const defs=[['size','Diámetro de referencia · mm',60,180,1],['height','Altura de la rosa · mm',25,70,1],['thickness','Espesor nominal de pétalos · mm',1.2,4,.1],['layers','Capas de pétalos',3,6,1],['petals','Pétalos por corona inicial',4,8,1],['twist','Giro espiral · rad',-.9,.9,.05],['roundness','Redondez del pétalo',0,1,.05],['convergence','Convergencia hacia adentro',0,1,.05],['overlap','Solape entre pétalos',1,1.45,.01],['curl','Labio hacia afuera · mm',1.5,14,.5],['opening','Apertura',.7,1,.05],['seed','Variación',1,999,1],['resolution','Resolución',112,224,16]];

const sectionDefs=[['radial','Alrededor / subdivisiones',4,64,1],['bodySteps','Cuerpo o base / subdivisiones',4,64,1],['joinSteps','Raiz / subdivisiones',4,48,1],['branchSteps','Petalos / subdivisiones',4,64,1]];defs.push(...sectionDefs);for(const [id,title,min,max,step]of defs){const d=document.createElement('div');d.className='parameter';const l=document.createElement('label');l.htmlFor=id;l.textContent=title;const row=document.createElement('div');row.className='row';const a=document.createElement('input'),b=document.createElement('input');Object.assign(a,{id,type:'range',min,max,step,value:s[id]});Object.assign(b,{id:id+'Number',type:'number',min,max,step,value:s[id]});b.setAttribute('aria-label',title+' valor');a.oninput=()=>{s[id]=+a.value;b.value=a.value;queue()};b.onchange=()=>{const v=+b.value;if(!Number.isFinite(v)||v<min||v>max){b.value=s[id];return;}s[id]=v;a.value=v;queue()};row.append(a,b);d.append(l,row);$('controls').append(d);}

const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,2000),renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.localClippingEnabled=true;scene.background=new T.Color('#1c201b');scene.add(new T.HemisphereLight(0xffffff,0x53594c,.65));for(const [x,y,z,power]of [[140,220,180,2],[-160,80,-100,.5]]){const light=new T.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);}const plane=new T.Plane(new T.Vector3(-1,0,0),0);

const applyMaterial=materials(renderer,scene);
const debugView=structureDebug({scene,draw,getMesh:()=>mesh,kind:'rose',onPart:(part,isolate)=>{s.debugPetal=part;s.debugIsolate=isolate;zoom=1;queue();}});
const overlays=modelOverlays({scene,draw,getMesh:()=>mesh,bulb:true});
function draw(){const w=$('view').clientWidth,h=$('view').clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const r=(current?Math.max(...current.dimensions):s.size)*Math.max(2.2,1.8/camera.aspect)*zoom;camera.position.set(r*Math.sin(angle)*Math.cos(tilt),r*Math.sin(tilt),r*Math.cos(angle)*Math.cos(tilt));camera.lookAt(0,0,0);renderer.render(scene,camera);}

function appearance(){if(!mesh)return;applyMaterial(mesh,$('mode').value,0xb82c39);mesh.material.clippingPlanes=$('cut').checked?[plane]:[];for(const child of mesh.children)if(child.isLineSegments)child.material.clippingPlanes=mesh.material.clippingPlanes;draw();}
function queue(){clearTimeout(timer);worker?.terminate();$('export').disabled=true;$('status').textContent='Actualizando geometría…';timer=setTimeout(build,180);}

function build(){worker?.terminate();worker=new Worker(new URL('./worker.mjs?v=sections5',import.meta.url),{type:'module'});worker.onmessage=({data:m})=>{if(m.error){$('status').textContent=m.error;return;}current=m;const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(m.positions.slice(),3));g.setIndex(new T.BufferAttribute(m.indices,1));g.computeVertexNormals();g.computeBoundingBox();const center=new T.Vector3();g.boundingBox.getCenter(center);g.translate(-center.x,-center.y,-center.z);if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}mesh=new T.Mesh(g,new T.MeshStandardMaterial({color:0xb82c39,roughness:.7,side:T.DoubleSide}));scene.add(mesh);debugView.update(m,center);overlays.update(center);$('stats').textContent=m.dimensions.map(v=>v.toFixed(1)).join(' × ')+' mm · '+(m.indices.length/3).toLocaleString()+' triángulos\n'+(m.volume/1000).toFixed(1)+' cm³ de material';$('status').textContent=(s.debugIsolate?'Petalo aislado, sin base. Celda ':'Petalos unidos a una base. Celda ')+m.voxel.toFixed(2)+' mm. '+(m.voxel>s.thickness/2?'Sube resolución para representar mejor las paredes.':'Revisa los voladizos y soportes en el laminador.')+(m.removed?' Se omitieron '+m.removed+' fragmentos desconectados.':'');if(m.sectionMesh)$('status').textContent='Malla por secciones. '+m.components+' componente(s) conectado(s). Subdivisiones reales desde 4; uniones booleanas pueden agregar triangulos. Vista = STL. Espesor nominal: '+s.thickness+' mm.'+(m.components>1?' Hay piezas separadas: revisa el encaje.':'')+(m.filledPockets?' Se sellaron '+m.filledPockets+' microcavidades internas cerradas.':'');$('export').disabled=false;appearance();worker.terminate();};worker.onerror=()=>{$('status').textContent='No se pudo generar. Reduce la resolución y vuelve a intentar.';};worker.postMessage({...s});}

function preset(values){Object.assign(s,values);for(const [id]of defs){$(id).value=s[id];$(id+'Number').value=s[id];}queue();}

$('compact').onclick=()=>preset({...defaults,height:54,curl:4,opening:.85});$('branches').onclick=()=>preset({...defaults,height:40,curl:10,opening:1});$('newSeed').onclick=()=>preset({seed:1+Math.floor(Math.random()*998)});

$('mode').onchange=$('cut').onchange=appearance;$('fit').onclick=()=>{angle=.5;tilt=.6;zoom=1;draw();};$('bottom').onclick=()=>{tilt=1.5;zoom=1;draw();};

let drag;$('view').onpointerdown=e=>{drag=[e.clientX,e.clientY];$('view').setPointerCapture(e.pointerId);};$('view').onpointermove=e=>{if(!drag)return;angle-=(e.clientX-drag[0])*.008;tilt=Math.max(-1.5,Math.min(1.5,tilt+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw();};$('view').onpointerup=$('view').onpointercancel=()=>drag=null;$('view').onwheel=e=>{e.preventDefault();zoom=Math.max(.4,Math.min(3,zoom*Math.exp(e.deltaY*.001)));draw();};new ResizeObserver(draw).observe($('view'));

function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

$('export').onclick=()=>{if(current)download(new Blob([toSTL(current)],{type:'application/octet-stream'}),(s.debugIsolate?'rosa-petalo-'+(s.debugPetal+1)+'-':'rosa-')+s.size+'mm-seed'+s.seed+'.stl');};$('save').onclick=()=>download(new Blob([JSON.stringify({tool:'Hard Matter Rose v1',settings:s},null,2)],{type:'application/json'}),'rosa-parametros.json');queue();


const engineWrap=document.createElement('label');engineWrap.textContent='Construccion ';const engine=document.createElement('select');engine.innerHTML='<option value=sections>Por secciones</option><option value=volume>Anterior / volumen</option>';engineWrap.append(engine);document.querySelector('aside').insertBefore(engineWrap,$('controls'));function showEngine(){for(const id of ["resolution"])$(id).closest('.parameter').hidden=s.surfaceEngine==='sections';for(const [id] of sectionDefs)$(id).closest('.parameter').hidden=s.surfaceEngine==='volume';}engine.onchange=()=>{s.surfaceEngine=engine.value;showEngine();queue();};showEngine();

const low=document.createElement('button');low.textContent='Subdivisiones / todas en 4';low.onclick=()=>preset({radial:4,bodySteps:4,joinSteps:4,branchSteps:4});document.querySelector('.presets').append(low);
