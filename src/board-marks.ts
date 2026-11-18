import * as T from 'three';
const basic=(color:number,opacity:number)=>new T.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false});
// Fixed buffers keep selecting/deselecting out of the geometry/material allocator.
export class BoardMarks{
 private selected:T.Mesh;private tint:T.InstancedMesh;private moveRing:T.InstancedMesh;private attackRing:T.InstancedMesh;private dots:T.InstancedMesh;private crosses:T.LineSegments;private matrix=new T.Matrix4();private rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);
 constructor(readonly group:T.Group){
  this.selected=new T.Mesh(new T.PlaneGeometry(.94,.94),basic(0xe2bc70,.23));this.selected.rotation.x=-Math.PI/2;group.add(this.selected);this.selected.visible=false;
  const pool=(geo:T.BufferGeometry,material:T.Material)=>{const m=new T.InstancedMesh(geo,material,49);m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.count=0;m.frustumCulled=false;group.add(m);return m;};
  this.tint=pool(new T.PlaneGeometry(.9,.9),basic(0xffffff,.18));for(let i=0;i<49;i++)this.tint.setColorAt(i,new T.Color(0xffffff));this.tint.instanceColor!.setUsage(T.DynamicDrawUsage);
  this.moveRing=pool(new T.RingGeometry(.25,.262,40),basic(0xdbc58b,.95));this.attackRing=pool(new T.RingGeometry(.42,.432,48),basic(0xea956b,.95));this.dots=pool(new T.CircleGeometry(.06,16),basic(0xf0d49a,.85));
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(49*12),3).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);this.crosses=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0xffb095,transparent:true,opacity:.95}));this.crosses.frustumCulled=false;group.add(this.crosses);
 }
 update(selected:{x:number;y:number}|undefined,legal:{x:number;y:number;occupied:boolean}[]){
  this.selected.visible=!!selected;if(selected)this.selected.position.set(selected.x-3,.145,selected.y-3);
  this.tint.count=this.moveRing.count=this.attackRing.count=this.dots.count=0;let vertices=0;
  const put=(mesh:T.InstancedMesh,x:number,y:number,h:number)=>{this.matrix.compose(new T.Vector3(x-3,h,y-3),this.rotation,new T.Vector3(1,1,1));mesh.setMatrixAt(mesh.count++,this.matrix);};
  const positions=this.crosses.geometry.getAttribute('position') as T.BufferAttribute;
  for(const p of legal){put(this.tint,p.x,p.y,.162);this.tint.setColorAt(this.tint.count-1,new T.Color(p.occupied?0xe8a175:0xd8c68c));put(p.occupied?this.attackRing:this.moveRing,p.x,p.y,.165);
   if(!p.occupied)put(this.dots,p.x,p.y,.165);else for(const sign of[-1,1])for(const k of[-1,1])positions.setXYZ(vertices++,p.x-3+k*.12,.176,p.y-3-sign*k*.12);
  }
  for(const m of[this.tint,this.moveRing,this.attackRing,this.dots])m.instanceMatrix.needsUpdate=true;this.tint.instanceColor!.needsUpdate=true;positions.needsUpdate=true;this.crosses.geometry.setDrawRange(0,vertices);
 }
}
