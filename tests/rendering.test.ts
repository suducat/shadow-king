import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {renderResolution} from '../src/render-resolution';import {RigidBatches} from '../src/rigid-batches';
test('Retina board uses native density and bounded physical pixels, independently of detail',()=>{
 for(const q of ['low','medium','high'] as const){const r=renderResolution(390,410,2,q);assert.equal(r.ratio,2);assert.equal(r.width,780);assert.equal(r.height,820);}
 assert.equal(renderResolution(900,610,2,'medium').ratio,2);assert.equal(renderResolution(900,610,3,'high').width,2429);
 const huge=renderResolution(3000,2000,3,'medium');assert.ok(huge.width*huge.height<=2500000);assert.equal(renderResolution(900,610,.65,'medium').ratio,.65);
});
function world(){const parent=new T.Group(),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({color:0x123456}),actors=Array.from({length:7},(_,i)=>{const model=new T.Group(),part=new T.Mesh(geometry,material.clone());part.name='arm';model.position.set(i,0,0);model.add(part);parent.add(model);return{id:String(i),model,part,exclude:false};});return{parent,geometry,actors};}
test('seven articulated copies submit one draw and retain exact world transforms',()=>{
 const{parent,actors}=world(),b=new RigidBatches(parent);actors[2].part.rotation.x=.4;b.sync(actors);assert.equal(b.stats.draws,1);assert.equal(b.stats.parts,7);const batch=parent.children.find(c=>c instanceof T.InstancedMesh) as T.InstancedMesh,m=new T.Matrix4();batch.getMatrixAt(2,m);assert.ok(m.elements.every((n,i)=>Math.abs(n-actors[2].part.matrixWorld.elements[i])<1e-6));assert.ok(actors.every(a=>a.part.layers.mask===2));b.clear();assert.ok(actors.every(a=>a.part.layers.mask===1));
});
test('victim remains an independent mesh, changing poses updates instances without node churn',()=>{
 const{parent,actors}=world(),b=new RigidBatches(parent);b.sync(actors);actors[0].exclude=true;actors[1].model.position.y=.5;b.sync(actors);assert.equal(b.stats.draws,1);assert.equal(b.stats.parts,6);assert.equal(actors[0].part.layers.mask,1);const batch=parent.children.find(c=>c instanceof T.InstancedMesh) as T.InstancedMesh;assert.equal(batch.count,6);actors[0].exclude=false;b.sync(actors);assert.equal(b.stats.parts,7);assert.equal(parent.children.filter(c=>c instanceof T.InstancedMesh).length,1);b.clear();
});
test('different colors cannot share a material and instance teardown never releases character geometry',()=>{
 const{parent,geometry,actors}=world(),b=new RigidBatches(parent);let disposed=0;geometry.addEventListener('dispose',()=>disposed++);(actors[0].part.material as T.MeshStandardMaterial).color.set(0xff0000);b.sync(actors);assert.equal(b.stats.draws,2);b.clear();assert.equal(disposed,0);assert.equal(parent.children.length,7);
});
import {BoardMarks} from '../src/board-marks';
test('100 selection changes reuse highlight buffers and encode attack/move shapes separately',()=>{
 const group=new T.Group(),marks=new BoardMarks(group),geometries=group.children.map(c=>(c as T.Mesh).geometry);for(let i=0;i<100;i++)marks.update({x:3,y:3},[{x:3,y:2,occupied:true},{x:4,y:3,occupied:false}]);assert.deepEqual(group.children.map(c=>(c as T.Mesh).geometry),geometries);assert.equal((group.children[1] as T.InstancedMesh).count,2);assert.equal((group.children[2] as T.InstancedMesh).count,1);assert.equal((group.children[3] as T.InstancedMesh).count,1);marks.update(undefined,[]);assert.equal(group.children[0].visible,false);assert.equal((group.children[1] as T.InstancedMesh).count,0);
});
test('hidden groups are never resurrected by batching',()=>{const{parent,actors}=world(),b=new RigidBatches(parent);actors[0].model.visible=false;b.sync(actors);assert.equal(b.stats.parts,6);assert.ok(!b.stats.instances.includes('0'));b.clear();});
