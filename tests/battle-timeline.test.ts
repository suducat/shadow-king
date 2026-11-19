import test from 'node:test';import assert from 'node:assert/strict';
import {battleCues,pathProgress} from '../src/battle-timeline';
test('execution cues remain ordered and include both hits even on a single final frame',()=>{
 const cues=battleCues(2,true,true);assert.deepEqual(cues.map(c=>c.kind),['release','dash','impact','disclose','impact','disclose','plant','recover']);assert.ok(cues.every((c,i)=>!i||c.at>=cues[i-1].at));assert.deepEqual(cues.filter(c=>c.kind==='impact').map(c=>c.index),[0,1]);assert.deepEqual(pathProgress(1,2,true),{index:1,t:1});
});
test('execution has a release hold, full dash and recovery hold at the endpoint',()=>{
 assert.deepEqual(pathProgress(.1,2,true),{index:0,t:0});assert.deepEqual(pathProgress(.9,2,true),{index:1,t:1});assert.equal(battleCues(1,true,true).filter(c=>c.kind==='impact').length,1);assert.deepEqual(battleCues(1,false,false).map(c=>c.kind),['plant','recover']);
});
test('a drawn blade crosses the middle cell without winding up or decelerating again',async()=>{
 const {battleTimeline,sampleBattle,drawStart,drawSpan}=await import('../src/battle-timeline');
 const line=battleTimeline('guard',2,true,true);
 const sample=(fraction:number)=>sampleBattle(drawStart+drawSpan*fraction,line,2);
 assert.equal(sampleBattle(drawStart-.02,line,2).travel,0);
 const left=sample(.49),right=sample(.51);
 assert.ok(Math.abs((right.index+right.travel)-(left.index+left.travel)-.04)<1e-8);
 assert.deepEqual(left.pose,right.pose);
 assert.deepEqual(sample(.3).pose,sample(.8).pose);
 assert.ok(drawSpan*line.duration<=240);
});
