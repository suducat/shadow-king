import * as T from 'three';

// Bake the visible statue into five independently moving stone pieces. Only
// public meshes enter this snapshot. Geometry and materials belong to the FX.
export function cutFragments(model:T.Group,root:T.Group){
 model.updateWorldMatrix(true,true);
 const origin=root.worldToLocal(model.getWorldPosition(new T.Vector3()));
 const frame=new T.Matrix4().makeTranslation(-origin.x,-origin.y,-origin.z)
  .multiply(root.matrixWorld.clone().invert());
 const buckets=Array.from({length:5},()=>({vertices:[] as number[],colors:[] as number[],indices:[] as number[]}));
 model.traverseVisible(mesh=>{
  if(!(mesh instanceof T.Mesh)||Array.isArray(mesh.material))return;
  const geometry=mesh.geometry,points=geometry.getAttribute('position'),idx=geometry.index;
  const matrix=frame.clone().multiply(mesh.matrixWorld),v=new T.Vector3();
  const positions=new Float32Array(points.count*3);
  for(let i=0;i<points.count;i++)v.fromBufferAttribute(points,i).applyMatrix4(matrix).toArray(positions,i*3);
  const remaps=buckets.map(()=>new Map<number,number>());
  const color=mesh.material.color as T.Color;
  const count=idx?.count??points.count;
  for(let i=0;i<count;i+=3){
   const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
   const x=(positions[3*a]+positions[3*b]+positions[3*c])/3;
   const y=(positions[3*a+1]+positions[3*b+1]+positions[3*c+1])/3;
   const height=y+.55*x;
   const k=height<.22?0:height<.78?(x>0?1:2):(height>1.13?4:3);
   const bucket=buckets[k],remap=remaps[k];
   for(const vertex of [a,b,c]){
    let index=remap.get(vertex);
    if(index===undefined){
     index=bucket.vertices.length/3;remap.set(vertex,index);
     bucket.vertices.push(positions[3*vertex],positions[3*vertex+1],positions[3*vertex+2]);
     bucket.colors.push(color.r,color.g,color.b);
    }
    bucket.indices.push(index);
   }
  }
 });
 const group=new T.Group();group.position.copy(origin);
 const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.62,side:T.DoubleSide,transparent:true,depthWrite:false});
 for(const [i,b] of buckets.entries()){
  if(!b.indices.length)continue;
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(b.vertices,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(b.colors,3));
  geo.setIndex(b.indices);geo.computeVertexNormals();geo.computeBoundingBox();
  const pivot=geo.boundingBox!.getCenter(new T.Vector3());
  geo.translate(-pivot.x,-pivot.y,-pivot.z);
  const part=new T.Mesh(geo,mat);part.name='cut-fragment';part.userData.pivot=pivot;
  part.userData.band=i;part.position.copy(pivot);group.add(part);
 }
 return group;
}
