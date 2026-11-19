import type {DataConnection,Peer as PeerInstance} from 'peerjs';
import {other,type Game,type Role,type Side} from './game';
import type {GameAction,GameMode} from './ritual';
import {
 deployment,disclosures,initialOnline,isCommitments,ownPosition,publicPosition,repetitionMatches,
 resolveOnline,settleRepetition,verifyOpenings,type Commitments,type Opening,
} from './online-rules';

const protocol=1,gameVersion='0.8.1';
const namespace='shadow-king-summons-v1-';
const failure='邀约未能建立，请重试。';
const invalid='密令无效或已失效。';
const full='此局已有执棋者。';
const absent='对方暂离王庭';
const identifier=()=>crypto.randomUUID();
const code=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');
type State={stage:'opening'|'waiting'|'connecting'|'ready'|'playing'|'error';code:string;side:Side;ready:boolean;otherReady:boolean;starting:boolean;message:string;pending:boolean};
type Packet=Record<string,unknown>;
type Turn={match:string;ply:number;op:string;side:Side;action:GameAction};
type Pending={turn:Turn;next?:Game;matches?:number[]};
export type TurnDisplay={action:GameAction|null;before:Game;next:Game};

function actionFrom(value:unknown):GameAction{
 const a=value as Partial<GameAction>|null;
 if(!a||typeof a.id!=='string'||!/^(red|blue)-[0-6]$/.test(a.id)||
 !Number.isInteger(a.x)||!Number.isInteger(a.y)||a.x!<0||a.x!>6||a.y!<0||a.y!>6||
 ![undefined,'move','charge','execute'].includes(a.kind))throw new Error('非法操作');
 return {id:a.id,x:a.x!,y:a.y!,...(a.kind?{kind:a.kind}:{})};
}

function sameAction(a:GameAction,b:GameAction){
 return a.id===b.id&&a.x===b.x&&a.y===b.y&&(a.kind??'move')===(b.kind??'move');
}

export class CourtSession{
 private peer?:PeerInstance;
 private channel?:DataConnection;
 private peerGeneration=0;
 private closed=false;
 private failed=false;
 private timer?:ReturnType<typeof setTimeout>;
 private heartbeat?:ReturnType<typeof setInterval>;
 private lastSignal=0;
 private mailbox=Promise.resolve();
 private match='';
 private offer='';
 private secrets:Opening[]=[];
 private roles=new Map<string,Role>();
 private hashes:Commitments={};
 private remoteHashes:Commitments={};
 private game?:Game;
 private wait?:Pending;
 private history=new Map<number,{publicKey:string;ownKey:string}>();
 private localReady=false;
 private remoteReady=false;
 state:State;

