import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reserveBlue,expireBlue,advanceDeadline,roomSnapshot,applyCommand,type Room} from '../server/cloudflare/room-state';
import {ritualFixture} from '../src/ritual-qa';
import {type Game,type Side} from '../src/game';
import type {GameAction} from '../src/ritual';

function playing(game:Game):Room{
 const room=newRoom('012345',game.mode??'classic',0);
 reserveBlue(room,0);
 room.game=game;room.stage='playing';room.matchId=crypto.randomUUID();
 return room;
}
function apply(room:Room,side:Side,a:GameAction){
 return applyCommand(room,side,{type:'action',intent:{
  matchId:room.matchId,actionId:crypto.randomUUID(),playerId:room.seats[side]!.playerId,
  turnNumber:room.game!.ply,sequenceNumber:room.game!.ply+1,actionType:a.kind??'move',payload:a,
 }},0,true);
}
test('a seat reservation expires; stale seat tokens cannot authenticate a new reservation',()=>{
 const room=newRoom('012345','classic',0);
 const first=reserveBlue(room,0)!;assert.equal(reserveBlue(room,1),null);
 assert.equal(expireBlue(room,44000),false);assert.equal(expireBlue(room,45000),true);
 assert.notEqual(reserveBlue(room,45000)?.token,first.token);
});
test('server deadline uses the last valid private draft, with exactly one opening',()=>{
 const room=newRoom('012345','ritual',0);
 reserveBlue(room,0);
 applyCommand(room,'red',{type:'ready',value:true},0,true);
 applyCommand(room,'blue',{type:'ready',value:true},0,true);
 const matchId=room.matchId;
 const line=['king','guard','martyr','guard','martyr','guard','martyr'];
 assert.equal(applyCommand(room,'red',{type:'draft',matchId,line},0,true).changed,true);
 assert.equal(advanceDeadline(room,29999),false);
 assert.equal(advanceDeadline(room,30000),true);
 assert.equal(advanceDeadline(room,31000),false);
 assert.equal(room.matchId,matchId);
 assert.equal(roomSnapshot(room,'red',true).game!.pieces.find(p=>p.id==='red-0')!.role,'king');
 assert.equal(roomSnapshot(room,'blue',true).game!.pieces.find(p=>p.id==='red-0')!.role,'unknown');
});
test('authoritative altar response resolves at once while projected boards conceal the remaining private roles',()=>{
 const room=playing(ritualFixture('altar-entry'));
 assert.equal(apply(room,'red',{id:'red-3',x:4,y:4}).changed,true);
 assert.equal(room.game!.ritual!.red.phase,'occupied');
 assert.equal(room.game!.result,null);
 assert.equal(apply(room,'blue',{id:'blue-0',x:1,y:2}).changed,true);
 assert.equal(Object.keys(room.game!.seen).length,1);
 for(const side of ['red','blue'] as const){
  const game=roomSnapshot(room,side,true).game!;
  assert.deepEqual(game.result,{winner:'red',reason:'ritual'});
  assert.equal(game.captures.at(-1)!.role,'guard');
  assert.equal(game.pieces.find(p=>p.id==='red-3')!.role,'king');
  assert.equal(Object.hasOwn(game,'seen'),false);
 }
 assert.equal(apply(room,'red',{id:'red-3',x:4,y:3}).changed,false);
});
test('action envelopes reject identity forgery, old matches and stale sequence numbers before changing state',()=>{
 const room=playing(ritualFixture('altar-entry'));
 const base={matchId:room.matchId,actionId:crypto.randomUUID(),playerId:room.seats.red.playerId,
  turnNumber:room.game!.ply,sequenceNumber:room.game!.ply+1,actionType:'move',payload:{id:'red-3',x:4,y:4}};
 const original=structuredClone(room);
 for(const patch of [{playerId:room.seats.blue!.playerId},{matchId:crypto.randomUUID()},{sequenceNumber:0}]){
  const result=applyCommand(room,'red',{type:'action',intent:{...base,...patch}},0,true);
  assert.equal(result.notice?.type,'error');
  assert.deepEqual(room,original);
 }
});
