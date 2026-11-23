import {act,createGame,other,positionKey,ROLES,startGame,viewFor,type Game,type Role,type Side} from '../../src/game';
import {DEPLOYMENT_MS,ROOM_TTL,SEAT_RESERVATION_MS,type CourtSnapshot,type CourtIntent,type CourtNotice} from '../../src/court-protocol';
import type {GameMode} from '../../src/ritual';

export type Seat={playerId:string;token:string;socketId?:string;reservedUntil?:number};
export type Room={
 code:string;rule:GameMode;expires:number;revision:number;seats:{red:Seat;blue?:Seat};
 ready:Record<Side,boolean>;rematch:Record<Side,boolean>;deployment:Record<Side,boolean>;
 stage:'waiting'|'deploying'|'playing';deploymentUntil?:number;matchId:string;
 game:Game|null;lastTurn:CourtIntent|null;accepted:Partial<Record<Side,CourtIntent>>;
};
const seats=['red','blue'] as const;
const flags=()=>({red:false,blue:false});
export const newSeat=():Seat=>({playerId:crypto.randomUUID(),token:[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('')});
export function newRoom(code:string,rule:GameMode,now:number):Room{
 return {code,rule,expires:now+ROOM_TTL,revision:0,seats:{red:newSeat()},ready:flags(),rematch:flags(),
  deployment:flags(),stage:'waiting',matchId:'',game:null,lastTurn:null,accepted:{}};
}
export function expireBlue(room:Room,now:number){
 if(room.seats.blue?.reservedUntil&&room.seats.blue.reservedUntil<=now){delete room.seats.blue;room.ready=flags();return true;}
 return false;
}
export function reserveBlue(room:Room,now:number){
 if(room.seats.blue)return null;
 return room.seats.blue={...newSeat(),reservedUntil:now+SEAT_RESERVATION_MS};
}
function startDeployment(room:Room,now:number){
 const draft=createGame(room.rule);
 for(const side of seats){
  const roles=[...ROLES];
  for(let i=roles.length-1;i>0;i--){
   const j=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/2**32*(i+1));
   [roles[i],roles[j]]=[roles[j],roles[i]];
  }
  assignLine(draft,side,roles);
 }
 room.stage='deploying';room.deploymentUntil=now+DEPLOYMENT_MS;room.game=draft;room.matchId=crypto.randomUUID();
 room.deployment=flags();room.rematch=flags();room.accepted={};room.lastTurn=null;
}
function startPlay(room:Room){
 room.game=startGame(room.game!);room.stage='playing';delete room.deploymentUntil;
}
export function advanceDeadline(room:Room,now:number){
 if(room.stage!=='deploying'||now<(room.deploymentUntil??Infinity))return false;
 startPlay(room);return true;
}
function assignLine(game:Game,side:Side,roles:Role[]){
 for(const piece of game.pieces){
  if(piece.side!==side)continue;
  piece.role=roles[piece.x];
  delete piece.executionUsed;
  if(game.mode==='ritual'&&piece.role==='guard')piece.executionUsed=false;
 }
}
const isLine=(value:unknown):value is Role[]=>Array.isArray(value)&&value.length===7&&
 (['king','guard','martyr'] as const).every(role=>value.filter(item=>item===role).length===(role==='king'?1:3));
