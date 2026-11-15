import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {cellToWorld,worldToCell,clientToNDC,intersectBoard,bodyPickMesh} from '../src/interaction.ts';
test('all 49 cell centers map bijectively; borders never round into the board',()=>{
 for(let y=0;y<7;y++)for(let x=0;x<7;x++)assert.deepEqual(worldToCell(cellToWorld(x,y)),{x,y});
 assert.equal(worldToCell(new T.Vector3(3.5,.14,0)),null);
 assert.equal(worldToCell(new T.Vector3(-3.501,.14,0)),null);
});
test('NDC uses canvas CSS bounds, independent of drawing-buffer DPR, offsets or CSS scale',()=>{
 for(const scale of [.75,1,1.25]){
  const r={left:117,top:93,width:800*scale,height:600*scale};
  assert.deepEqual(clientToNDC(r.left+r.width/2,r.top+r.height/2,r)?.toArray(),[0,0]);
  assert.deepEqual(clientToNDC(r.left,r.top,r)?.toArray(),[-1,1]);
  assert.equal(clientToNDC(r.left-1,r.top,r),null);
 }
 assert.equal(clientToNDC(0,0,{left:0,top:0,width:0,height:0}),null);
});
test('four rotations and three zooms pick all 49 exact grid centers',()=>{
 for(const angle of [.55,.55+Math.PI/2,.55+Math.PI,.55+Math.PI*1.5])for(const zoom of [.8,1,1.25]){
  const camera=new T.PerspectiveCamera(36,1.2,.1,100),d=14.7/zoom;
  camera.position.set(Math.sin(angle)*d*.78,d*.83,Math.cos(angle)*d*.78);camera.lookAt(0,-.05,0);camera.updateMatrixWorld(true);
  const ray=new T.Raycaster();
  for(let y=0;y<7;y++)for(let x=0;x<7;x++){
   const p=cellToWorld(x,y).project(camera);ray.setFromCamera(new T.Vector2(p.x,p.y),camera);
   assert.deepEqual(intersectBoard(ray.ray),{x,y});
  }
 }
});
test('body silhouette is ray-pickable without any decorative lines or inflated collider',()=>{
 const p=bodyPickMesh();p.position.set(0,.18,3);p.updateMatrixWorld(true);
 const camera=new T.PerspectiveCamera(36,1.2,.1,100);camera.position.set(6,12,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const ray=new T.Raycaster(),center=new T.Vector3(0,.8,3).project(camera);
 ray.setFromCamera(new T.Vector2(center.x,center.y),camera);assert.ok(ray.intersectObject(p,false).length);
 const beside=new T.Vector3(.55,.8,3).project(camera);ray.setFromCamera(new T.Vector2(beside.x,beside.y),camera);assert.equal(ray.intersectObject(p,false).length,0);
 p.geometry.dispose();(p.material as T.Material).dispose();
});
