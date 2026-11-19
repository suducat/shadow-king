import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {cutFragments} from '../src/cut-fragments';

test('fracture partitions the visible statue exactly once without altering shared geometry',()=>{
 const root=new T.Group(),model=new T.Group();
 root.add(model);root.position.set(2,.4,1);model.position.set(1,.2,-3);
 model.rotation.y=.7;
 const source=new T.BoxGeometry(.7,1.4,.7,3,5,3);
 const statue=new T.Mesh(source,new T.MeshStandardMaterial({color:0x253147}));
 statue.position.y=.74;model.add(statue);
 const hidden=statue.clone();hidden.visible=false;model.add(hidden);
 const before=Array.from(source.index!.array);
 const broken=cutFragments(model,root);
 assert.ok(broken.position.distanceTo(model.position)<1e-6);
 assert.ok(broken.children.length>=3&&broken.children.length<=5);
 let indices=0;
 for(const piece of broken.children as T.Mesh[]){
  assert.notEqual(piece.geometry,source);
  indices+=piece.geometry.index!.count;
  piece.geometry.dispose();
 }
 assert.equal(indices,before.length);
 assert.deepEqual(Array.from(source.index!.array),before);
 assert.equal(model.children.length,2);
});