const record=(value:unknown)=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const actionId=(value:unknown):value is string=>typeof value==='string'&&/^[\da-f-]{36}$/i.test(value);
export function applyCommand(room:Room,side:Side,command:unknown,now:number,bothOnline:boolean):{changed:boolean;notice?:CourtNotice}{
 const error=(message:string,id?:string)=>({changed:false,notice:{type:'error' as const,message,actionId:id}});
 if(!record(command))return error('无效消息。');
 const message=command as Record<string,unknown>;
 if(message.type==='ready'&&room.stage==='waiting'&&bothOnline&&typeof message.value==='boolean'){
  room.ready[side]=message.value;
  if(room.ready.red&&room.ready.blue)startDeployment(room,now);
  return {changed:true};
 }
 if((message.type==='deployment'||message.type==='draft')&&room.stage==='deploying'&&message.matchId===room.matchId&&!room.deployment[side]&&isLine(message.line)){
  assignLine(room.game!,side,message.line);
  if(message.type==='deployment')room.deployment[side]=true;
  if(room.deployment.red&&room.deployment.blue)startPlay(room);
  return {changed:true};
 }
 if(message.type==='rematch'&&room.stage==='playing'&&room.game?.result&&message.matchId===room.matchId&&bothOnline){
  room.rematch[side]=true;
  if(room.rematch.red&&room.rematch.blue)startDeployment(room,now);
  return {changed:true};
 }
 if(message.type!=='action'||!record(message.intent))return error('当前不能执行此操作。');
 const i=message.intent as CourtIntent;
 const game=room.game;
 if(!actionId(i.actionId)||i.playerId!==room.seats[side]?.playerId||i.matchId!==room.matchId)return error('对局或席位无效。',actionId(i.actionId)?i.actionId:undefined);
 const acknowledge=(intent:CourtIntent,changed:boolean)=>({changed,notice:{type:'ack' as const,actionId:intent.actionId,sequenceNumber:intent.sequenceNumber}});
 const previous=room.accepted[side];
 if(previous?.actionId===i.actionId)return acknowledge(previous,false);
 if(room.stage!=='playing'||!game||game.result||!bothOnline||i.turnNumber!==game.ply||i.sequenceNumber!==game.ply+1)
  return error('回合已变化或对方暂离，请重试。',i.actionId);
 let next:Game,intent:CourtIntent;
 if(i.actionType==='resign'&&i.payload===null){
  next={...game,result:{winner:other(side),reason:'resign'}};
  intent={...i,payload:null};
 }else{
  const a=i.payload;
  if(game.turn!==side||!a||!record(a)||typeof a.id!=='string'||!/^((red)|(blue))-[0-6]$/.test(a.id)||
   !Number.isInteger(a.x)||!Number.isInteger(a.y)||a.x<0||a.x>6||a.y<0||a.y>6||
   !['move','charge','execute'].includes(i.actionType)||(a.kind??'move')!==i.actionType)
   return error('走法或回合无效。',i.actionId);
  const action={id:a.id,x:a.x,y:a.y,...(i.actionType==='move'?{}:{kind:i.actionType})};
  next=act(game,action);
  if(next===game)return error('此走法不合法。',i.actionId);
  // A capture permanently changes inventory. Earlier positions cannot recur.
  // Keep only the current animation's rule events in the persisted snapshot.
  if(next.captures.length!==game.captures.length)next.seen={[positionKey(next)]:1};
  if(next.events)next.events=next.events.filter(event=>event.ply===next.ply);
  intent={...i,payload:action};
 }
 const {matchId,actionId:op,playerId,turnNumber,sequenceNumber,actionType,payload}=intent;
 const saved={matchId,actionId:op,playerId,turnNumber,sequenceNumber,actionType,payload};
 room.game=next;room.lastTurn=saved;room.accepted[side]=saved;
 return acknowledge(saved,true);
}
export function roomSnapshot(room:Room,side:Side,online:boolean):CourtSnapshot{
 let game:CourtSnapshot['game']=null;
 if(room.game){
  const {seen:_,pieces:__,...publicState}=room.game;
  game={...publicState,pieces:viewFor(room.game,side)};
 }
 return {type:'state',revision:room.revision,serverNow:Date.now(),rule:room.rule,stage:room.stage==='waiting'&&online?'ready':room.stage,
  matchId:room.matchId,game,lastTurn:room.lastTurn,ready:room.ready[side],otherReady:room.ready[other(side)],
  opponentConnected:online,deploymentUntil:room.deploymentUntil,deploymentLocked:room.deployment[side],
  rematchRequested:room.rematch[side],opponentRematch:room.rematch[other(side)]};
}
