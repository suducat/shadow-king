import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,startGame,act,allActions,type Game,type Side} from '../src/game';
import {observe,decide,random,type Difficulty} from '../src/ai';
import {ritualHypothesis} from '../src/ritual-ai';
import {resolveRitual} from '../src/ritual';
import {ritualFixture} from '../src/ritual-qa';
const levels:Difficulty[]=['easy','normal','hard','master'];
for(const level of levels){
 test(`ritual ${level}: 60 evolving legal actions, no reused execution token`,()=>{
  let g=startGame(createGame('ritual'));let releases=0;for(let i=0;i<60;i++){
   if(g.result)g=startGame(createGame('ritual'));const before=g,decision=decide(observe(g,g.turn),level,{seed:31+i,nodeBudget:600,maxMillis:Infinity}),a=decision.action!;assert.ok(a);assert.ok(allActions(g).some(m=>JSON.stringify(m)===JSON.stringify(a)));
   g=act(g,a);assert.notEqual(g,before);if(a.kind==='execute'){releases++;assert.equal(before.pieces.find(p=>p.id===a.id)!.executionUsed,false);assert.equal(g.pieces.find(p=>p.id===a.id)!.executionUsed,true);}
   for(const p of g.pieces)if(before.pieces.find(q=>q.id===p.id)?.executionUsed)assert.equal(p.executionUsed,true);
  }assert.ok(releases>=0);
 });
 test(`ritual ${level}: hidden permutations do not affect observation/seeded decision`,()=>{
  for(const side of ['red','blue'] as Side[]){const g=startGame(createGame('ritual'));g.turn=side;const hidden=g.pieces.filter(p=>p.side!==side).map(p=>p.role).reverse();let i=0;
   const altered={...g,seen:{'SECRET ROLES':99},pieces:g.pieces.map(p=>p.side!==side?{...p,role:hidden[i++]}:p)};
   const a=observe(g,side),b=observe(altered,side);assert.deepEqual(a,b);const opts={seed:67,nodeBudget:600,maxMillis:Infinity};assert.deepEqual(decide(a,level,opts).action,decide(b,level,opts).action);
   for(const p of a.pieces.filter(p=>p.side!==side))assert.ok(!('executionUsed'in p)&&!('charging'in p));
  }
 });
}
test('public identities and independent execution-used flags survive hypotheses',()=>{
 const g=ritualFixture('ready'),o=observe(g,'blue'),h=ritualHypothesis(o,random(9));assert.equal(h.pieces.find(p=>p.id==='red-0')!.role,'guard');assert.equal(h.pieces.find(p=>p.id==='red-0')!.executionUsed,false);for(const s of ['red','blue'] as Side[])for(const role of ['king','guard','martyr'])assert.equal(h.pieces.filter(p=>p.side===s&&p.role===role).length,g.pieces.filter(p=>p.side===s&&p.role===role).length);
});
test('hard/master use legal two-step execution to capture a PUBLIC king',()=>{
 for(const level of ['hard','master'] as Difficulty[]){const g=ritualFixture('ai-execution'),d=decide(observe(g,'blue'),level,{seed:77,nodeBudget:3000,maxMillis:Infinity});assert.equal(d.action?.kind,'execute');assert.equal(d.action?.y,4);assert.deepEqual(act(g,d.action!).result,{winner:'blue',reason:'king'});}
});
test('simulation and actual resolution share pieces, captures, rites, path and timing',()=>{
 const rng=random(611);let g=startGame(createGame('ritual'));for(let i=0;i<250;i++){
  if(g.result)g=startGame(createGame('ritual'));const legal=allActions(g),a=legal[Math.floor(rng()*legal.length)],real=act(g,a),sim=resolveRitual(g,a,true);
  for(const key of ['pieces','captures','ritual','ply','turn','quiet','lastAction'] as const)assert.deepEqual(sim[key],real[key]);if(real.result?.reason!=='repetition')assert.deepEqual(sim.result,real.result);g=real;
 }
});
test('development ritual fixtures have unique, in-bounds cells and exact public inventories',()=>{
 for(const name of ['charge','ready','empty','one-step','opening','counter','ai-execution','edge','execute-open','purge','single'] as const){const g=ritualFixture(name);assert.equal(new Set(g.pieces.map(p=>`${p.x}/${p.y}`)).size,g.pieces.length);assert.ok(g.pieces.every(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<7));for(const side of ['red','blue'] as Side[])for(const role of ['king','guard','martyr'])assert.equal(g.pieces.filter(p=>p.side===side&&p.role===role).length+g.captures.filter(c=>c.side===side&&c.role===role).length,role==='king'?1:3);}
});
test('V0.4 all four AI tiers reject short execution around a second-cell ally',()=>{
 const original=ritualFixture('one-step');for(const level of levels){const d=decide(observe(original,'red'),level,{seed:51,nodeBudget:600,maxMillis:Infinity});assert.ok(d.action);assert.notEqual(d.action!.kind,'execute');assert.notEqual(act(original,d.action!),original);}
});
