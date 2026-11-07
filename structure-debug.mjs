import * as T from './three.module.js';
export function structureDebug({scene,draw,getMesh,onPart,kind}){
 const panel=document.createElement('fieldset');panel.style.cssText='margin:16px 0;padding:12px;border:1px solid #66706a;font-size:12px;line-height:1.7';
 panel.innerHTML=`<legend>ESTRUCTURA / DEBUG</legend><label><input type="checkbox" id="debugShow"> Mostrar organizacion</label><br><label><input type="checkbox" id="debugOnly"> Solo estructura</label><p style="font-size:11px">Cian: ejes. Amarillo: huella de sombreros / petalo seleccionado. Violeta: coronas / nucleo. Guias de construccion, no simulacion temporal.</p>${kind==='rose'?'<label>Petalo <select id="debugPart"></select></label><br><label><input id="debugIsolate" type="checkbox"> Aislar este petalo (recalcula)</label><p>Ejes locales: rojo radial, verde altura, azul tangente. Secciones a 0%, 48%, 78% y 90% de altura. La base se oculta al aislar.</p>':''}<label><input type="checkbox" id="debugGrid"> Celda de muestreo junto al origen</label><p id="debugInfo"></p>`;
 if(kind==='shell'){panel.querySelector('p').textContent='Violeta: cuerpo. Amarillo: union. Cian: rama y punta. Ejes RGB en el origen. Guias de la superficie exterior.';elPlaceholder();}function elPlaceholder(){panel.querySelector('#debugGrid').parentElement.style.display='none';}
 document.querySelector('aside').insertBefore(panel,document.getElementById('controls'));
 const el=id=>panel.querySelector('#'+id);let group,grid,latest,center;
 function visibility(){if(group)group.visible=el('debugShow').checked||el('debugOnly').checked;if(grid)grid.visible=el('debugGrid').checked;const mesh=getMesh();if(mesh)mesh.visible=!el('debugOnly').checked;draw();}
 for(const id of ['debugShow','debugOnly','debugGrid'])el(id).onchange=()=>{if(id==='debugGrid'&&el(id).checked)el('debugShow').checked=true;visibility();};
 if(kind==='rose'){el('debugPart').onchange=()=>onPart(+el('debugPart').value,el('debugIsolate').checked);el('debugIsolate').onchange=()=>{el('debugShow').checked=true;onPart(+el('debugPart').value,el('debugIsolate').checked);};}
 function line(points,color){const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const o=new T.Line(g,new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));o.renderOrder=20;group.add(o);}
 function update(m,c){latest=m;center=c;if(group){scene.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}group=new T.Group();group.position.copy(c).multiplyScalar(-1);scene.add(group);const d=m.debug;if(!d)return;el('debugGrid').parentElement.style.display=(m.sectionMesh||kind==='shell')?'none':'';
 for(const l of d.lines)line(l.points,l.color);
 const origin=d.origin||[0,0,0],a=d.phase||0,L=12;
 line([origin,[origin[0]+L*Math.cos(a),origin[1],origin[2]+L*Math.sin(a)]],0xff5555);
 line([origin,[origin[0],origin[1]+L,origin[2]]],0x66ee88);
 line([origin,[origin[0]-L*Math.sin(a),origin[1],origin[2]+L*Math.cos(a)]],0x6688ff);
 const dot=new T.Mesh(new T.SphereGeometry(1,8,6),new T.MeshBasicMaterial({color:0xffffff,depthTest:false}));dot.position.set(...origin);dot.renderOrder=21;group.add(dot);
 const box=new T.EdgesGeometry(new T.BoxGeometry(m.voxel,m.voxel,m.voxel));grid=new T.LineSegments(box,new T.LineBasicMaterial({color:0xffffff,depthTest:false}));grid.position.set(...origin);grid.renderOrder=22;group.add(grid);
 el('debugInfo').textContent='Origen: '+origin.map(x=>x.toFixed(1)).join(', ')+' mm. '+((kind==='shell'||m.sectionMesh)?'':('Celda: '+m.voxel.toFixed(2)+' mm. '))+'Ejes: 12 mm. Las guias no se exportan al STL.';
 if(kind==='rose'){el('debugPart').replaceChildren(...d.parts.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.label;return o;}));el('debugPart').value=d.selected;}
 visibility();
 }
 return {update};
}
