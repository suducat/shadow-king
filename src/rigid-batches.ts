import * as T from 'three';
type Pool={mesh:T.InstancedMesh;material:T.Material;used:number;ids:string[]};
// Rigid parts retain their authored articulation and per-actor materials.
// Only opaque draw submissions are combined; individual capture / fade models
// remain ordinary meshes. No hidden identity participates in the grouping.
export class RigidBatches{
 private pools=new Map<string,Pool>();private masked=new Map<T.Mesh,number>();private signatures=new WeakMap<T.Material,string>();private inverse=new T.Matrix4();private matrix=new T.Matrix4();
 constructor(private parent:T.Group,private capacity=16){}
 sync(actors:Iterable<{id:string;model:T.Group;exclude:boolean}>,worldReady=false){
  this.restore();for(const p of this.pools.values()){p.used=0;p.ids=[];p.mesh.visible=false;}
  if(!worldReady)this.parent.updateWorldMatrix(true,false);this.inverse.copy(this.parent.matrixWorld).invert();
  for(const actor of actors){if(actor.exclude)continue;if(!worldReady)actor.model.updateWorldMatrix(true,true);
   actor.model.traverseVisible(o=>{if(!(o instanceof T.Mesh)||o instanceof T.InstancedMesh||Array.isArray(o.material)||!o.visible||o.material.transparent||o.material.opacity<1)return;
    const material=o.material;let signature=this.signatures.get(material);if(!signature){const m=material as T.MeshStandardMaterial;signature=[material.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.map?.uuid,m.bumpMap?.uuid,m.roughnessMap?.uuid,m.envMapIntensity,m.side,m.alphaTest,m.vertexColors,m.wireframe,material.userData.scope].join('/');this.signatures.set(material,signature);}const key=o.geometry.uuid+'/'+signature;
    let p=this.pools.get(key);if(!p){const own=material.clone(),batch=new T.InstancedMesh(o.geometry,own,this.capacity);batch.instanceMatrix.setUsage(T.DynamicDrawUsage);batch.frustumCulled=false;batch.castShadow=o.castShadow;batch.receiveShadow=o.receiveShadow;batch.name='rigid-draw-batch';this.parent.add(batch);p={mesh:batch,material:own,used:0,ids:[]};this.pools.set(key,p);}
    if(p.used>=this.capacity)return;
    this.matrix.multiplyMatrices(this.inverse,o.matrixWorld);p.mesh.setMatrixAt(p.used++,this.matrix);p.ids.push(actor.id);this.masked.set(o,o.layers.mask);o.layers.set(1);
   });
  }
  for(const p of this.pools.values()){p.mesh.matrixWorld.copy(this.parent.matrixWorld);p.mesh.count=p.used;p.mesh.visible=p.used>0;if(p.used)p.mesh.instanceMatrix.needsUpdate=true;}
 }
 // Restore layers before reconciliation / disposal. Geometry and textures are
 // immutable template resources, owned and released by the character cache.
 restore(){for(const[m,mask]of this.masked)m.layers.mask=mask;this.masked.clear();}
 clear(){this.restore();for(const p of this.pools.values()){p.mesh.removeFromParent();p.mesh.dispose();p.material.dispose();}this.pools.clear();}
 get stats(){return{draws:[...this.pools.values()].filter(p=>p.used).length,parts:this.masked.size,instances:[...this.pools.values()].flatMap(p=>p.ids)};}
}
