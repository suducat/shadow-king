import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {BattleEffects} from '../src/battle-effects';

test('the three offering seals wake in order, remain legible with reduced motion, and stay off in classic',()=>{
  const fx=new BattleEffects(new T.Group());
  const state={red:{phase:'open' as const},blue:{phase:'dormant' as const}};
  assert.deepEqual(fx.update('ritual',state,[],[],null,undefined,1000),['rite-open']);
  const seals=fx.altar.children.filter(o=>o.name==='offering-seal');
  const lit=(time:number,reduced=false)=>{
    fx.tick(time,reduced,new Map());
    return seals.map(o=>((o.children[0] as T.Mesh).material as T.MeshBasicMaterial).opacity>.5);
  };
  assert.deepEqual(lit(1148),[true,false,false]);
  assert.deepEqual(lit(1309),[true,true,false]);
  assert.deepEqual(lit(1480),[true,true,true]);
  assert.deepEqual(lit(1000,true),[true,true,true]);
  assert.deepEqual(fx.update('ritual',state,[],[],null,undefined,1500),[]);
  fx.update('classic',undefined,[]);
  assert.equal(fx.altar.visible,false);fx.destroy();
});

test('landing dust stays at the target tile, expires, and is disposed once on cancellation',()=>{
  const root=new T.Group(),fx=new BattleEffects(root);
  fx.land(2,5,0);
  const group=fx.transients[0].group,dust=group.getObjectByName('stone-dust') as T.InstancedMesh;
  assert.equal(dust.count,5);assert.equal(group.position.x,-1);assert.equal(group.position.z,2);
  let releases=0;dust.geometry.addEventListener('dispose',()=>releases++);
  fx.tick(80,false,new Map());assert.equal(group.parent,root);
  fx.tick(200,false,new Map());assert.equal(group.parent,null);
  fx.reset();assert.equal(releases,1);fx.land(1,3,300);fx.reset();
  assert.equal(fx.transients.length,0);fx.destroy();
});

test('a captured occupying king extinguishes its altar without rewriting the pending rule state',()=>{
  const fx=new BattleEffects(new T.Group());
  const rites={red:{phase:'occupied' as const},blue:{phase:'dormant' as const}};
  const king={id:'red-crown',side:'red' as const,role:'king' as const,revealed:true,x:3,y:3};
  fx.update('ritual',rites,[king],[],null,undefined,0);
  assert.deepEqual(fx.update('ritual',rites,[],[],null,undefined,600),['rite-break']);
  fx.tick(2200,false,new Map());assert.equal(fx.light.intensity,0);
  assert.equal(fx.occupied,false);assert.equal(rites.red.phase,'occupied');
  assert.deepEqual(fx.update('ritual',rites,[],[],null,undefined,2300),[]);
  fx.destroy();
});
