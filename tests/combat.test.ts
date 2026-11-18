import test from 'node:test';import assert from 'node:assert/strict';
import {battleTimeline,sampleBattle,consumeCues,endingTimeline,retirementPose,publicBeats} from '../src/battle-timeline';
import {cueLayers} from '../src/audio';import {ritualFixture} from '../src/ritual-qa';import {act} from '../src/game';
test('attack contact holds the body and weapon; no victim timing depends on FPS',()=>{
 for(const role of ['king','guard','martyr','unknown'] as const){const l=battleTimeline(role,1,false,true);const at=sampleBattle(.58,l,1),held=sampleBattle(.58+l.hold*.9,l,1);assert.deepEqual(at.pose,held.pose);assert.equal(at.travel,held.travel);assert.ok(at.travel>.25&&at.travel<.55);assert.equal(sampleBattle(1,l,1).travel,1);}
});
test('all ordered execution contacts survive sparse frames and repeated calls',()=>{
 for(const fps of [60,15,3,1]){const l=battleTimeline('guard',2,true,true),seen=new Set<number>(),out:string[]=[];for(let time=0;time<=l.duration+1000/fps;time+=1000/fps){for(const{cue}of consumeCues(l.cues,seen,Math.min(1,time/l.duration)))out.push(`${cue.kind}/${cue.index}`);}assert.deepEqual(out,['release/undefined','dash/undefined','impact/0','disclose/0','impact/1','disclose/1','plant/undefined','recover/undefined']);assert.equal(consumeCues(l.cues,seen,1).length,0);}
});
test('execution leaves room for the blade at each contact and settles at the endpoint',()=>{
 const l=battleTimeline('guard',2,true,true);l.contacts.forEach((c,i)=>{const s=sampleBattle(c,l,2);assert.equal(s.index,i);assert.ok(Math.abs(s.travel-.48)<1e-10);});assert.equal(sampleBattle(1,l,2).travel,1);
});
test('public capture beats use only kernel output, never reveal a hidden attacker',()=>{
 const g=ritualFixture('execute-open'),before=structuredClone(g),next=act(g,{id:'red-0',x:3,y:1,kind:'execute'});const beats=publicBeats(next,g.captures.length,next.lastAction!.steps);assert.deepEqual(g,before);assert.ok(beats.captures.length);assert.deepEqual(beats.reveals.map(b=>b.role),['king']);assert.ok(beats.reveals.every(b=>b.id!=='red-0'));assert.ok(beats.captures.every(b=>next.captures.includes(b.capture)));
});
test('retirement silhouettes differ without scaling the entire figure',()=>{
 const poses=['king','guard','martyr','unknown'].map(r=>retirementPose(r as 'king',.6));assert.ok(poses[0].crownLift>0);assert.ok(poses[1].heave<poses[0].heave);assert.ok(poses[2].sealScale<.5);assert.equal(poses[3].crownLift,0);
});
test('reduced motion disables all articulated combat and retirement motion',()=>{
 for(const role of ['king','guard','martyr','unknown'] as const){const l=battleTimeline(role,2,true,true,false,true);assert.equal(l.hold,0);assert.equal(sampleBattle(.5,l,2).pose.heave,0);assert.equal(sampleBattle(.5,l,2).pose.weaponPitch,0);assert.equal(retirementPose(role,.7,true).heave,0);}
});
test('ending clocks have unique ordered climaxes and no repeated cues after skip',()=>{
 for(const reason of ['king','guard','martyr','ritual']){const l=endingTimeline(reason),seen=new Set<number>();assert.equal(l.cues.filter(c=>c.kind==='climax').length,1);assert.equal(consumeCues(l.cues,seen,1).length,l.cues.length);assert.equal(consumeCues(l.cues,seen,1).length,0);}assert.equal(endingTimeline('guard').cues.filter(c=>c.kind==='seal').length,3);
});
test('impact sound layers are bounded and opaque profile is identity independent',()=>{
 for(const role of ['king','guard','martyr','unknown']){const l=cueLayers(`battle-${role}-impact`);assert.ok(l.some(x=>x.noise)&&l.some(x=>!x.noise));assert.ok(l.length<=5&&l.every(x=>x.gain<=.25&&x.duration<=1.2));}assert.notDeepEqual(cueLayers('battle-guard-impact'),cueLayers('battle-martyr-impact'));
});
test('plant marks the first grounded frame at the destination for every visible mover',()=>{
 for(const role of ['guard','king','martyr','unknown'] as const){
  for(const reduced of [false,true]){
   const l=battleTimeline(role,1,false,false,false,reduced),plant=l.cues.find(c=>c.kind==='plant')!.at;
   assert.ok(sampleBattle(plant-.001,l,1).travel<1);
   assert.equal(sampleBattle(plant,l,1).travel,1);
   assert.equal(sampleBattle(plant,l,1).lift,0);
   assert.equal(sampleBattle(.4,l,1).lift>0,!reduced);
  }
 }
});