 constructor(private rule:GameMode,side:Side,secret:string,private publish:(s:State)=>void,
  private onStart:(g:Game,side:Side)=>void,private onTurn:(turn:TurnDisplay)=>void){
  this.state={stage:side==='red'?'opening':'connecting',code:secret,side,ready:false,otherReady:false,starting:false,message:'',pending:false};
 }
 private update(next:Partial<State>){this.state={...this.state,...next};if(!this.closed)this.publish(this.state);}
 private arm(message=failure){
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.fail(message),18_000);
 }
 private fail(message:string){
  if(this.closed||this.failed)return;
  this.failed=true;
  this.update({stage:'error',message,pending:false,starting:false});
  this.release();
 }
 private release(){
  clearTimeout(this.timer);clearInterval(this.heartbeat);
  this.channel?.close();this.peer?.destroy();
  this.channel=undefined;this.peer=undefined;
  this.wait=undefined;this.secrets=[];this.roles.clear();this.history.clear();this.game=undefined;
 }
 close(){
  if(this.active&&this.channel?.open){try{this.send({type:'bye'});}catch{/* heartbeat covers abrupt closure */}}
  this.closed=true;this.release();
 }
 private get active(){return !this.closed&&!this.failed;}
 private send(payload:Packet){
  if(!this.active||!this.channel?.open)throw new Error(absent);
  this.channel.send(payload);
 }
 async open(){
  this.update({});this.arm();
  try{
   const {default:Peer}=await import('peerjs');
   const signal=import.meta.env.MODE==='test'&&import.meta.env.VITE_PEER_TEST_PORT?
    {host:'127.0.0.1',port:Number(import.meta.env.VITE_PEER_TEST_PORT),path:'/',secure:false,config:{iceServers:[]}}:
    {secure:true};
   if(!this.active)return;
   let attempts=0;
   const allocate=()=>{
    const host=this.state.side==='red',generation=++this.peerGeneration;
    const room=host?code():this.state.code;
    const peer=host?new Peer(namespace+room,signal):new Peer(signal);
    this.peer=peer;
    peer.on('open',()=>{
     if(!this.active||generation!==this.peerGeneration)return;
     if(host){clearTimeout(this.timer);this.update({stage:'waiting',code:room});}
     else{this.arm();this.attach(peer.connect(namespace+room,{reliable:true,serialization:'json'}));}
    });
    peer.on('connection',channel=>{
     if(!this.active||generation!==this.peerGeneration){channel.close();return;}
     if(!host||this.channel){
      const reject=()=>{channel.send({type:'reject',reason:'full'});setTimeout(()=>channel.close(),500);};
      if(channel.open)reject();else channel.once('open',reject);
      return;
     }
     this.attach(channel);
    });
    peer.on('error',error=>{
     if(!this.active||generation!==this.peerGeneration)return;
     if(host&&error.type==='unavailable-id'&&++attempts<12){
      ++this.peerGeneration;peer.destroy();allocate();return;
     }
     if(this.channel?.open&&['network','disconnected','server-error','socket-error','socket-closed','peer-unavailable'].includes(error.type))return;
     this.fail(error.type==='peer-unavailable'?invalid:failure);
    });
    peer.on('disconnected',()=>{if(this.active&&!this.channel?.open)this.fail(failure);});
   };
   allocate();
  }catch{this.fail(failure);}
 }
 private attach(channel:DataConnection){
  this.channel=channel;this.arm();this.lastSignal=Date.now();
  const disconnected=()=>{if(this.channel===channel)this.fail(this.match?absent:failure);};
  let openedOnce=false;
  const opened=()=>{
   if(!this.active||this.channel!==channel||openedOnce)return;
   openedOnce=true;
   this.heartbeat=setInterval(()=>{
    if(Date.now()-this.lastSignal>22_000){disconnected();return;}
    try{this.send({type:'ping'});}catch{disconnected();}
   },6_000);
   if(this.state.side==='blue')this.send({type:'hello',protocol,gameVersion,rule:this.rule});
  };
  channel.on('open',opened);
  channel.on('close',disconnected);
  channel.on('error',disconnected);
  channel.on('data',data=>{
   this.mailbox=this.mailbox.then(async()=>{
    if(!this.active||this.channel!==channel)return;
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('无效邀约消息');
    this.lastSignal=Date.now();
    await this.receive(data as Packet);
   }).catch(e=>this.fail(this.game?`对局已暂停：${e instanceof Error?e.message:'同步中断'}`:failure));
  });
  if(channel.open)opened();
 }
 private async initialize(){
  const result=await deployment(this.match,this.state.side);
  if(!this.active)return;
  this.secrets=result.openings;this.hashes=result.hashes;
  this.roles=new Map(this.secrets.map(p=>[p.id,p.role]));
 }
 private readyRoom(){
  clearTimeout(this.timer);
  this.update({stage:'ready',message:'应邀者已至'});
 }
 toggleReady(){
  if(this.state.stage!=='ready'||this.state.starting)return;
  this.localReady=!this.localReady;
  this.update({ready:this.localReady});
  try{this.send({type:'ready',value:this.localReady});this.propose();}catch{this.fail(failure);}
 }
 private propose(){
  if(this.state.side!=='red'||this.offer||!this.localReady||!this.remoteReady)return;
  this.offer=identifier();
  this.update({starting:true});
  this.arm();
  this.send({type:'start-offer',offer:this.offer});
 }
 private start(){
  if(this.game)return;
  clearTimeout(this.timer);
  this.game=initialOnline(this.rule,this.state.side,this.roles);
  this.record(this.game);
  this.update({stage:'playing',starting:false,message:'棋局启幕'});
  this.onStart(this.game,this.state.side);
 }
 async play(action:GameAction){
  const game=this.game,side=this.state.side;
  if(!this.active||!game||game.result||this.wait||game.turn!==side)return;
  // Queue local intents with network messages so asynchronous proof checks
  // cannot interleave with a second intent.
  this.mailbox=this.mailbox.then(()=>{
   if(!this.active||this.game!==game||this.wait)return;
   action=actionFrom(action);
   resolveOnline(game,action,side,this.roles);
   const turn:Turn={match:this.match,ply:game.ply,op:`${this.match}/${game.ply}`,side,action};
   this.wait={turn};
   this.update({pending:true});this.arm(absent);
   this.send({type:'action',...turn,proofs:action.kind==='charge'?this.proofs([action.id]):[]});
  }).catch(e=>this.fail(e instanceof Error?e.message:absent));
 }
 resign(){
  this.mailbox=this.mailbox.then(()=>{
   const game=this.game;
   if(!this.active||!game||game.result||this.wait||game.turn!==this.state.side)return;
   this.send({type:'resign',match:this.match,ply:game.ply,side:this.state.side});
   this.resigned(game,this.state.side);
  }).catch(()=>this.fail(absent));
 }
 private resigned(game:Game,side:Side){
  const next:Game={...game,result:{winner:other(side),reason:'resign'}};
  this.game=next;this.onTurn({before:game,next,action:null});
 }
 private proofs(ids:string[]){
  return ids.map(id=>{
   const proof=this.secrets.find(p=>p.id===id);
   if(!proof)throw new Error('缺少公开身份凭据');
   return proof;
  });
 }
 private turn(m:Packet,side:Side):Turn|null{
  const game=this.game!;
  if(m.match!==this.match||m.side!==side||!Number.isInteger(m.ply)||m.op!==`${this.match}/${m.ply}`)throw new Error('操作编号无效');
  if(Number(m.ply)<game.ply)return null;
  if(m.ply!==game.ply||side!==game.turn||game.result)throw new Error('回合不同步');
  return {match:this.match,ply:game.ply,op:m.op as string,side,action:actionFrom(m.action)};
 }
 private matches(m:Packet,next:Game):number[]{
  if(!Array.isArray(m.matches))throw new Error('无效重复局面');
  const unique=new Set<number>(),key=publicPosition(next);
  for(const ply of m.matches){
   if(!Number.isInteger(ply)||unique.has(ply)||this.history.get(ply)?.publicKey!==key)throw new Error('无效重复局面');
   unique.add(ply);
  }
  return [...unique];
 }
 private record(game:Game){this.history.set(game.ply,{publicKey:publicPosition(game),ownKey:ownPosition(game,this.state.side)});}
 private apply(before:Game,next:Game,action:GameAction){
  this.game=next;this.wait=undefined;clearTimeout(this.timer);
  this.record(next);this.update({pending:false});
  this.onTurn({before,next,action});
 }
 private async receive(m:Packet){
  if(m.type==='ping'){this.send({type:'pong'});return;}
  if(m.type==='pong')return;
  if(m.type==='bye'){this.fail(absent);return;}
  if(m.type==='reject'){this.fail(m.reason==='full'?full:m.reason==='rule'?'双方所选规则不同。请返回选择相同规则。':'游戏版本不一致，请刷新后重试。');return;}
  const side=this.state.side,enemy=other(side);
  if(m.type==='hello'&&side==='red'&&!this.match){
   const reason=m.protocol!==protocol||m.gameVersion!==gameVersion?'version':m.rule!==this.rule?'rule':null;
   if(reason){this.send({type:'reject',reason});const rejected=this.channel;this.channel=undefined;
    clearTimeout(this.timer);clearInterval(this.heartbeat);
    setTimeout(()=>rejected?.close(),500);
    return;}
   this.match=identifier();await this.initialize();if(!this.active)return;
   this.send({type:'welcome',match:this.match,protocol,gameVersion,rule:this.rule,hashes:this.hashes});
   return;
  }
  if(m.type==='welcome'&&side==='blue'&&!this.match){
   if(typeof m.match!=='string'||!/^[\da-f-]{36}$/.test(m.match)||m.protocol!==protocol||m.gameVersion!==gameVersion||m.rule!==this.rule||!isCommitments(m.hashes,enemy))throw new Error('邀约协议不符');
   this.match=m.match;this.remoteHashes=m.hashes;await this.initialize();if(!this.active)return;
   this.send({type:'enroll',match:this.match,hashes:this.hashes});this.readyRoom();return;
  }
  if(m.type==='enroll'&&side==='red'&&this.state.stage==='waiting'&&m.match===this.match&&isCommitments(m.hashes,enemy)){
   this.remoteHashes=m.hashes;this.readyRoom();return;
  }
  if(this.state.stage==='ready'){
   if(m.type==='ready'&&typeof m.value==='boolean'){
    this.remoteReady=m.value;this.update({otherReady:m.value});this.propose();return;
   }
   if(m.type==='start-offer'&&side==='blue'&&typeof m.offer==='string'&&!this.offer){
    if(!this.localReady||!this.remoteReady){this.send({type:'start-decline',offer:m.offer});return;}
    this.offer=m.offer;this.update({starting:true});this.arm();
    this.send({type:'start-ack',offer:this.offer});return;
   }
   if(m.type==='start-decline'&&side==='red'&&this.offer&&m.offer===this.offer){
    this.offer='';clearTimeout(this.timer);this.update({starting:false});this.propose();return;
   }
   if(m.type==='start-ack'&&side==='red'&&this.offer&&m.offer===this.offer){
    this.send({type:'begin',offer:this.offer});this.start();return;
   }
   if(m.type==='begin'&&side==='blue'&&this.offer&&m.offer===this.offer){this.start();return;}
  }
  const game=this.game;
  if(!game)throw new Error('棋局尚未开始');
  if(m.type==='resign'){
   if(game.result)return;
   if(m.match!==this.match||m.ply!==game.ply||m.side!==enemy||game.turn!==enemy||this.wait)throw new Error('弃局时回合不同步');
   this.resigned(game,enemy);return;
  }
  if(m.type==='action'){
   const turn=this.turn(m,enemy);if(!turn)return;
   if(this.wait){if(this.wait.turn.op===turn.op)return;throw new Error('上一步尚未确认');}
   const proof=await verifyOpenings(this.match,m.proofs,this.remoteHashes,1);if(!this.active)return;
   const charge=turn.action.kind==='charge';
   if(charge?(proof.length!==1||proof[0].id!==turn.action.id||proof[0].role!=='guard'):proof.length!==0)throw new Error('技能身份不符');
   const {before,next}=resolveOnline(game,turn.action,side,this.roles,proof);
   const matches=repetitionMatches(next,side,this.history);
   this.wait={turn,next,matches};this.arm(absent);
   this.send({type:'resolved',...turn,proofs:this.proofs(disclosures(before,next)),matches});
   return;
  }
  if(m.type==='resolved'){
   const turn=this.turn(m,side);if(!turn)return;
   if(this.wait?.turn.op!==turn.op||this.wait.next||!sameAction(turn.action,this.wait.turn.action))throw new Error('无待确认操作');
   const action=this.wait.turn.action;
   const proofs=await verifyOpenings(this.match,m.proofs,this.remoteHashes,3);if(!this.active)return;
   const {before,next}=resolveOnline(game,action,side,this.roles,proofs);
   const disclosed=disclosures(before,next);
   if(disclosed.length!==proofs.length||proofs.some(p=>!disclosed.includes(p.id)))throw new Error('公开身份与走法不符');
   const matches=repetitionMatches(next,side,this.history);
   const settled=settleRepetition(next,matches,this.matches(m,next));
   this.send({type:'commit',...turn,action,matches,result:settled.result});
   // Render the board that preceded public disclosures, so the existing
   // battle timeline decides exactly when the opponent's identity appears.
   this.apply(game,settled,action);
   return;
  }
  if(m.type==='commit'){
   const turn=this.turn(m,enemy);if(!turn)return;
   const pending=this.wait;
   if(!pending?.next||pending.turn.op!==turn.op||!sameAction(turn.action,pending.turn.action))throw new Error('无待提交操作');
   const next=settleRepetition(pending.next,pending.matches!,this.matches(m,pending.next));
   const result=m.result as Game['result'];
   if((next.result?.winner??null)!==(result?.winner??null)||next.result?.reason!==result?.reason)throw new Error('胜负状态不同步');
   this.apply(game,next,pending.turn.action);
   return;
  }
  throw new Error('无效邀约状态');
 }
}
