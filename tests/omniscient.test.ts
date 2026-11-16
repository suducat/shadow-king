import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,startGame,act,allActions,viewFor,other,type Game,type Side,type Role} from '../src/game';
import {observe,decide,sanitizeObservation,deploy,random,type StandardDifficulty} from '../src/ai';
import {opponentPolicy} from '../src/omniscient-ai';import {strategicFixture} from './ai-v05-fixtures';
const budget={nodeBudget:5000,maxMillis:500};
const swap=(g:Game,a:string,b:string):Game=>{const A=g.pieces.find(p=>p.id===a)!,B=g.pieces.find(p=>p.id===b)!;return{...g,pieces:g.pieces.map(p=>p.id===a?{...p,role:B.role}:p.id===b?{...p,role:A.role}:p)};};
function keep(g:Game,side:Side,role:Role,id?:string){const removed=g.pieces.filter(p=>p.side===side&&p.role===role&&p.id!==id);g.pieces=g.pieces.filter(p=>!removed.includes(p));g.captures.push(...removed.map(p=>({side,role,by:other(side),ply:1,at:'A1'})));}
const put=(g:Game,id:string,x:number,y:number)=>{g.pieces=g.pieces.map(p=>p.id===id?{...p,x,y}:p);};
test('explicit omniscient observation grants real identities without revealing or changing public events',()=>{
 for(const mode of ['classic','ritual'] as const){const g=startGame(createGame(mode)),before=JSON.stringify(g),visible=viewFor(g,'red'),o=observe(g,'blue',[],'omniscient');assert.deepEqual(o.pieces.map(p=>p.role),g.pieces.map(p=>p.role));assert.equal(o.knowledge,'omniscient');assert.deepEqual(o.repetition,g.seen);assert.equal(JSON.stringify(g),before);assert.deepEqual(viewFor(g,'red'),visible);assert.ok(viewFor(g,'red').filter(p=>p.side==='blue').every(p=>p.role==='unknown'));
  const clean=observe(g,'blue');assert.equal(clean.knowledge,undefined);assert.equal(clean.repetition,undefined);assert.ok(clean.pieces.filter(p=>p.side==='red').every(p=>p.role==='unknown'));assert.deepEqual(sanitizeObservation(o),clean);
 }
});
test('four original tiers cannot retain injected omniscience; permission is mandatory for fifth tier',()=>{
 const g=startGame(createGame()),truth=observe(g,'red',[],'omniscient'),clean=observe(g,'red');
 for(const d of ['easy','normal','hard','master'] as StandardDifficulty[])assert.deepEqual(decide(truth,d,{maxMillis:Infinity,nodeBudget:200,seed:5}).action,decide(clean,d,{maxMillis:Infinity,nodeBudget:200,seed:5}).action);
 assert.throws(()=>decide(clean,'omniscient'),/显式/);
});
test('identity permutations change an informed capture decision but leave ordinary input identical',()=>{
 const g=createGame();keep(g,'blue','martyr','blue-1');put(g,'red-0',0,3);put(g,'blue-1',0,2);put(g,'blue-3',6,0);const a=startGame(g),b=startGame(swap(g,'blue-1','blue-3'));
 assert.deepEqual(observe(a,'red'),observe(b,'red'));
 const A=decide(observe(a,'red',[],'omniscient'),'omniscient',budget),B=decide(observe(b,'red',[],'omniscient'),'omniscient',budget);
 assert.ok(!(A.action?.x===0&&A.action?.y===2));assert.equal(B.action?.id,'red-0');assert.equal(act(b,B.action!).result?.reason,'king');
});
test('simulated player policy cannot see the AI hidden identities or private repetition keys',()=>{
 const a=startGame(createGame('ritual'));put(a,'red-0',3,3);put(a,'blue-0',3,2);const b=swap(a,'blue-0','blue-1');const A=observe(a,'red'),B=observe(b,'red');assert.deepEqual(A,B);assert.deepEqual(opponentPolicy(A),opponentPolicy(B));
 const injected=observe(a,'red',[],'omniscient');assert.deepEqual(opponentPolicy(injected),opponentPolicy(A));
});
for(const mode of ['classic','ritual'] as const){
 test(`${mode}: exact regicide, last-guard win, and last-martyr risk`,()=>{
  for(const target of ['king','guard','martyr'] as const){const g=createGame(mode);keep(g,'blue',target,target==='king'?'blue-3':target==='guard'?'blue-0':'blue-1');put(g,'red-0',0,3);put(g,target==='king'?'blue-3':target==='guard'?'blue-0':'blue-1',0,2);if(target==='martyr'){put(g,'blue-3',3,3);g.pieces=g.pieces.map(p=>p.side==='blue'&&p.role==='guard'?{...p,revealed:true}:p);}
   const d=decide(observe(startGame(g),'red',[],'omniscient'),'omniscient',budget);assert.ok(d.action);const n=act(g,d.action!);assert.notEqual(n,g);if(target!=='martyr')assert.equal(n.result?.winner,'red');else if(mode==='classic')assert.notEqual(n.result?.winner,'blue');
  }
 });
 test(`${mode}: unique action preventing an immediate king loss is retained before pruning`,()=>{
  const g=createGame(mode);put(g,'red-3',0,3);put(g,'blue-0',0,2);put(g,'blue-2',1,4);put(g,'blue-3',1,2);put(g,'red-0',1,3);put(g,'red-2',0,4);
  g.pieces=g.pieces.map(p=>p.side==='red'&&p.role==='guard'?{...p,executionUsed:true}:p);
  // King is boxed by its own pieces; only its guard can remove the threat.
  const safe=allActions(g).filter(a=>{const n=act(g,a);return n.result?.winner!=='blue'&&!allActions(n).some(b=>act(n,b).result?.winner==='blue');});assert.equal(safe.length,1);
  const d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.deepEqual(d.action,safe[0]);
 });
}
test('ritual ready execution and full-response rite wins use the unchanged rule engine',()=>{
 for(const name of ['H','I','B'] as const){const g=strategicFixture(name),d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.ok(d.action);assert.notEqual(act(g,d.action!),g);if(name!=='B')assert.equal(act(g,d.action!).result?.winner,'red');}
 const g=createGame('ritual');put(g,'red-0',0,3);put(g,'blue-0',0,2);put(g,'blue-3',0,1);g.pieces=g.pieces.map(p=>p.id==='red-0'?{...p,revealed:true,charging:{readyPly:0}}:p);const d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.equal(d.action?.kind,'execute');assert.equal(act(g,d.action!).result?.winner,'red');
});
test('deadline fallback remains legal, with independent deployments and no mutation',()=>{
 for(const mode of ['classic','ritual'] as const)for(const side of ['red','blue'] as Side[]){let g=createGame(mode);for(const s of ['red','blue'] as Side[]){const row=deploy(s,'omniscient',random(617+(s==='red'?1:2)));let i=0;g.pieces=g.pieces.map(p=>p.side===s?{...p,x:row[i++]}:p);}g.turn=side;g=startGame(g);const before=JSON.stringify(g),d=decide(observe(g,side,[],'omniscient'),'omniscient',{maxMillis:1,nodeBudget:40});assert.ok(d.action);assert.notEqual(act(g,d.action!),g);assert.equal(JSON.stringify(g),before);}
});
test('informed tactics use transmitted roles, independent of piece ID conventions and deployment columns',()=>{
 const g=createGame();put(g,'red-0',5,3);put(g,'blue-3',5,2);const ids=new Map(g.pieces.map((p,i)=>[p.id,`opaque-token-${97-i*3}`]));g.pieces=g.pieces.map(p=>({...p,id:ids.get(p.id)!}));const d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.equal(d.action?.id,ids.get('red-0'));assert.equal(act(g,d.action!).result?.winner,'red');
});
test('charged guard, completed response and independent skill use stay observable without mutating reveal state',()=>{
 const g=createGame('ritual');put(g,'blue-3',3,3);keep(g,'blue','martyr');g.pieces=g.pieces.map(p=>p.id==='blue-3'?{...p,revealed:true}:p);g.ritual!.blue={phase:'occupied',openedPly:2,occupiedPly:3};g.ply=3;put(g,'red-0',3,4);const before=JSON.stringify(g),d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.equal(act(g,d.action!).result?.winner,'red');assert.equal(JSON.stringify(g),before);
});
test('an uncontested altar occupation is proved through every complete opposing response',()=>{
 const g=createGame('ritual');keep(g,'red','martyr');put(g,'red-3',3,3);g.ritual!.red={phase:'open',openedPly:1};g.ply=4;const d=decide(observe(g,'red',[],'omniscient'),'omniscient',budget);assert.ok(d.action);const n=act(g,d.action!);assert.equal(n.ritual!.red.phase,'occupied');assert.ok(allActions(n).every(a=>act(n,a).result?.winner==='red'));
});
