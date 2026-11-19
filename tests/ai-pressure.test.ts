import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, startGame, act} from '../src/game';
import {decide, observe, type PublicAction} from '../src/ai';
import {inferIdentities} from '../src/belief';

function rush(mode:'classic'|'ritual'){
 let game=startGame(createGame(mode));
 const history:PublicAction[]=[];
 for(const [id,x,y] of [
  ['red-2',2,5],['blue-1',1,1],['red-2',2,4],['blue-1',1,2],
  ['red-0',0,5],['blue-1',1,3],['red-0',0,6],['blue-1',1,4],
 ] as const){
  const p=game.pieces.find(p=>p.id===id)!;
  const next=act(game,{id,x,y});
  assert.notEqual(game,next);
  history.push({id,side:p.side,from:{x:p.x,y:p.y},to:{x,y}});
  game=next;
 }
 return {game,history};
}

for(const mode of ['classic','ritual'] as const){
 test(mode+' public history distinguishes a rushing offer from sheltered back-rank pieces',()=>{
  const {game,history}=rush(mode),o=observe(game,'red',history);
  const b=inferIdentities(o).marginals;
  assert.ok(b['blue-1'].martyr>.75);
  assert.ok(b['blue-3'].king>b['blue-1'].king);
  assert.ok(b['blue-3'].guard>b['blue-1'].guard);
  assert.ok(b['blue-1'].king>0);
 });
 for(const level of ['hard','master'] as const){
  test(mode+' '+level+' contests the center instead of accepting the isolated rush',()=>{
   const {game,history}=rush(mode);
   const a=decide(observe(game,'red',history),level,{seed:42,maxMillis:Infinity}).action!;
   assert.ok(a.x>=2&&a.x<=4&&a.y>=2&&a.y<=4,JSON.stringify(a));
   assert.ok(!act(game,a).captures.length);
  });
 }
}

for(const level of ['hard','master','omniscient'] as const){
 test(level+' opens with a central screen from either side',()=>{
  for(const side of ['red','blue'] as const){
   const g=createGame();
   g.turn=side;
   const o=observe(g,side,[],level==='omniscient'?'omniscient':undefined);
   const a=decide(o,level,{seed:42,nodeBudget:5000,maxMillis:Infinity}).action!;
   assert.equal(g.pieces.find(p=>p.id===a.id)?.role,'martyr');
   assert.ok(a.x>=2&&a.x<=4);
   assert.equal(a.y,side==='red'?5:1);
  }
 });
}
