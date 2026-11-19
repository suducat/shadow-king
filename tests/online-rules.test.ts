import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createGame,other,type Game,type Side} from '../src/game';
import {type GameAction} from '../src/ritual';
import {commitment,deployment,verifyOpenings,projectRoles,resolveOnline,disclosures,publicPosition,settleRepetition,repetitionMatches,ownPosition,type Opening} from '../src/online-rules';
import {ritualFixture} from '../src/ritual-qa';
import {fixture} from '../src/qa';

function compare(game:Game,action:GameAction){
 const mover=game.turn,defender=other(mover);
 const roles=(side:Side)=>new Map(game.pieces.filter(p=>p.side===side).map(p=>[p.id,p.role]));
 const view=(side:Side)=>projectRoles(game,side,roles(side));
 const proof=(id:string):Opening=>({id,role:game.pieces.find(p=>p.id===id)!.role,salt:''});
 const defending=resolveOnline(view(defender),action,defender,roles(defender),action.kind==='charge'?[proof(action.id)]:[]);
 const publicIds=disclosures(defending.before,defending.next);
 const actual=act({...game,seen:{}},action);
 const attacking=resolveOnline(view(mover),action,mover,roles(mover),publicIds.map(proof));
 for(const next of [attacking.next,defending.next]){
  assert.deepEqual(next.result,actual.result);
  assert.deepEqual(next.lastAction,actual.lastAction);
  assert.deepEqual(next.captures,actual.captures);
  assert.deepEqual(next.ritual,actual.ritual);
  assert.deepEqual(next.events,actual.events);
  assert.equal(publicPosition(next),publicPosition(actual));
 }
 return publicIds;
}

test('salted deployment binds one king, three guards and three martyrs without publishing roles',async()=>{
 const d=await deployment('test-match','blue');
 assert.equal(d.openings.filter(p=>p.role==='king').length,1);
 assert.equal(d.openings.filter(p=>p.role==='guard').length,3);
 const proof=d.openings[0];
 assert.deepEqual(await verifyOpenings('test-match',[proof],d.hashes,1),[proof]);
 await assert.rejects(verifyOpenings('another-match',[proof],d.hashes,1));
 await assert.rejects(verifyOpenings('test-match',[{...proof,role:proof.role==='king'?'guard':'king'}],d.hashes,1));
 assert.equal(await commitment('test-match',proof),d.hashes[proof.id]);
 assert.equal(Object.values(d.hashes).every(v=>v.length===64),true);
});

test('both projections use the original classic capture and endgame adjudication',()=>{
 for(const kind of ['capture','king','guard','martyr'] as const){
  const g=fixture(kind,'guard'),mover=g.pieces.find(p=>p.side==='red'&&p.y===3)!;
  assert.equal(compare(g,{id:mover.id,x:3,y:2}).length,1);
 }
});

test('ritual charge, double execution, altar opening and answering turns agree',()=>{
 compare(ritualFixture('charge'),{id:'red-0',x:3,y:3,kind:'charge'});
 compare(ritualFixture('ready'),{id:'red-0',x:3,y:1,kind:'execute'});
 compare(ritualFixture('ai-execution'),{id:'blue-0',x:3,y:4,kind:'execute'});
 assert.ok(compare(ritualFixture('execute-open'),{id:'red-0',x:3,y:1,kind:'execute'}).includes('blue-3'));
 compare(ritualFixture('counter'),{id:'red-0',x:5,y:4});
 const g=ritualFixture('opening');
 const next=act(g,{id:'red-0',x:3,y:2});
 compare(next,{id:'blue-3',x:3,y:3});
});

test('a non-guard or an out-of-turn owner cannot use an online skill',()=>{
 const g=createGame('ritual');
 assert.throws(()=>resolveOnline(g,{id:'blue-0',x:0,y:1},'blue',new Map()));
 assert.throws(()=>resolveOnline(g,{id:'red-1',x:1,y:6,kind:'charge'},'blue',new Map()));
});

test('threefold draw requires both sides to match the same prior turns',()=>{
 const game=createGame(),history=new Map([0,4,8].map(ply=>[ply,{publicKey:publicPosition(game),ownKey:ownPosition(game,'red')}]));
 const matches=repetitionMatches({...game,ply:12},'red',history);
 assert.deepEqual(matches,[0,4,8]);
 assert.equal(settleRepetition(game,[0,4],[4,8]).result,null);
 assert.deepEqual(settleRepetition(game,[0,4],[0,4,8]).result,{winner:null,reason:'repetition'});
});
