import test from 'node:test';import assert from 'node:assert/strict';
import {battleCues,pathProgress} from '../src/battle-timeline';
test('execution cues remain ordered and include both hits even on a single final frame',()=>{
 const cues=battleCues(2,true,true);assert.deepEqual(cues.map(c=>c.kind),['release','dash','impact','impact','recover']);assert.ok(cues.every((c,i)=>!i||c.at>=cues[i-1].at));assert.deepEqual(cues.filter(c=>c.kind==='impact').map(c=>c.index),[0,1]);assert.deepEqual(pathProgress(1,2,true),{index:1,t:1});
});
test('execution has a release hold, full dash and recovery hold at the endpoint',()=>{
 assert.deepEqual(pathProgress(.1,2,true),{index:0,t:0});assert.deepEqual(pathProgress(.9,2,true),{index:1,t:1});assert.equal(battleCues(1,true,true).filter(c=>c.kind==='impact').length,1);assert.deepEqual(battleCues(1,false,false).map(c=>c.kind),['plant','recover']);
});
